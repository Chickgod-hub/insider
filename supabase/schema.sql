-- Public, client-readable room state (never contains secrets until RESULTS)
create table rooms(code text primary key, pub jsonb not null, updated_at timestamptz default now());
-- Secrets: word, roles, tokens, votes. RLS on + NO policies = only the server (service role) can access.
create table room_private(code text primary key references rooms(code) on delete cascade, data jsonb not null);
alter table rooms enable row level security;
alter table room_private enable row level security;
create policy "anyone can read public room state" on rooms for select using (true);
alter publication supabase_realtime add table rooms;
