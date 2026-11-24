# E.M.A.C.O.T.S

A private, mobile-first academic results tracker for one department. Every person registers with their own email and can access only their own academic records.

## Current features
- Supabase email/password registration and sign-in
- Personal account page with email, account ID and role
- Private result-document uploads to Supabase Storage
- Personal result list and CGPA calculation from saved course grades
- Personal semester GPA trend and grade distribution charts (based only on the signed-in user's own saved grades)
- Course catalogue visible to authenticated users; course management and grading-rule configuration are admin-only
- Smart manual result entry: course-code lookup fills course title and credit units, assignment/exam marks calculate total, grade and grade point
- CGPA and semester performance charts refresh from each saved result
- Responsive mobile-first interface
- Vercel production hosting connected to this GitHub repository

## Supabase setup
1. In Supabase SQL Editor, run the complete `supabase/schema.sql` file for a new project. For the existing E.M.A.C.O.T.S project, use the relevant additive migrations instead of rerunning the full schema.
2. Run `supabase/course-catalogue-permissions.sql` if the existing course catalogue still reports a permission error.
3. Run `supabase/smart-result-entry-migration.sql` to add assignment/exam score columns and the department grading-settings table for smart manual result entry.
4. In Authentication → URL Configuration, add your Vercel production URL to Site URL and Redirect URLs.
5. In Authentication → Providers, enable Email. For a real deployment, keep email confirmation enabled.
6. The browser uses only the Supabase project URL and publishable key from `config.js`. Never add a secret/service-role key to frontend files.

## The only administrator account
- The only administrator email is `okaforanointing37@gmail.com`.
- Create that account normally, verify the email if confirmation is enabled, and sign in.
- The database automatically adds only that exact email to the private administrator allow-list when the account is created. If the account already exists, rerun `supabase/schema.sql` to synchronize the allow-list.
- Every other email remains a student account. Public registration never offers an administrator option.

Admin permission is limited to managing the shared departmental course catalogue. It does not grant access to another user's results, uploads, grades or transcript. An admin can access their own records as a normal user.

## Security notes
- Row Level Security restricts profiles, results and document metadata to the signed-in owner.
- The `result-documents` Storage bucket is private; files are stored under the owner's Auth UUID.
- Public sign-up never allows a user to choose the admin role. The database checks the exact administrator email as well as the private allow-list; all other accounts are denied administrator permissions.
- Do not upload real student information until the SQL schema has been run and the Supabase Auth settings have been checked.

## Current limitations
- OCR extraction and result review workflow are not implemented yet.
- The result-document upload is active, but grades must still be entered into the results table by a future result-entry/review interface.
- The grading scheme is not yet configured; confirm your department's grading scale before relying on GPA/CGPA.
- PDF transcript export is still to be built.
