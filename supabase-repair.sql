-- LEONBATHAN: safe policy/grant repair for the existing schema.
-- Run in Supabase Dashboard > SQL Editor as the project owner.
-- This does not delete project records or change their content.

alter table public.admin_users enable row level security;
alter table public.projects enable row level security;

grant select on public.admin_users to authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

drop policy if exists "Admins can view their own record" on public.admin_users;
create policy "Admins can view their own record"
on public.admin_users
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public can view published projects" on public.projects;
create policy "Public can view published projects"
on public.projects
for select to anon, authenticated
using (
  is_published = true
  or exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can add projects" on public.projects;
create policy "Admins can add projects"
on public.projects
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects
for update to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

-- Verify the logged-in administrator is allowlisted separately:
-- select user_id from public.admin_users;
-- The row must contain the exact UUID shown under Authentication > Users.
