-- Phase 2: employees table.

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  mobile text not null,
  email text not null,
  designation text not null,
  date_of_joining date not null,
  ctc_type text not null check (ctc_type in ('MONTHLY', 'ANNUAL')),
  ctc_value numeric not null check (ctc_value >= 0),
  onboarding_initiated boolean not null default false,
  onboarding_status text not null default 'PENDING',
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists employees_client_id_idx
  on public.employees (client_id);

create index if not exists employees_client_initiated_idx
  on public.employees (client_id, onboarding_initiated);
