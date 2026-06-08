-- RLS policies for new tables (sql/extra_policies.sql)

alter table resource_progress enable row level security;
alter table marks enable row level security;
alter table timetable enable row level security;
alter table calendar_events enable row level security;

-- resource_progress policies
-- Students can select and update their own progress
create policy "resource_progress_select_own_or_admin" on resource_progress
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    OR student_id = auth.uid()
  );

create policy "resource_progress_insert_student_or_admin" on resource_progress
  for insert with check (
    student_id = auth.uid() OR exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "resource_progress_update_own_or_admin" on resource_progress
  for update using ( student_id = auth.uid() OR exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') ) with check ( student_id = auth.uid() OR exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') );

create policy "resource_progress_delete_admin" on resource_progress
  for delete using ( exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') );

-- marks policies
-- Students can select their own marks; teachers for their students; admin can do anything
create policy "marks_select_student_teacher_admin" on marks
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    OR student_id = auth.uid()
    OR exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher' and p.id = teacher_id)
  );

create policy "marks_insert_by_teacher_or_admin" on marks
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('teacher','admin'))
  );

create policy "marks_update_by_teacher_or_admin" on marks
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') OR teacher_id = auth.uid()
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') OR teacher_id = auth.uid()
  );

create policy "marks_delete_admin" on marks
  for delete using ( exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') );

-- timetable: allow select for authenticated users; insert/update/delete by admin or teacher who owns subject
create policy "timetable_select_auth" on timetable
  for select using ( auth.role() is not null );

create policy "timetable_modify_admin_or_teacher" on timetable
  for insert, update, delete with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    OR exists (select 1 from subjects s where s.id = timetable.subject_id and s.teacher_id = auth.uid())
  );

-- calendar_events: select for authenticated, insert by teachers/admins
create policy "calendar_select_auth" on calendar_events
  for select using ( auth.role() is not null );

create policy "calendar_insert_teacher_admin" on calendar_events
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('teacher','admin'))
  );

create policy "calendar_update_owner_or_admin" on calendar_events
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') OR created_by = auth.uid()
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') OR created_by = auth.uid()
  );

create policy "calendar_delete_admin" on calendar_events
  for delete using ( exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') );
