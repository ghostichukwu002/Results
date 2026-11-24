-- ============================================================
-- E.M.A.C.O.T.S SMART MANUAL RESULT ENTRY MIGRATION
-- Run in the EXISTING Supabase project's SQL Editor.
-- Safe additive migration: does not drop existing student data.
-- ============================================================

begin;

-- Keep the legacy score column while adding explicit score components.
alter table public.results
  add column if not exists assignment_score numeric(6,2),
  add column if not exists exam_score numeric(6,2),
  add column if not exists total_score numeric(6,2);

-- Preserve compatibility with existing rows by copying their old total score.
update public.results
set total_score = score
where total_score is null and score is not null;

-- One shared grading configuration for this department.
-- The administrator must set the official marks and grade boundaries.
create table if not exists public.grade_settings (
  id smallint primary key default 1 check (id = 1),
  assignment_max numeric(6,2) not null check (assignment_max > 0),
  exam_max numeric(6,2) not null check (exam_max > 0),
  grade_boundaries jsonb not null
    check (jsonb_typeof(grade_boundaries) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.grade_settings enable row level security;

grant select, insert, update on public.grade_settings to authenticated;

drop policy if exists "Authenticated users can read grading rules"
on public.grade_settings;
create policy "Authenticated users can read grading rules"
on public.grade_settings
for select to authenticated
using (true);

drop policy if exists "Only admin can create grading rules"
on public.grade_settings;
create policy "Only admin can create grading rules"
on public.grade_settings
for insert to authenticated
with check (public.is_app_admin());

drop policy if exists "Only admin can update grading rules"
on public.grade_settings;
create policy "Only admin can update grading rules"
on public.grade_settings
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

-- Ensure authenticated users can save their own result rows.
grant select, insert, update, delete on public.results to authenticated;

commit;

-- After running this migration:
-- 1. Sign in with the designated administrator account.
-- 2. Open Course catalogue > Grading rules.
-- 3. Enter the department-approved assignment/exam maximum marks.
-- 4. Enter every grade boundary and its official grade point.
-- 5. Save the rules. Students can then enter results.
