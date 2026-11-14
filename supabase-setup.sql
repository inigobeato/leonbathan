-- LEONBATHAN Supabase setup
-- Run this entire script once in Supabase > SQL Editor > New query.
-- Then create your admin user in Authentication > Users and run the UID insert
-- shown in README.md (replace the example UID with your real Auth user UUID).

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;

drop policy if exists "Admins can view their own record" on public.admin_users;
create policy "Admins can view their own record"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.admin_users to authenticated;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  type text,
  version text,
  image_url text,
  image_path text,
  live_url text,
  download_url text,
  app_path text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;

drop policy if exists "Public can view published projects" on public.projects;
drop policy if exists "Admins can view all projects" on public.projects;

-- Public viewer policy: does not query the protected admin_users table.
create policy "Public can view published projects"
on public.projects for select to anon, authenticated
using (is_published = true);

-- Separate administrator policy: authenticated users only.
create policy "Admins can view all projects"
on public.projects for select to authenticated
using (exists (
  select 1 from public.admin_users where user_id = (select auth.uid())
));

drop policy if exists "Admins can add projects" on public.projects;
create policy "Admins can add projects"
on public.projects for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects for delete to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

-- Create the two public buckets. Public means files can be downloaded by anyone
-- who has the URL; upload/update/delete remain restricted by the policies below.
insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', true),
       ('app-downloads', 'app-downloads', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Admins can upload portfolio files" on storage.objects;
create policy "Admins can upload portfolio files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('project-assets', 'app-downloads')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

drop policy if exists "Admins can update portfolio files" on storage.objects;
create policy "Admins can update portfolio files"
on storage.objects for update to authenticated
using (
  bucket_id in ('project-assets', 'app-downloads')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
)
with check (
  bucket_id in ('project-assets', 'app-downloads')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

drop policy if exists "Admins can delete portfolio files" on storage.objects;
create policy "Admins can delete portfolio files"
on storage.objects for delete to authenticated
using (
  bucket_id in ('project-assets', 'app-downloads')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);
