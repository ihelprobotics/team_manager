# TaskFlow — Team Task Management System

A full-stack Next.js app with AI-powered task updates, work session timers, manager dashboard, and role-based access.

---

## Features

**Manager**
- Role-protected login — employees cannot access manager views at all
- Full team dashboard: task board, per-employee progress, live clock-in status
- Assign tasks + helpers, edit/delete tasks and employees
- Attention-needed alerts auto-flagged by AI when employees report blockers
- Reports: work hours, completion rates, activity feed
- Real-time activity log of all task updates

**Employee**
- Personal login → personal dashboard only
- Clock In / Clock Out timer (manager sees live status)
- AI chat: type updates in plain English → database updates automatically
- Helper badge when assigned to assist a colleague

---

## Tech Stack

- **Framework**: Next.js 15 App Router
- **Database**: Supabase (Postgres) — free forever tier
- **Auth**: Cookie-based sessions (no external provider)
- **AI**: Anthropic Claude API
- **Deploy**: Vercel free tier
- **Styling**: Tailwind CSS

---

## Setup Guide

### 1. Supabase (free)

1. Create account at supabase.com → new project
2. Go to SQL Editor → paste `supabase_schema.sql` → Run
3. Settings → API → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Anthropic API Key

1. console.anthropic.com → create API key → `ANTHROPIC_API_KEY`

### 3. Deploy to Vercel

1. Push to GitHub → import on vercel.com
2. Add environment variables:

```
NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJh...
SUPABASE_SERVICE_ROLE_KEY      = eyJh...
ANTHROPIC_API_KEY              = sk-ant-...
MANAGER_SETUP_SECRET           = any-random-secret
```

3. Deploy

### 4. Create Manager Account (one-time)

```bash
curl -X POST https://your-app.vercel.app/api/manager-setup \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-MANAGER_SETUP_SECRET","name":"Alex Manager","email":"manager@company.com","password":"your-password"}'
```

### 5. Add Employees

Log in as manager → click **+ Employee** → fill in name, email, password → share credentials.

---

## Local Dev

```bash
npm install
cp .env.local.example .env.local   # fill in keys
npm run dev                         # http://localhost:3000
```

---

## Security Notes

- Passwords stored as `$plain$xxx` for dev — **replace with bcrypt before real use**
- Manager routes are server-side protected (employees are hard-redirected)
- Service role key is server-only, never sent to browser
- Session cookies are httpOnly + secure in production

## Production Checklist

- [ ] Add bcryptjs password hashing
- [ ] Set up Supabase RLS policies
- [ ] Rate-limit /api/auth/login
- [ ] Disable /api/manager-setup after first use
