-- Wishy 1.6 : sous-listes (synchronisées) et partage en lecture seule
create table if not exists public.lists (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists lists_user_updated on public.lists (user_id, updated_at);
create index if not exists lists_share_token on public.lists ((data->>'shareToken')) where not deleted;
alter table public.lists enable row level security;
create policy "lists: ses propres lignes" on public.lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.lists;
