-- Available employees can exist without job details.
-- Make designation/DOJ/CTC fields nullable, and use AVAILABLE as the default
-- pre-onboarding status.

alter table public.employees
  alter column designation drop not null,
  alter column date_of_joining drop not null,
  alter column ctc_type drop not null,
  alter column ctc_value drop not null,
  alter column onboarding_status set default 'AVAILABLE';

update public.employees
set onboarding_status = 'AVAILABLE'
where onboarding_status = 'PENDING';
