alter table public.proposal_line_items
  add column if not exists contract_scope text,
  add column if not exists contract_scope_source jsonb not null default '{}'::jsonb,
  add column if not exists contract_scope_generated_at timestamptz;

comment on column public.proposal_line_items.contract_scope is
  'Customer-facing concise scope used in proposal/customer PDF output. Original recommendation text remains in description.';

comment on column public.proposal_line_items.contract_scope_source is
  'Source metadata for the customer-facing contract scope, for example OpenAI model or manual edit.';

comment on column public.proposal_line_items.contract_scope_generated_at is
  'Timestamp used to detect whether the contract scope is stale relative to the line item.';
