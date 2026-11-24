-- Academic Results Hub — Supabase schema
-- Run this entire file in Supabase SQL Editor on a NEW project.
-- Privacy model: every user owns their own profile, result rows and uploaded files.
-- Admins manage the shared course catalogue only; admin status grants NO access to other users' results.

create extension if not exists pgcrypto;

-- Admin membership is separate from profiles so users cannot promote themselves.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select lower(u.email) = 'okaforanointing37@gmail.com'
       and exists (select 1 from public.app_admins a where a.user_id = u.id)
    from auth.users u
    where u.id = auth.uid()
  ), false);
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- A profile is created automatically when a user signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;

  -- Only this exact email receives the administrator allow-list entry.
  if lower(coalesce(new.email, '')) = 'okaforanointing37@gmail.com' then
    insert into public.app_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- Single shared course catalogue for the user's department.
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  course_title text not null,
  credit_units numeric(4,1) not null default 1 check (credit_units > 0),
  level text,
  semester smallint check (semester in (1, 2)),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute procedure public.set_updated_at();

-- Each student owns their result rows. Course/credit/grade-point snapshots preserve
-- historical calculations if catalogue details are later edited.
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  course_code text not null,
  course_title text not null,
  credit_units numeric(4,1) not null check (credit_units > 0),
  academic_session text not null,
  semester smallint not null check (semester in (1, 2)),
  score numeric(5,2) check (score between 0 and 100),
  grade text,
  grade_point numeric(4,2) check (grade_point >= 0),
  source_document_id uuid,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_code, academic_session, semester)
);

create index if not exists results_user_session_idx
  on public.results (user_id, academic_session, semester);

drop trigger if exists results_set_updated_at on public.results;
create trigger results_set_updated_at
before update on public.results
for each row execute procedure public.set_updated_at();

-- Private document metadata. The actual files live in the private Storage bucket below.
create table if not exists public.uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  academic_session text,
  semester smallint check (semester in (1, 2)),
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded', 'processing', 'review_required', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.results
  drop constraint if exists results_source_document_id_fkey;
alter table public.results
  add constraint results_source_document_id_fkey
  foreign key (source_document_id) references public.uploaded_documents(id) on delete set null;

-- RLS: profiles and academic records are strictly owner-only.
alter table public.app_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.results enable row level security;
alter table public.uploaded_documents enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- No client-side access to the admin membership list.
revoke all on public.app_admins from public, anon, authenticated;

drop policy if exists "Authenticated users can read active courses" on public.courses;
create policy "Authenticated users can read active courses"
on public.courses for select to authenticated
using (is_active = true or public.is_app_admin());

drop policy if exists "Admins can add courses" on public.courses;
create policy "Admins can add courses"
on public.courses for insert to authenticated
with check (public.is_app_admin());

drop policy if exists "Admins can update courses" on public.courses;
create policy "Admins can update courses"
on public.courses for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

drop policy if exists "Admins can delete courses" on public.courses;
create policy "Admins can delete courses"
on public.courses for delete to authenticated
using (public.is_app_admin());

drop policy if exists "Users can read own results" on public.results;
create policy "Users can read own results"
on public.results for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can add own results" on public.results;
create policy "Users can add own results"
on public.results for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own results" on public.results;
create policy "Users can update own results"
on public.results for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own results" on public.results;
create policy "Users can delete own results"
on public.results for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own document records" on public.uploaded_documents;
create policy "Users can read own document records"
on public.uploaded_documents for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can add own document records" on public.uploaded_documents;
create policy "Users can add own document records"
on public.uploaded_documents for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own document records" on public.uploaded_documents;
create policy "Users can update own document records"
on public.uploaded_documents for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own document records" on public.uploaded_documents;
create policy "Users can delete own document records"
on public.uploaded_documents for delete to authenticated
using (user_id = auth.uid());

-- Private bucket: users store files under their own auth UUID folder:
-- <auth.uid()>/<generated-file-name>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'result-documents',
  'result-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their own result files" on storage.objects;
create policy "Users can view their own result files"
on storage.objects for select to authenticated
using (
  bucket_id = 'result-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own result files" on storage.objects;
create policy "Users can upload their own result files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'result-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own result files" on storage.objects;
create policy "Users can update their own result files"
on storage.objects for update to authenticated
using (
  bucket_id = 'result-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'result-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own result files" on storage.objects;
create policy "Users can delete their own result files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'result-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- The only administrator identity is okaforanointing37@gmail.com.
-- No manual client-side promotion is permitted; the auth trigger and allow-list
-- below grant this account catalogue-management access only.


-- Enforce a single administrator identity. This also repairs any old/manual entries.
delete from public.app_admins a
where not exists (
  select 1 from auth.users u
  where u.id = a.user_id
    and lower(u.email) = 'okaforanointing37@gmail.com'
);
insert into public.app_admins (user_id)
select u.id
from auth.users u
where lower(u.email) = 'okaforanointing37@gmail.com'
on conflict (user_id) do nothing;

-- Safe RPC: signed-in users can check only their own course-admin permission.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin();
$$;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;
