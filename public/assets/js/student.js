// public/assets/js/student.js
import { supabase, getProfile } from './supabaseClient.js';

const resourceGrid = document.getElementById('resourceGrid');
const searchBar = document.getElementById('searchBar');
const filterSubject = document.getElementById('filterSubject');
const filterType = document.getElementById('filterType');
const progressList = document.getElementById('progressList');
const timetableEl = document.getElementById('timetable');
const calendarEl = document.getElementById('calendar');
const ereportEl = document.getElementById('ereport');

document.getElementById('logoutBtn').addEventListener('click', async ()=> {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
});

let profile;
async function init(){
  const { data: user } = await supabase.auth.getUser();
  if (!user || !user.user) { window.location.href = '/login.html'; return; }
  profile = await getProfile(user.user.id);
  document.getElementById('studentName').innerText = profile.full_name || 'Student';

  const { data: subjects } = await supabase.from('subjects').select('*');
  filterSubject.innerHTML += subjects.map(s => `<option value="${s.id}">${s.subject_name}</option>`).join('');

  await loadResources();
  await loadProgress();
  await loadTimetable();
  await loadCalendar();
  await loadEreport();
}
init();

async function loadResources(){
  const { data, error } = await supabase.from('resources').select('id,title,description,file_path,file_type,storage_bucket,subject_id,created_at').order('created_at',{ascending:false});
  if (error) return console.error(error);

  const term = (searchBar.value || '').toLowerCase();
  const subj = filterSubject.value;
  const type = filterType.value;

  const filtered = data.filter(r => {
    if (subj && r.subject_id !== subj) return false;
    if (type && (type === 'pdf' ? r.file_type === 'pdf' : r.file_type === type)) {
      if (type !== '' && r.file_type !== type) return false;
    }
    if (term && !(r.title.toLowerCase().includes(term) || (r.description||'').toLowerCase().includes(term))) return false;
    return true;
  });

  resourceGrid.innerHTML = filtered.map(r => {
    return `<div class="card">
      <div class="flex" style="justify-content:space-between">
        <strong>${r.title}</strong>
        <span class="pill">${r.file_type}</span>
      </div>
      <div class="muted small">${new Date(r.created_at).toLocaleString()}</div>
      <p>${r.description || ''}</p>
      <div class="flex">
        <button class="btn" onclick="viewResource('${r.id}')">View</button>
        <button class="btn" onclick="downloadResource('${r.id}')">Download</button>
      </div>
    </div>`;
  }).join('');
}

searchBar.addEventListener('input', loadResources);
filterSubject.addEventListener('change', loadResources);
filterType.addEventListener('change', loadResources);

// Progress: compute average progress per subject
async function loadProgress(){
  const { data: subjects } = await supabase.from('subjects').select('*');
  let html = '';
  for (const s of subjects){
    // count resources for subject (only videos & pdfs as per requirement)
    const { data: resources } = await supabase.from('resources').select('id').in('file_type', ['video','pdf']).eq('subject_id', s.id);
    const total = resources.length;
    if (total === 0) continue;
    // get progress records for this student on these resources
    const ids = resources.map(r=>r.id);
    const { data: progress } = await supabase.from('resource_progress').select('resource_id,progress').in('resource_id', ids).eq('student_id', profile.id);
    // build a map
    const map = {};
    progress.forEach(p => map[p.resource_id] = p.progress);
    // sum up percentages for resources (missing -> 0)
    let sum = 0;
    for (const r of resources){ sum += (map[r.id] ?? 0); }
    const percent = Math.round(sum / total);
    html += `<div style="margin-bottom:0.6rem"><strong>${s.subject_name}</strong><div class="muted small">${percent}% complete (${sum}/${total*100})</div>
      <div style="height:10px;background:rgba(255,255,255,0.06);border-radius:6px;margin-top:6px"><div style="width:${percent}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:6px"></div></div></div>`;
  }
  progressList.innerHTML = html || '<div class="muted">No progress yet. Start viewing resources to track progress.</div>';
}

