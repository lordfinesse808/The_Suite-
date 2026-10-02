-- ilé lean beta: initial schema.
-- Runs unchanged on embedded PGlite (local/mock) and on Supabase Postgres (production).
-- Every tenant table carries org_id and has row-level security keyed on app.org_id.

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  areas_served text[] not null default '{}',
  tone_notes text not null default '',
  office_hours text not null default 'Mon-Sat, 9:00-17:00',
  timezone text not null default 'Africa/Lagos',
  founding_member boolean not null default true,
  consent_message text not null default '',
  fees_policy text not null default '',
  public_key text not null unique,
  allowed_origins text[] not null default '{}',
  ai_daily_budget_usd numeric(10,4),
  settings jsonb not null default '{}',
  onboarding_step int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  org_id uuid references organisations(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  role text not null check (role in ('owner','agent')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create table if not exists whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text not null default '',
  display_number text not null default '',
  display_name text not null default '',
  access_token_encrypted text not null default '',
  status text not null default 'connected',
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ref_code text not null,
  title text not null,
  purpose text not null check (purpose in ('rent','sale','shortlet')),
  property_type text not null,
  bedrooms int not null default 0,
  bathrooms int not null default 0,
  price_amount bigint not null,
  price_period text not null check (price_period in ('year','month','night','total')),
  service_charge bigint,
  area text not null,
  city text not null,
  address text not null default '',
  lat double precision,
  lng double precision,
  features text[] not null default '{}',
  description text not null default '',
  status text not null default 'available' check (status in ('available','taken')),
  verified boolean not null default false,
  pinned boolean not null default false,
  hidden boolean not null default false,
  photos text[] not null default '{}',
  agent_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ref_code)
);
create index if not exists listings_search_idx on listings (org_id, status, purpose, price_amount);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  phone text not null,
  name text,
  email text,
  language text not null default 'en-NG',
  stage text not null default 'new'
    check (stage in ('new','qualifying','qualified','shortlisted','viewing_booked','viewed','won','lost')),
  score int not null default 0,
  score_breakdown jsonb not null default '[]',
  temperature text not null default 'cold' check (temperature in ('hot','warm','cold')),
  needs jsonb not null default '{}',
  source jsonb not null default '{}',
  listing_id uuid references listings(id) on delete set null,
  assigned_agent_id uuid references users(id) on delete set null,
  ai_paused boolean not null default false,
  needs_human boolean not null default false,
  flag_reason text,
  spam boolean not null default false,
  consent_at timestamptz,
  opted_out_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  ctx jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);
create index if not exists leads_org_stage_idx on leads (org_id, stage);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('in','out','event')),
  type text not null default 'text',
  body text not null default '',
  payload jsonb not null default '{}',
  author text not null,
  wa_message_id text unique,
  status text not null default 'received',
  created_at timestamptz not null default now()
);
create index if not exists messages_lead_idx on messages (lead_id, seq);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  rank int not null,
  score int not null default 0,
  reason text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  body text not null,
  original_body text not null,
  trigger text not null,
  status text not null default 'pending' check (status in ('pending','approved','sent','rejected','expired')),
  approved_by uuid references users(id) on delete set null,
  sent_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  agent_id uuid not null references users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null,
  buffer_minutes int not null default 45,
  max_per_day int not null default 4
);

create table if not exists viewings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  agent_id uuid references users(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','attended','no_show')),
  reminders_sent text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  type text not null,
  run_at timestamptz not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  attempts int not null default 0,
  last_error text,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists jobs_due_idx on jobs (status, run_at);

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  agent text not null,
  step text not null default 'respond',
  model text not null,
  prompt_version text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  kind text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security. The application role sets `app.org_id` per request
-- (see src/lib/db/tenant.ts). The owner/service role bypasses RLS, so
-- application code also scopes every query by org_id (first wall).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;

alter table organisations enable row level security;
drop policy if exists tenant_isolation on organisations;
create policy tenant_isolation on organisations
  using (id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$
declare t text;
begin
  foreach t in array array['memberships','whatsapp_accounts','listings','leads','messages','matches','drafts',
                           'availability','viewings','jobs','ai_runs','audit_log','alerts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) with check (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t);
  end loop;
end $$;
