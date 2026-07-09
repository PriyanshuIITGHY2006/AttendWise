# AttendWise

Attendance, schedule, and course material tracker for IITG students.

## What it does

- Per-course attendance criteria (different courses require different %) with a running safe-to-skip calculator
- Weekly class schedule per course, with sessions generated automatically against the shared institute academic calendar
- One-tap attendance marking, with backfill for missed days
- Gated course-material sharing for a whitelisted set of accounts

## Stack

- React + TypeScript + Vite + Tailwind CSS
- Supabase (Postgres, Auth, Storage) with row-level security on every table

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Scripts

- `npm run dev` – start the dev server
- `npm run build` – type-check and build for production
- `npm run lint` – run oxlint
