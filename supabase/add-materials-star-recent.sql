-- Materials quality-of-life: star/favorite a file, and track when it was last
-- opened (for the "Recent" view). Applied to the live project via migration
-- `add_materials_starred_lastopened`.

alter table public.materials
  add column if not exists starred boolean not null default false,
  add column if not exists last_opened_at timestamptz;
