-- Structured legal/report content for rich editing and deterministic PDF rendering.

alter table public.report_content_blocks
  add column if not exists body_json jsonb,
  add column if not exists body_format text not null default 'plain'
    check (body_format in ('plain', 'tiptap_json'));

alter table public.report_content_blocks
  drop constraint if exists report_content_blocks_body_json_shape;

alter table public.report_content_blocks
  add constraint report_content_blocks_body_json_shape check (
    body_json is null
    or (
      jsonb_typeof(body_json) = 'object'
      and body_json ->> 'type' = 'doc'
      and jsonb_typeof(body_json -> 'content') = 'array'
    )
  );

comment on column public.report_content_blocks.body_json is
  'Canonical Tiptap JSON document for formatted legal/report content.';

comment on column public.report_content_blocks.body is
  'Plain-text fallback used for search, migrations, and legacy report versions.';
