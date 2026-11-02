-- Wishy : données synchronisées entre le PC (Electron) et l'iPhone (PWA).
-- Chaque ligne appartient à un utilisateur ; la sécurité au niveau des lignes (RLS)
-- garantit qu'on ne voit que ses propres données.

create table if not exists public.items (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  deleted     boolean not null default false,
  needs_fetch boolean not null default false,   -- ajouté depuis l'iPhone, fiche produit à compléter
  updated_at  timestamptz not null default now()
);

create table if not exists public.purchases (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- Secrets du serveur (clé privée VAPID, etc.) : aucune politique RLS,
-- donc lisibles uniquement par les fonctions Edge (clé service_role).
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);

-- Journal des vérifications automatiques (limite la fréquence)
create table if not exists public.price_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  checked     int not null default 0,
  drops       int not null default 0
);

create index if not exists items_user_updated on public.items (user_id, updated_at);
create index if not exists purchases_user_updated on public.purchases (user_id, updated_at);

alter table public.items enable row level security;
alter table public.purchases enable row level security;
alter table public.settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_secrets enable row level security;
alter table public.price_runs enable row level security;

do $$ begin
  create policy "items: ses propres lignes" on public.items for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy "purchases: ses propres lignes" on public.purchases for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy "settings: ses propres lignes" on public.settings for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy "push: ses propres abonnements" on public.push_subscriptions for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;

-- Temps réel : un article ajouté sur le PC apparaît aussitôt sur l'iPhone, et inversement
do $$ begin
  alter publication supabase_realtime add table public.items, public.purchases;
exception when others then null; end $$;

-- Clé personnelle du Raccourci iOS « Ajouter à Wishy » (ajout sans ouvrir l'app)
create table if not exists public.add_tokens (
  token      text primary key,
  user_id    uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.add_tokens enable row level security;
do $$ begin
  create policy "add_tokens: sa propre clé" on public.add_tokens for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
