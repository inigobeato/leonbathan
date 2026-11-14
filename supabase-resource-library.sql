-- LEONBATHAN resource library: PDF reviewers/study materials + logo designs
-- Additive migration. Does not modify Supabase Auth, admin_users, or existing projects.

CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('pdf', 'logo')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.resources TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.resources TO authenticated;

DROP POLICY IF EXISTS "Public can view published resources" ON public.resources;
CREATE POLICY "Public can view published resources"
ON public.resources FOR SELECT TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "Admins can view all resources" ON public.resources;
CREATE POLICY "Admins can view all resources"
ON public.resources FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert resources" ON public.resources;
CREATE POLICY "Admins can insert resources"
ON public.resources FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update resources" ON public.resources;
CREATE POLICY "Admins can update resources"
ON public.resources FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can delete resources" ON public.resources;
CREATE POLICY "Admins can delete resources"
ON public.resources FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

-- Public bucket: upload only files intended for publication. Unpublished records
-- stay hidden in the database, but anyone with a direct public file URL can fetch the file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portfolio-resources', 'portfolio-resources', true, 52428800,
        ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload portfolio resources" ON storage.objects;
CREATE POLICY "Admins upload portfolio resources"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portfolio-resources' AND EXISTS (
  SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "Admins update portfolio resources" ON storage.objects;
CREATE POLICY "Admins update portfolio resources"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'portfolio-resources' AND EXISTS (
  SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
))
WITH CHECK (bucket_id = 'portfolio-resources' AND EXISTS (
  SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "Admins delete portfolio resources" ON storage.objects;
CREATE POLICY "Admins delete portfolio resources"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portfolio-resources' AND EXISTS (
  SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
));


-- Editable public "A Little About Me" section.
-- Separate from Supabase Auth; does not alter admin_users or login settings.
CREATE TABLE IF NOT EXISTS public.about_profile (
  id integer PRIMARY KEY CHECK (id = 1),
  eyebrow text NOT NULL DEFAULT '04 / A LITTLE ABOUT ME',
  heading1 text NOT NULL DEFAULT 'Curious mind.',
  heading2 text NOT NULL DEFAULT 'Practical mindset.',
  paragraph1 text NOT NULL DEFAULT 'I bring together an interest in technology and a foundation in accounting. I enjoy exploring how software can make everyday processes clearer, faster, and more organized.',
  paragraph2 text NOT NULL DEFAULT 'This portfolio is where I share my applications, experiments, and professional journey.',
  skills jsonb NOT NULL DEFAULT '["HTML","CSS","JavaScript","Problem solving","Accounting fundamentals"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.about_profile ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.about_profile TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.about_profile TO authenticated;

DROP POLICY IF EXISTS "Public can view About profile" ON public.about_profile;
CREATE POLICY "Public can view About profile"
ON public.about_profile FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert About profile" ON public.about_profile;
CREATE POLICY "Admins can insert About profile"
ON public.about_profile FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update About profile" ON public.about_profile;
CREATE POLICY "Admins can update About profile"
ON public.about_profile FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())));

INSERT INTO public.about_profile (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
