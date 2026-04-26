-- Introduce ROLE_ASSIGNED stage between AVAILABLE and FORM_SENT.
-- Enforce role detail presence by stage at the DB layer.

alter table public.employees
  drop constraint if exists employees_available_job_fields_null;

alter table public.employees
  add constraint employees_stage_job_fields_consistency
  check (
    (
      onboarding_status = 'AVAILABLE'
      and designation is null
      and date_of_joining is null
      and ctc_type is null
      and ctc_value is null
      and onboarding_initiated = false
    )
    or
    (
      onboarding_status in ('ROLE_ASSIGNED', 'FORM_SENT')
      and designation is not null
      and date_of_joining is not null
      and ctc_type in ('MONTHLY', 'ANNUAL')
      and ctc_value is not null
    )
  );
