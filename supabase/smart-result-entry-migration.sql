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

-- Calculate and validate each result inside PostgreSQL as the source of truth.
-- This prevents clients from submitting a forged total, grade or grade point.
create or replace function public.apply_result_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.grade_settings%rowtype;
  matched_boundary jsonb;
  calculated_total numeric(6,2);
begin
  select * into settings
  from public.grade_settings
  where id = 1;

  if not found then
    raise exception 'The department grading rules have not been configured by the administrator.';
  end if;

  if new.assignment_score is null or new.exam_score is null then
    raise exception 'Both assignment and examination scores are required.';
  end if;

  if new.assignment_score < 0 or new.assignment_score > settings.assignment_max then
    raise exception 'Assignment score must be between 0 and %.', settings.assignment_max;
  end if;

  if new.exam_score < 0 or new.exam_score > settings.exam_max then
    raise exception 'Examination score must be between 0 and %.', settings.exam_max;
  end if;

  calculated_total := new.assignment_score + new.exam_score;

  select boundary into matched_boundary
  from jsonb_array_elements(settings.grade_boundaries) as boundary
  where calculated_total >= (boundary->>'min')::numeric
  order by (boundary->>'min')::numeric desc
  limit 1;

  if matched_boundary is null then
    raise exception 'No grade boundary is configured for total score %.', calculated_total;
  end if;

  new.total_score := calculated_total;
  new.score := calculated_total;
  new.grade := matched_boundary->>'grade';
  new.grade_point := (matched_boundary->>'point')::numeric;

  return new;
end;
$$;

drop trigger if exists results_apply_grade on public.results;
create trigger results_apply_grade
before insert or update of assignment_score, exam_score
on public.results
for each row execute function public.apply_result_grade();

-- Ensure authenticated users can save their own result rows.
grant select, insert, update, delete on public.results to authenticated;

commit;

-- After running this migration:
-- 1. Sign in with the designated administrator account.
-- 2. Open Course catalogue > Grading rules.
-- 3. Enter the department-approved assignment/exam maximum marks (combined maximum must not exceed 100).
-- 4. Enter every grade boundary and its official grade point.
-- 5. Save the rules. Students can then enter results.
-- 6. If grading rules are changed later, re-trigger grade calculation for existing rows once:
--      update public.results set assignment_score = assignment_score where assignment_score is not null;
