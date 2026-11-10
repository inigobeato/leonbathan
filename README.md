# LEONBATHAN — GitHub-ready portfolio

A responsive black / charcoal / antique-gold portfolio for an app developer and accounting student.

## What is included
- Public portfolio: home, projects, about, skills, resume, contact
- LB branding, lion artwork and favicon
- Supabase-powered public project list
- Admin sign-in using Supabase Auth
- Admin allowlist using the `admin_users` table
- Add, edit, publish/unpublish, and delete projects
- Upload project screenshots and app files to Supabase Storage
- `supabase-setup.sql`: database, RLS and storage policies
- `supabase-config.js`: project URL and public publishable key

## Important: Supabase is the backend, not the static website host
Upload these files to a GitHub repository. Deploy the static website using GitHub Pages, Netlify, or Vercel. Supabase provides the database, authentication, and file storage. Your site connects to Supabase automatically using the included configuration.

## Setup — do these steps once

### 1. Set up the Supabase backend
1. Open your Supabase project.
2. Go to **SQL Editor → New query**.
3. Open `supabase-setup.sql`, copy all its contents, paste into SQL Editor, and click **Run**.
4. Go to **Authentication → Users** and create your admin user using your email and a strong password.
5. Copy that user's UID.
6. In SQL Editor, run this query, replacing the example UID with your actual Auth user UID:

```sql
insert into public.admin_users (user_id)
values ('PASTE-YOUR-AUTH-USER-UID-HERE');
```

Only this allowlisted account can manage projects. The UID previously provided in chat is not automatically assumed to be an Auth user in this project; use the UID shown in this project's Authentication → Users page.

### 2. Verify browser configuration
`supabase-config.js` is already configured with this project's URL and publishable key. The publishable key is intended for browser use. **Never add a Supabase secret/service-role key to this repository or any frontend file.**

A secret key was previously shared in chat. Rotate/revoke that key in Supabase **Project Settings → API Keys** before production use.

### 3. Publish on GitHub
1. Create a new public GitHub repository, for example `leonbathan`.
2. Extract this ZIP.
3. Upload the CONTENTS of this folder to the repository root (so `index.html` is at the root, not inside another nested folder).
4. Commit the files.

### 4. Deploy the website
Recommended easiest option: **Netlify**
1. Open https://www.netlify.com/ and sign in with GitHub.
2. Choose **Add new site → Import an existing project**.
3. Select your `leonbathan` repository.
4. Leave build command blank and publish directory as `.` (root).
5. Deploy. Netlify provides a public HTTPS address.

Alternatively, enable GitHub Pages in the repository's **Settings → Pages** and select the main branch/root. Supabase itself is the backend and does not directly host this plain static HTML site.

## Using the admin dashboard
1. Open your deployed website and visit `https://YOUR-SITE/#admin`.
2. Sign in with the email/password created in Supabase Authentication.
3. Add project title, description, type and version.
4. Optionally select a screenshot and an app file to upload.
5. Add a live URL or external download URL if applicable.
6. Click **Save project**. Published projects appear on the public homepage.

## Before public launch
- Replace `your.email@example.com` in `app.js` with your contact email.
- Add your PDF resume as `assets/resume.pdf`.
- Test admin login, project publishing, screenshot upload and download links.
- Public buckets mean anyone with a file URL can access that file. Upload only files intended for public distribution.
- Keep your Supabase secret/service-role key private.
