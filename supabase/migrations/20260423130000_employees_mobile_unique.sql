-- Employees: mobile must be unique across all employees.

create unique index if not exists employees_mobile_unique
  on public.employees (mobile);
