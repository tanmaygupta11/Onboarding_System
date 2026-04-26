# Employee Onboarding System — Design Spec

**Date:** 2026-04-23
**Status:** Approved (verbal), pending written review

## 1. Purpose

Build the first slice of an Employee Onboarding System: a web app where a
Payroll Lead logs in, creates Client records (each tied to a Program Manager
and a list of client-specific Designations), views their clients, and edits
them. The system is explicitly designed to expand later to Program Manager
flows, Super Admin, and employee onboarding — but only the Payroll Lead slice
is in scope for this iteration.

## 2. Scope

### In scope
- Supabase project setup (schema, seed, auth user).
- Express backend with four APIs and a Supabase-token auth middleware.
- React + Vite + Tailwind frontend with login, client list, create/edit forms.
- Demo seed data: 3 Program Managers, 1 Payroll Lead (auth user), 2 clients.

### Out of scope (explicitly)
- Program Manager login / dashboard.
- Super Admin role.
- Employee onboarding flows.
- Row-Level Security policies (deferred until multi-role auth is live — the
  backend uses the Supabase service role key and enforces ownership in code).

## 3. Architecture

```
Onboarding System/
├── backend/                Express API (Node.js)
├── frontend/               Vite + React + Tailwind
├── supabase/               Supabase CLI workspace
│   ├── config.toml
│   └── migrations/         SQL schema migrations
├── scripts/
│   └── seed.mjs            Creates PMs + Payroll Lead (auth) + demo clients
└── docs/superpowers/specs/ Design documents
```

### Data flow
1. Browser → Supabase Auth (email/password) → access token stored in the
   Supabase-js client session.
2. Browser → Express backend with `Authorization: Bearer <access_token>`.
3. Backend middleware verifies token via `supabase.auth.getUser(token)` and
   attaches `req.user = { id, email }`.
4. Backend uses a **service-role** Supabase client for all DB reads/writes,
   but restricts every query by `req.user.id` (ownership enforced in code).

## 4. Database Schema

All tables live in the default `public` schema. RLS is disabled — backend
uses service role and enforces access by `created_by` filtering.

### `users`
| column       | type         | notes                                                    |
|--------------|--------------|----------------------------------------------------------|
| id           | uuid         | PK. For Payroll Leads, equals `auth.users.id`.           |
| name         | text         | not null                                                 |
| email        | text         | unique, not null                                         |
| role         | text         | check in (`'PAYROLL_LEAD'`, `'PROGRAM_MANAGER'`)         |
| created_at   | timestamptz  | default `now()`                                          |

### `clients`
| column                 | type         | notes                                               |
|------------------------|--------------|-----------------------------------------------------|
| id                     | uuid         | PK, default `gen_random_uuid()`                     |
| client_name            | text         | not null                                            |
| contract_code          | text         | unique, not null                                    |
| contract_start_date    | date         | not null                                            |
| contract_end_date      | date         | not null                                            |
| program_manager_id     | uuid         | FK → `users(id)`, not null                          |
| insurance_applicable   | boolean      | not null, default false                             |
| insurance_name         | text         | nullable; required when `insurance_applicable`      |
| created_by             | uuid         | FK → `users(id)`, not null                          |
| created_at             | timestamptz  | default `now()`                                     |

### `designations`
| column     | type        | notes                                      |
|------------|-------------|--------------------------------------------|
| id         | uuid        | PK, default `gen_random_uuid()`            |
| client_id  | uuid        | FK → `clients(id)` ON DELETE CASCADE       |
| name       | text        | not null                                   |
| created_at | timestamptz | default `now()`                            |

**Note:** The original spec had `designations jsonb` on `clients`. That column
is removed in favor of this dedicated table so designations can be queried,
grown, and eventually managed independently.

### Indexes
- `clients (contract_code)` — unique constraint covers this.
- `clients (created_by)` — for the per-user list query.
- `designations (client_id)` — for the per-client fetch.

## 5. Seed Data

All seeding is done by a single Node script (`scripts/seed.mjs`) using the
service-role Supabase client. No `seed.sql` — this avoids needing the
database password and keeps one source of truth for demo data.

`scripts/seed.mjs` does the following, in order, idempotently:
1. Inserts 3 Program Managers into `public.users` (role `PROGRAM_MANAGER`),
   with fixed UUIDs.
2. Creates the Payroll Lead auth user (`payrolllead@test.com` / `123456`)
   via `supabase.auth.admin.createUser` with a fixed UUID.
3. Inserts the matching row into `public.users` with role `PAYROLL_LEAD`.
4. Inserts 2 demo clients (referencing the seeded PMs) with 2–3 designations
   each, all with `created_by = <payroll lead uuid>`.

Each step checks existence before inserting so the script is safe to re-run.

## 6. Backend API

### Stack
- Node 20+, Express 4.
- Middleware: `cors`, `express.json`.
- `@supabase/supabase-js` initialized with `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`.
- Dev runner: `nodemon`.

### Auth middleware (`requireAuth`)
1. Reads `Authorization: Bearer <token>`.
2. Calls `supabase.auth.getUser(token)` — on failure, 401.
3. Attaches `req.user = { id, email }`.

### Routes

#### `GET /api/program-managers` (auth required)
Returns `users` where `role = 'PROGRAM_MANAGER'`, ordered by name.
Response: `[{ id, name, email }]`.

