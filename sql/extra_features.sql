-- Additional features SQL for Iris E-Campus
-- sql/extra_features.sql

-- Resource progress tracking: when a student views/plays a resource we store progress percent
create table if not exists resource_progress (
  id uuid primary key default uuid_generate_v4(),
  resource_id uuid references resources(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  progress integer check (progress >= 0 and progress <= 100) default 0,
  updated_at timestamptz default now(),
  unique (resource_id, student_id)
);

-- Marks/assessments table for e-report cards
create table if not exists marks (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  assessment_name text,
  marks numeric,
  total numeric,
  created_at timestamptz default now()
);

-- Timetable entries for subjects
create table if not exists timetable (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid references subjects(id) on delete cascade,
  day_of_week int check (day_of_week >= 0 and day_of_week <= 6), -- 0 Sunday .. 6 Saturday
  start_time time,
  end_time time,
  venue text,
  created_at timestamptz default now()
);

-- Calendar events (platform-wide or class-specific)
create table if not exists calendar_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  start_ts timestamptz not null,
  end_ts timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
