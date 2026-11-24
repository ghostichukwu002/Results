-- E.M.A.C.O.T.S: repair course catalogue SQL privileges.
-- Run this once in Supabase SQL Editor on the existing project.
-- RLS policies remain responsible for deciding which rows/actions are allowed.
grant select, insert, update, delete on table public.courses to authenticated;

-- Reassert the catalogue policies safely in case they were not applied earlier.
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
