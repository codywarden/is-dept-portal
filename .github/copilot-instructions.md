# IS Department Portal - Copilot Instructions

## Architecture Overview

This is a **Next.js 16 fullstack application** managing spray department user administration and role-based access control via Supabase authentication and database.

### Key Components
- **Server-Side Auth**: [middleware.ts](../middleware.ts) enforces login via Supabase cookies; redirects unauthenticated users to `/login`
- **Role-Based Access**: Three roles (`admin`, `verifier`, `viewer`) stored in `profiles` table; checked via [requireRole.ts](../app/lib/auth/requireRole.ts)
- **Admin Panel**: [app/admin/](../app/admin/) uses server-side data fetch + client component for UI (necessary to refetch on actions)
- **Service Role Operations**: Admin API routes use `SUPABASE_SERVICE_ROLE_KEY` (server-only) for privileged operations like user creation
- **Client Auth**: [lib/supabase/client.ts](../app/lib/supabase/client.ts) and [lib/supabase/server.ts](../app/lib/supabase/server.ts) use SSR pattern with Supabase cookies

### Data Flow
1. User logs in at `/login` → Supabase auth session stored in cookies
2. Middleware validates session; unauthorized → redirect to login with `next` param
3. Protected pages call `requireRole(["admin"])` → queries `profiles.role` before rendering
4. Admin actions (add/delete user) → POST to API routes → service role client → Supabase Auth + profiles table

## Critical Developer Workflows

### Local Development
```bash
npm run dev          # Start Next.js dev server on port 3000
npm run build        # Production build
npm run lint         # ESLint check
```

### Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key (public, used in browsers)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only, never expose to browser)

### Creating Protected Pages
1. Use `requireRole(["admin"])` in server component (see [app/admin/page.tsx](../app/admin/page.tsx) line 21)
2. This ensures authorization before any content renders; redirects if unauthorized
3. Pass data as props to `"use client"` components for interactivity

### Creating Admin API Routes
1. Extract request body with validation (see [app/api/admin/add-user/route.ts](../app/api/admin/add-user/route.ts) lines 8-15)
2. Use `createClient()` with `SUPABASE_SERVICE_ROLE_KEY` for Auth admin operations
3. Return error responses with `status: 400` or `500` for client error handling
4. Example: adding user requires Auth creation + profiles table insert (lines 21-70 in route.ts)

## Project-Specific Patterns & Conventions

### Supabase Client Initialization
- **Server**: `createSupabaseServer()` (uses cookies) — for regular queries, role checks
- **Service Role**: `createClient(URL, SERVICE_ROLE_KEY)` — for admin Auth operations only, never expose key
- **Browser**: `createClient()` in `lib/supabase/client.ts` — uses Supabase SSR for automatic session refresh

### Role Checking
- Always use `requireRole(["admin"])` in server components; it includes auth validation
- Roles: `admin` (full access), `verifier` (inspection duties), `viewer` (read-only)
- Fallback role is `"viewer"` if no profile exists

### Admin UI Patterns
- Server component fetches initial data + roles
- Client component (`AdminClient.tsx`) handles forms, state, refetch logic
- API route handles mutations; client re-renders table on success
- Locations: hardcoded in `AdminClient.tsx` as `LOCATIONS` constant (Bucklin, Greensburg, etc.)

### Error Handling in Routes
- Handle auth user creation failures gracefully—check if user already exists
- Return descriptive error messages (e.g., field validation, duplicate email)
- 400 = client error (invalid input), 500 = server error (unexpected issue)

## Integration Points & Dependencies

### External Services
- **Supabase**: PostgreSQL + Auth (manage users, store profiles with role + location)
- **Next.js**: Framework; uses App Router with server/client components
- **Tailwind CSS**: Styling framework (with PostCSS v4)

### Key Tables (Supabase)
- `profiles` — `id` (UUID), `email`, `role`, `first_name`, `last_name`, `location`, `last_login`, `created_at`
- Synced via `auth.users` → triggers → `profiles` on user creation

### Public Routes (No Auth Required)
- `/login`, `/auth/*`, `/_next/*`, `/favicon.ico` — see [middleware.ts](../middleware.ts) line 25
- All other routes require login

## File Structure Highlights
- [app/lib/auth/requireRole.ts](../app/lib/auth/requireRole.ts) — Role enforcement utility
- [app/api/admin/](../app/api/admin/) — Admin CRUD endpoints (add-user, delete-user, update-profile, set-role, locations)
- [app/admin/AdminClient.tsx](../app/admin/AdminClient.tsx) — User management UI (670 lines)
- [middleware.ts](../middleware.ts) — Auth session validation on every request
