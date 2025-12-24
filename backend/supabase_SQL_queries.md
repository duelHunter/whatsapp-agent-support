### Core tables in Supabase

# organizations
```
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz default now()
);
```

# Profiles
```
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  default_org_id uuid references public.organizations(id),
  created_at timestamptz default now()
);
```

# Memberships
```
create type public.user_role as enum ('owner', 'admin', 'operator', 'viewer');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null default 'operator',
  created_at timestamptz default now(),
  unique (org_id, user_id)
);
```
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
# wa_accounts
```
create type public.wa_status as enum ('connected', 'disconnected', 'pending_qr', 'error');

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  phone_number text,
  status public.wa_status not null default 'pending_qr',
  last_qr_at timestamptz,
  last_connected_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
```

# Contacts
```
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  wa_number text not null,
  name text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now()
);
```

# Conversations
```
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'open',
  last_message_at timestamptz,
  last_message_preview text,
  assigned_agent_id uuid references public.profiles(id),
  created_at timestamptz default now()
);
```

# Messages
```
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  wa_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('user', 'bot', 'agent')),
  wa_message_id text,
  body text,
  message_type text default 'text',
  ai_used boolean default false,
  ai_model text,
  ai_latency_ms integer,
  created_at timestamptz default now()
);
```

# KB sources
```
create table public.kb_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wa_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  title text not null,
  source_type text not null default 'pdf',
  original_filename text,
  storage_path text,
  status text not null default 'ready',
  chunk_count integer default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
```

# KB chuncks
```
create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.kb_sources(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```


# Turn on RLS using sql commands
```
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.kb_sources enable row level security;
```


# Set basic policies
```
create policy "profiles: user can see self" on public.profiles for select using (id = auth.uid());
create policy "profiles: user can update self" on public.profiles for update using (id = auth.uid());
```
