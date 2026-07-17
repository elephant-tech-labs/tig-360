alter table public.job_proposals
  add column if not exists customer_summary_input_hash text;

comment on column public.job_proposals.customer_summary_input_hash is
  'SHA-256 fingerprint of the proposal content used to generate or manually approve the customer-facing proposal wording.';