#### `POST /api/clients` (auth required)
Body:
```json
{
  "client_name": "Acme",
  "contract_code": "ACM-001",
  "contract_start_date": "2026-05-01",
  "contract_end_date": "2027-04-30",
  "program_manager_id": "<uuid>",
  "insurance_applicable": true,
  "insurance_name": "ICICI Lombard",
  "designations": ["Field Executive", "Team Lead"]
}
```
- Validates required fields and date ordering.
- If `insurance_applicable` is true, `insurance_name` must be non-empty.
- Verifies `program_manager_id` exists in `users` with role `PROGRAM_MANAGER`.
- Enforces `contract_code` uniqueness (DB constraint → mapped to 409).
- Inserts client (setting `created_by = req.user.id`), then bulk-inserts
  designations. If the designations insert fails, the client insert is rolled
  back by deleting the just-created row (best-effort compensating action —
  acceptable for MVP given low traffic; revisit with a SQL function if
  needed).
- Returns the created client with its designations array.

#### `GET /api/clients` (auth required)
- Returns clients where `created_by = req.user.id`.
- Joins `users` to include `program_manager_name` (and PM email).
- Fetches designations for each client and returns them as a `designations:
  string[]` array on the response.
- Ordered by `created_at desc`.

#### `PUT /api/clients/:id` (auth required)
- Ownership check: target row must have `created_by = req.user.id`, else 404.
- Accepts the same shape as `POST`.
- Updates the client columns.
- Replaces designations atomically: delete all rows for that `client_id`,
  then insert the new set.
- Returns the updated client with designations.

### Error model
All errors return JSON `{ error: string, details?: object }` with standard
HTTP status codes (400 validation, 401 auth, 403 ownership, 404 not found,
409 conflict, 500 unexpected).

## 7. Frontend

### Stack
- Vite + React 18.
- Tailwind CSS (default preset).
- React Router v6.
- `@supabase/supabase-js` for auth only (not for direct DB access — backend
  owns DB writes).
- Fetch wrapper (`src/lib/api.js`) that pulls the current session's access
  token and attaches it as a bearer token on every call.

### Routes
- `/login` — public. Email/password form → Supabase `signInWithPassword` →
  on success, redirect to `/dashboard`.
- `/dashboard` — protected. Client list table + "Add Client" button.
- `/clients/new` — protected. Create Client form.
- `/clients/:id/edit` — protected. Edit Client form, pre-filled.

### Auth wiring
- `AuthProvider` wraps the app, exposes `{ session, user, loading, signIn,
  signOut }`. Subscribes to `supabase.auth.onAuthStateChange`.
- `ProtectedRoute` component: while `loading`, render a spinner; if no
  session, redirect to `/login`.
- On login success, fetch the row from `public.users` matching the auth id
  so we can display the user's name/role in the nav.

### Create/Edit Client form
- Fields: Client Name, Contract Code, Contract Start Date, Contract End Date,
  Program Manager (dropdown), Insurance Applicable (Yes/No toggle),
  Insurance Name (shown only when Applicable = Yes), Designations (tag input
  — type + Enter to add a chip, × to remove).
- Program Manager dropdown: on mount, `GET /api/program-managers`. Shows a
  "Loading…" state then the list.
- Client-side validation mirrors server-side (dates, required fields,
  insurance conditional).
- Submit shows a loading state on the button; errors display as a toast/inline
  alert.

### Client list table
- Columns: Client Name, Contract Code, Program Manager, Insurance (Yes/No +
  name when Yes), Start, End, Edit button.
- Empty state: "No clients yet — create your first one" with a CTA.
- Loading state: skeleton rows.
- Error state: banner with retry.

## 8. Environment Variables

`backend/.env`:
```
SUPABASE_URL=<from supabase status / project>
SUPABASE_SERVICE_ROLE_KEY=<service role>
PORT=4000
```

`frontend/.env`:
```
VITE_SUPABASE_URL=<same as backend>
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_BASE_URL=http://localhost:4000
```

## 9. Run / Dev Experience

- `supabase link --project-ref noitppmdzhgwuaviqkvo` (once; prompts for DB
  password).
- `supabase db push` → applies migrations.
- `node scripts/seed.mjs` → seeds PMs, Payroll Lead auth user + row, demo
  clients.
- `cd backend && npm run dev` → API on `:4000`.
- `cd frontend && npm run dev` → UI on `:5173`.

## 10. Future Readiness

- Role field already present on `users` — PM / Super Admin rows can be added
  and gated by the same auth middleware with a role claim lookup.
- Designations live in their own table — when PMs start managing designation
  pools, the table can grow a `global: boolean` or move to a separate
  `designation_library` table without breaking the current schema.
- API shapes return role/owner info explicitly so future role-based routing
  in the frontend is a matter of adding more `ProtectedRoute` variants.

## 11. Risks / Open Items

- **No RLS:** backend is the only path to the DB. If anyone exposes the
  service role key or bypasses the API, there is no DB-level defense. RLS
  policies should be added before the PM login ships.
- **Compensating delete:** the POST /clients + designations insert uses a
  best-effort rollback. For MVP write volumes this is fine; if it becomes a
  concern, wrap the two operations in a Postgres function and call it as a
  single RPC.
- **Seed UUIDs are hardcoded:** `scripts/seed.mjs` uses fixed UUIDs for the
  PMs and Payroll Lead so re-runs are idempotent. These UUIDs should be kept
  as named constants at the top of the script.