// Timetable: show weekly timetable for student's enrolled subjects
async function loadTimetable(){
  // fetch enrollments
  const { data: enrolls } = await supabase.from('enrollments').select('subject_id');
  const subjectIds = enrolls.map(e=>e.subject_id);
  if (!subjectIds.length) { timetableEl.innerHTML = '<div class="muted">No timetable entries. Enroll in subjects.</div>'; return; }
  const { data: entries } = await supabase.from('timetable').select('id,subject_id,day_of_week,start_time,end_time,venue,subject:subjects(subject_name)').in('subject_id', subjectIds).order('day_of_week');
  if (!entries || entries.length===0) { timetableEl.innerHTML = '<div class="muted">No timetable scheduled.</div>'; return; }
  let html = '<table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Venue</th></tr></thead><tbody>';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  entries.forEach(e=>{
    html += `<tr><td>${days[e.day_of_week]}</td><td>${e.start_time.slice(0,5)} - ${e.end_time.slice(0,5)}</td><td>${e.subject.subject_name}</td><td>${e.venue||'-'}</td></tr>`;
  });
  html += '</tbody></table>';
  timetableEl.innerHTML = html;
}

// Calendar: list upcoming events
async function loadCalendar(){
  const now = new Date().toISOString();
  const { data } = await supabase.from('calendar_events').select('*').gte('end_ts', now).order('start_ts',{ascending:true}).limit(10);
  if (!data || data.length===0) { calendarEl.innerHTML = '<div class="muted">No upcoming events.</div>'; return; }
  calendarEl.innerHTML = data.map(ev => `<div style="margin-bottom:.6rem"><strong>${ev.title}</strong><div class="muted small">${new Date(ev.start_ts).toLocaleString()} - ${ev.end_ts?new Date(ev.end_ts).toLocaleString():''}</div><p>${ev.description||''}</p></div>`).join('');
}

// E-report: fetch marks and summarize by subject
async function loadEreport(){
  const { data: marks } = await supabase.from('marks').select('id,subject_id,assessment_name,marks,total,created_at,subject:subjects(subject_name)').eq('student_id', profile.id).order('created_at',{ascending:false});
  if (!marks || marks.length===0) { ereportEl.innerHTML = '<div class="muted">No marks yet. Your teacher will add marks when available.</div>'; return; }
  // group by subject
  const bySub = {};
  marks.forEach(m=>{
    const s = m.subject.subject_name || m.subject_id;
    if (!bySub[s]) bySub[s]=[];
    bySub[s].push(m);
  });
  let html = '';
  for (const [sub, arr] of Object.entries(bySub)){
    html += `<div class="card"><h4>${sub}</h4><table class="table"><thead><tr><th>Assessment</th><th>Marks</th><th>Date</th></tr></thead><tbody>`;
    let totalScore=0, totalMax=0;
    arr.forEach(a=>{ totalScore += Number(a.marks); totalMax += Number(a.total); html += `<tr><td>${a.assessment_name||'-'}</td><td>${a.marks}/${a.total}</td><td>${new Date(a.created_at).toLocaleDateString()}</td></tr>`; });
    const percent = totalMax ? Math.round((totalScore/totalMax)*100) : 0;
    html += `</tbody></table><div class="muted small">Subject Average: ${percent}%</div></div>`;
  }
  ereportEl.innerHTML = html;
}

// view/download resource with progress tracking for videos/pdf
window.viewResource = async (id) => {
  const { data, error } = await supabase.from('resources').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  // get signed url
  const resp = await fetch('/.netlify/functions/generate_signed_url', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file_path: data.file_path, bucket: data.storage_bucket })
  });
  const json = await resp.json();
  const url = json.url;
  // Open resource. For videos, open in a new window and attempt to track progress via postMessage or use HTML5 video on a player page.
  // For simplicity, we'll open a player page with query param: /player.html?id=... -- but here we open in new tab
  window.open(url, '_blank');
  // Mark as viewed 100% for now (if opened). For more accurate tracking, implement player page that reports time updates.
  await supabase.from('resource_progress').upsert([{ resource_id: id, student_id: profile.id, progress: 100 }], { onConflict: ['resource_id','student_id'] });
  // refresh progress
  loadProgress();
}

window.downloadResource = async (id) => {
  const { data } = await supabase.from('resources').select('*').eq('id', id).single();
  const resp = await fetch('/.netlify/functions/generate_signed_url', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file_path: data.file_path, bucket: data.storage_bucket }) });
  const json = await resp.json();
  const a = document.createElement('a'); a.href = json.url; a.download = data.file_path.split('/').pop(); document.body.appendChild(a); a.click(); a.remove();
}
