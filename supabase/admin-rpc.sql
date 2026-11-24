-- Run after supabase/schema.sql.
-- Lets a signed-in user check their own course-admin permission without exposing app_admins.
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
