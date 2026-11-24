# Academic Results Hub

A private, mobile-first academic records platform for organizing student profiles, uploaded result documents, semester courses, GPA/CGPA and downloadable academic reports.

## Current status
This commit establishes the responsive frontend foundation. It uses temporary in-memory student entries and does **not** persist data. Do not enter real student information until authentication, database policies and private file storage are connected.

## Planned stack
- Frontend: HTML, CSS and JavaScript
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Private document storage: Supabase Storage
- Backend/API: Node.js where server-side processing is needed
- OCR: document extraction with human review before records are verified
- Hosting: Vercel

## Planned data model
- profiles / workspace_members
- students
- academic_sessions
- semesters
- courses
- results
- uploaded_documents
- grading_schemes
- audit_logs

## Security requirements
- Private-by-default workspace
- Authenticated access only
- Row Level Security on every student/result table
- Private storage buckets and short-lived signed URLs
- Role-based permissions
- Audit log for edits and approvals
- OCR output must be reviewed before verification

## Local preview
Run `npm install` if needed, then `npm run dev`.

## Next
Add Supabase project URL and anon/publishable key as environment variables, design the schema and RLS policies, then connect authentication and persistent records.
