-- LEONBATHAN: fix public viewer + admin access without exposing admin_users.
-- Run this entire script in Supabase Dashboard > SQL Editor as project owner.
-- Existing project records and uploaded files are not deleted.

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- admin_users: authenticated users may check only their own allowlist row.
REVOKE ALL ON TABLE public.admin_users FROM anon;
GRANT SELECT ON TABLE public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Admins can view their own record" ON public.admin_users;
DROP POLICY IF EXISTS "Users can verify their own admin status" ON public.admin_users;
CREATE POLICY "Admins can view their own record"
ON public.admin_users
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- projects: public visitors can read published projects only.
-- This policy deliberately does NOT reference admin_users.
GRANT SELECT ON TABLE public.projects TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view published projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;

CREATE POLICY "Public can view published projects"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Admins have a separate policy for viewing published and draft projects.
-- This policy applies only to authenticated users, who have SELECT on admin_users.
CREATE POLICY "Admins can view all projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.user_id = (SELECT auth.uid())
  )
);

GRANT INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;

DROP POLICY IF EXISTS "Admins can add projects" ON public.projects;
CREATE POLICY "Admins can add projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
CREATE POLICY "Admins can update projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects"
ON public.projects
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = (SELECT auth.uid())
  )
);

-- Verification queries (run separately if desired):
-- SELECT policyname, roles, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('admin_users', 'projects')
-- ORDER BY tablename, policyname;
--
-- SELECT id, title, is_published FROM public.projects ORDER BY created_at DESC;
