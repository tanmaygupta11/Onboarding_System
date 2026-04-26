-- Ensure AVAILABLE employees have no job details yet.
-- Backfill existing rows and enforce with a check constraint.

update public.employees
set
  designation = null,
  date_of_joining = null,
  ctc_type = null,
  ctc_value = null
where onboarding_status = 'AVAILABLE';

alter table public.employees
  drop constraint if exists employees_available_job_fields_null;

alter table public.employees
  add constraint employees_available_job_fields_null
  check (
    onboarding_status <> 'AVAILABLE'
    or (
      designation is null
      and date_of_joining is null
      and ctc_type is null
      and ctc_value is null
    )
  );
