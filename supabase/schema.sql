-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It creates the shared-layout table, opens it for the app's publishable key,
-- and turns on realtime so everyone in a room sees each other's changes live.

create table if not exists public.objects (
  id         text primary key,        -- the object id from the app
  room       text not null,           -- room slug, e.g. 'potomac-3'
  kind       text not null,           -- 'furniture' | 'door'
  data       jsonb not null,          -- the object's fields
  updated_at timestamptz not null default now()
);

create index if not exists objects_room_idx on public.objects (room);

-- Row Level Security: this is an OPEN room — anyone with the public key can
-- read and write. Fine for a personal share. To lock it down later, replace
-- these with policies that check a room password or an authenticated user.
alter table public.objects enable row level security;

drop policy if exists "objects_read"   on public.objects;
drop policy if exists "objects_insert" on public.objects;
drop policy if exists "objects_update" on public.objects;
drop policy if exists "objects_delete" on public.objects;

create policy "objects_read"   on public.objects for select using (true);
create policy "objects_insert" on public.objects for insert with check (true);
create policy "objects_update" on public.objects for update using (true) with check (true);
create policy "objects_delete" on public.objects for delete using (true);

-- Realtime: broadcast row changes to subscribed clients.
alter publication supabase_realtime add table public.objects;

-- Optional but recommended: makes DELETE/UPDATE events include every column
-- (not just the primary key), which is handy if you ever want to filter the
-- realtime stream by room server-side. The app works without it.
alter table public.objects replica identity full;
