-- Add PAYROLL_HEAD role (Super Admin / Payroll Head) to the users table.
-- The existing check constraint must be dropped and recreated to include the new value.

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('PAYROLL_LEAD', 'PROGRAM_MANAGER', 'PAYROLL_HEAD'));
