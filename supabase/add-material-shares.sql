-- Public share links for a single material (applied via migration
-- `add_material_shares`). A high-entropy, URL-safe token anyone can open (no
-- login, no allow-list), resolved by the `material-share` edge function using
-- the service role. The materials RLS is NOT touched: a file only becomes public
-- when its owner mints a token, and deleting the row revokes access instantly.
-- One token per (material, owner). Only file-backed materials are shareable.
create table if not exists public.material_shares (
  token text primary key default replace(replace(encode(gen_random_bytes(12), 'base64'), '/', '_'), '+', '-'),
  material_id uuid not null references public.materials(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (material_id, created_by)
);

alter table public.material_shares enable row level security;

-- The public resolver reads via the service role (bypasses RLS); these policies
-- only govern the owner managing their own links from the app.
create policy "read own shares" on public.material_shares
  for select using (created_by = auth.uid());
create policy "insert shares for accessible material" on public.material_shares
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from public.materials m where m.id = material_id)
  );
create policy "delete own shares" on public.material_shares
  for delete using (created_by = auth.uid());
