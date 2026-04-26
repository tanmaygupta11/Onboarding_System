-- Onboarding System initial schema.
-- Tables: users, clients, designations.
-- RLS is intentionally disabled for MVP; backend uses the service role key
-- and enforces ownership (created_by) in code. RLS will be added when
-- multi-role auth (PM, Super Admin) ships.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key,
  name text not null,
  email text unique not null,
  role text not null check (role in ('PAYROLL_LEAD', 'PROGRAM_MANAGER')),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  contract_code text unique not null,
  contract_start_date date not null,
  contract_end_date date not null,
  program_manager_id uuid not null references public.users(id),
  insurance_applicable boolean not null default false,
  insurance_name text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint clients_insurance_name_required
    check (insurance_applicable = false or (insurance_name is not null and length(trim(insurance_name)) > 0)),
  constraint clients_contract_dates_valid
    check (contract_end_date >= contract_start_date)
);

create index if not exists clients_created_by_idx on public.clients (created_by);

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists designations_client_id_idx on public.designations (client_id);
