-- Freehand pen strokes on PDFs (applied to the live project via migration
-- `add_pdf_ink`). One row per stroke; `points` is a JSON array of [x,y] pairs in
-- fractional page coordinates (0..1) so a stroke tracks the page at any zoom.
-- Personal to the account, mirroring pdf_annotations.
create table if not exists public.pdf_ink (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  page integer not null,
  color text not null default '#ef4444',
  width real not null default 3,
  points jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.pdf_ink enable row level security;

create policy "manage own ink" on public.pdf_ink
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists pdf_ink_material_idx on public.pdf_ink (material_id);
