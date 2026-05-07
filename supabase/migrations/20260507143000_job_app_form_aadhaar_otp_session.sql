-- Persist Aadhaar OTP provider session for second-step OTP verification.

alter table public.job_app_form
  add column if not exists aad_otp_session_id text,
  add column if not exists aad_otp_transaction_id text,
  add column if not exists aad_otp_requested_at timestamptz;
