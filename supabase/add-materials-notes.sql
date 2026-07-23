-- Per-file notes for Materials. Every material gets a free-text notes field
-- (empty by default), edited from the notes panel in the document viewer.
-- Already applied to the live project via migration `add_materials_notes`.

alter table public.materials
  add column if not exists notes text not null default '';
