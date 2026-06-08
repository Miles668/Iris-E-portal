// public/assets/js/teacher.js
import { supabase, getProfile } from './supabaseClient.js';

const uploadForm = document.getElementById('uploadForm');
const resSubject = document.getElementById('resSubject');
const resourcesTableBody = document.querySelector('#resourcesTable tbody');
const marksSubject = document.getElementById('marksSubject');
const marksSection = document.getElementById('marksSection');

document.getElementById('logoutBtn').addEventListener('click', async ()=> {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
});

let profile;
async function init(){
  const { data: user } = await supabase.auth.getUser();
  if (!user || !user.user) { window.location.href='/login.html'; return; }
  profile = await getProfile(user.user.id);
  document.getElementById('teacherName').innerText = profile.full_name || 'Teacher';

  const { data: subjects } = await supabase.from('subjects').select('*').eq('teacher_id', profile.id);
  resSubject.innerHTML = subjects.map(s => `<option value="${s.id}">${s.subject_name}</option>`).join('');
  marksSubject.innerHTML += subjects.map(s => `<option value="${s.id}">${s.subject_name}</option>`).join('');
  loadResources();
}
init();

uploadForm.addEventListener('submit', async (e)=> {
  e.preventDefault();
  const title = document.getElementById('resTitle').value.trim();
  const description = document.getElementById('resDesc').value.trim();
  const subject_id = resSubject.value;
  const fileInput = document.getElementById('resFile');
  const file = fileInput.files[0];
  if (!file) return alert('Select a file');

  if (file.size > 200 * 1024 * 1024) return alert('Max 200MB');
  const ext = file.name.split('.').pop().toLowerCase();
  const isVideo = ['mp4','mov','avi'].includes(ext);
  const bucket = isVideo ? 'videos' : 'documents';
  const fname = `${Date.now()}_${file.name.replace(/\s/g,'_')}`;

  const { data: uploadData, error: uploadError } = await supabase.storage.from(bucket).upload(fname, file, { cacheControl: '3600', upsert: false });
  if (uploadError) return alert(uploadError.message);

  const { error: insertErr } = await supabase.from('resources').insert([{
    title, description, file_path: uploadData.path, file_type: isVideo ? 'video' : ext, storage_bucket: bucket, subject_id, uploaded_by: profile.id
  }]);
  if (insertErr) return alert(insertErr.message);

  showToast('Uploaded', 'success');
  uploadForm.reset();
  loadResources();
});

async function loadResources(){
  const { data, error } = await supabase.from('resources').select('id,title,file_path,file_type,subject_id,created_at').eq('uploaded_by', profile.id).order('created_at',{ascending:false});
  if (error) return console.error(error);
  resourcesTableBody.innerHTML = data.map(r => {
    return `<tr>
      <td>${r.title}</td>
      <td>${r.file_path.split('/').pop()}</td>
      <td>${r.subject_id||'-'}</td>
      <td>
        <button class="btn" onclick="viewResource('${r.id}')">View</button>
        <button class="btn" onclick="deleteResource('${r.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

window.deleteResource = async (id) => {
  if (!confirm('Delete resource?')) return;
  const { data, error } = await supabase.from('resources').select('file_path,storage_bucket').eq('id', id).single();
  if (error) return alert(error.message);
  const { error: delErr } = await supabase.storage.from(data.storage_bucket).remove([data.file_path]);
  if (delErr) console.warn('File deletion error', delErr);
  const { error: rm } = await supabase.from('resources').delete().eq('id', id);
  if (rm) return alert(rm.message);
  loadResources();
}

window.viewResource = async (id) => {
  const { data, error } = await supabase.from('resources').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  const resp = await fetch('/.netlify/functions/generate_signed_url', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file_path: data.file_path, bucket: data.storage_bucket }) });
  const json = await resp.json();
  const url = json.url;
  window.open(url, '_blank');
}

// Marks management: when a teacher selects a subject, list enrolled students and allow entering marks
marksSubject?.addEventListener('change', async (e) => {
  const subj = e.target.value;
  if (!subj) { marksSection.innerHTML = ''; return; }
  // get students enrolled
  const { data: enrolls } = await supabase.from('enrollments').select('student_id,student:profiles(full_name)').eq('subject_id', subj);
  if (!enrolls || enrolls.length===0) { marksSection.innerHTML = '<div class="muted">No students enrolled.</div>'; return; }
  let html = `<label>Assessment name <input id="assessmentName"></label><table class="table"><thead><tr><th>Student</th><th>Marks</th><th>Total</th></tr></thead><tbody>`;
  enrolls.forEach(en => {
    html += `<tr><td>${en.student.full_name||en.student_id}</td><td><input data-student="${en.student_id}" class="markInput" type="number" min="0"></td><td><input data-student-total="${en.student_id}" class="totalInput" type="number" min="1"></td></tr>`;
  });
  html += `</tbody></table><div class="flex" style="margin-top:0.6rem"><button id="saveMarks" class="btn primary">Save Marks</button></div>`;
  marksSection.innerHTML = html;
  document.getElementById('saveMarks').addEventListener('click', async ()=>{
    const assessment = document.getElementById('assessmentName').value || 'Assessment';
    const markInputs = Array.from(document.querySelectorAll('.markInput'));
    const totalInputs = Array.from(document.querySelectorAll('.totalInput'));
    const toInsert = [];
    markInputs.forEach(mi => {
      const sid = mi.dataset.student;
      const markVal = mi.value;
      const totalEl = document.querySelector(`input[data-student-total="${sid}"]`);
      const totalVal = totalEl?.value || 100;
      if (markVal === '' || markVal === null) return; // skip empty
      toInsert.push({ student_id: sid, subject_id: subj, teacher_id: profile.id, assessment_name: assessment, marks: Number(markVal), total: Number(totalVal) });
    });
    if (!toInsert.length) return alert('No marks to save');
    const { error } = await supabase.from('marks').insert(toInsert);
    if (error) return alert(error.message);
    alert('Marks saved');
  });
});

function showToast(msg, kind='info') { alert(msg); }
