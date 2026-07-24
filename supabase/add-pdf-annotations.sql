-- Sticky-note annotations placed on a PDF (personal per account). Position is a
-- fraction of the page box so notes track any zoom. Applied via migration
-- `pdf_annotations`. RLS: manage-your-own (verified as the authenticated role).
create table if not exists public.pdf_annotations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  page int not null, x real not null, y real not null,
  content text not null default '', color text not null default '#fde047',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.pdf_annotations enable row level security;
create policy "manage own annotations" on public.pdf_annotations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
