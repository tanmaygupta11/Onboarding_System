# Phase 2 — Program Manager Dashboard + Employee States

**Date:** 2026-04-23
**Status:** Approved, implementing
**Builds on:** `2026-04-23-employee-onboarding-system-design.md`

## 1. Purpose

Extend Phase 1 with the Program Manager side of the app: PM login, a
dashboard showing only clients assigned to them, and per-client employee
management with two state-based tabs (Pending Onboarding / Onboarding In
Progress). Employees can be added one-by-one, bulk-uploaded via Excel, and
moved to "Onboarding In Progress" via a "Send Onboarding Form" CTA.

No emails/SMS/notifications are sent yet — the CTA just flips DB flags.

## 2. Database

New table `employees`:

| column                | type        | notes                                          |
|-----------------------|-------------|------------------------------------------------|
| id                    | uuid        | PK, default `gen_random_uuid()`                |
| client_id             | uuid        | FK → `clients(id)` ON DELETE CASCADE, not null |
| name                  | text        | not null                                       |
| mobile                | text        | not null                                       |
| email                 | text        | not null                                       |
| designation           | text        | not null                                       |
| date_of_joining       | date        | not null                                       |
| ctc_type              | text        | check in (`'MONTHLY'`, `'ANNUAL'`)             |
| ctc_value             | numeric     | not null                                       |
| onboarding_initiated  | boolean     | not null, default false                        |
| onboarding_status     | text        | not null, default `'PENDING'`                  |
| created_by            | uuid        | FK → `users(id)`, not null                     |
| created_at            | timestamptz | default `now()`                                |

Indexes: `employees(client_id)`, `employees(client_id, onboarding_initiated)`.

Existing tables untouched.

## 3. Seed additions

`backend/scripts/seed.mjs` extended:
- For each of the 3 Program Managers, create a Supabase auth user with the
  PM's fixed UUID and password `123456`. Idempotent (skip if exists).
- Assign 5 demo employees to the existing `Acme Logistics` client
  (`program_manager_id = Rahul`), `created_by = Rahul`:
  - 3 with `onboarding_initiated = false`, `onboarding_status = 'PENDING'`
  - 2 with `onboarding_initiated = true`, `onboarding_status = 'FORM_SENT'`

## 4. Backend

### New route: `GET /api/me`
Returns `{ id, name, email, role }` from `public.users` for the authed user.
Used by the frontend after login to decide which dashboard to route to.

### New: `GET /api/pm/clients`
- Caller must be a Program Manager (checked via `users.role`).
- Returns clients where `program_manager_id = req.user.id`, joined with
  designations (same shape as `GET /api/clients`).

### New: `GET /api/employees?client_id=<uuid>`
- Ownership: the client must belong to the caller. For PMs, via
  `program_manager_id`. (Payroll Lead access can be added later via
  `created_by` — out of scope for Phase 2 unless needed.)
- Returns all employees for that client, ordered by `created_at desc`.

### New: `POST /api/employees`
- Accepts `{ client_id, employees: [...] }` OR a single employee object with
  `client_id`. Normalized to array server-side.
- Per-row validation: required fields, `ctc_type` enum, `date_of_joining`
  parseable.
- Designation must exist in the target client's `designations` table.
- Inserts in a single batch; returns `{ inserted, errors }`.

### New: `POST /api/employees/bulk-upload`
- `multipart/form-data` with `file` (.xlsx) and `client_id` (form field).
- `multer` memory storage (size cap 5 MB), `xlsx` parses first sheet.
- Expected headers (case-insensitive, whitespace-trimmed):
  `name, mobile, email, designation, date_of_joining, ctc_type, ctc_value`.
- Each row validated; designation must be in the client's designation list.
- Response: `{ inserted: number, skipped: number, errors: [{ row, message }] }`.

### New: `POST /api/employees/initiate-onboarding`
- Body: `{ employee_ids: [uuid, ...] }`.
- Backend restricts the update to employees whose `client_id` belongs to a
  client with `program_manager_id = req.user.id` (so a PM can't flip flags
  on employees outside their scope).
- Sets `onboarding_initiated = true`, `onboarding_status = 'FORM_SENT'`.
- Returns `{ updated: number }`.

### Auth middleware unchanged; a small `requireRole(role)` middleware added
for PM-only endpoints.

## 5. Frontend

### Auth + routing update
- `AuthContext` now fetches `/api/me` after session load and exposes
  `profile = { id, name, email, role }`.
- A `RoleRoute` wrapper routes to the correct dashboard after login and
  blocks cross-role access.
- Login page: on successful sign-in, redirect by role (Payroll Lead →
  `/dashboard`, PM → `/pm-dashboard`). Default landing from `/` redirects
  based on role when session present.

### New pages

**`/pm-dashboard` — PM Client List**
- Calls `GET /api/pm/clients`.
- Grid or table showing Client Name, Contract Code, Start/End dates,
  designations as chips. Row click → `/pm-dashboard/client/:id`.
- Empty state if no clients assigned.

**`/pm-dashboard/client/:id` — Client Detail**
- Header: client name, contract code, dates, PM info.
- Tabs: `Pending Onboarding` (`onboarding_initiated = false`) |
  `Onboarding In Progress` (`onboarding_initiated = true`). Active tab
  highlighted; counts shown on each.
- Toolbar: `+ Add Employee` button, `Upload Excel` button, `Send Onboarding
  Form` CTA (enabled only when rows are selected and tab = Pending).
- Table columns: checkbox, Name, Mobile, Email, Designation, DOJ, CTC
  (formatted like `₹50,000 / month` or `₹6,00,000 / yr`).
- `Select All` header checkbox. Selection state per-tab (cleared on tab
  switch).

**Add Employee form** (modal or inline)
- Fields: Name, Mobile, Email, Designation (dropdown from this client's
  designations), DOJ, CTC Type, CTC Value.
- Submits via `POST /api/employees`, refreshes the current tab's list.

**Bulk Upload**
- File input (.xlsx only), shows filename, submit button.
- On success: toast with inserted/skipped counts; errors listed inline if
  any; refresh current tab.

**Send Onboarding Form CTA**
- Disabled unless selection non-empty.
- On click: `POST /api/employees/initiate-onboarding`, then refresh both
  tabs (affected rows move from Pending → In Progress), toast
  "Onboarding initiated for N employees". Auto-switches to In Progress tab.

## 6. Dependencies

Backend adds: `multer`, `xlsx`.
Frontend unchanged.

## 7. Authorization

- `POST /api/employees`, `GET /api/employees`, bulk upload, initiate: all
  reject if the target `client_id` isn't owned by the PM.
- `/api/pm/clients` requires role = PROGRAM_MANAGER.
- Frontend route guards: `/pm-dashboard*` requires PM role; `/dashboard`
  etc. still require PAYROLL_LEAD.

## 8. Out of scope / future

- Email, SMS, WhatsApp sending.
- Employee login / self-service form filling.
- Approval workflows, `FORM_FILLED` / `APPROVED` status transitions.
- Global designation library.
