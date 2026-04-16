-- ============================================================
-- NavMePinnacle multi-tenant upgrade
-- Shared-project, organization-scoped architecture
-- Existing rows are backfilled into:
--   Suhas House (slug: suhas-house)
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
before update on public.organizations
for each row
execute function public.touch_updated_at();

create table if not exists public.organization_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  api_key_hash text not null unique,
  last_four text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_organization_api_keys_organization_id
  on public.organization_api_keys (organization_id);

create table if not exists public.dashboard_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text not null,
  role text not null check (role in ('super_admin', 'admin')),
  avatar_url text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_admins
  add column if not exists avatar_url text,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists dashboard_admins_updated_at on public.dashboard_admins;
create trigger dashboard_admins_updated_at
before update on public.dashboard_admins
for each row
execute function public.touch_updated_at();

create unique index if not exists idx_dashboard_admins_lower_email
  on public.dashboard_admins (lower(email));

create index if not exists idx_dashboard_admins_organization_id
  on public.dashboard_admins (organization_id);

create table if not exists public.emergency_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_active boolean not null default false,
  activated_at timestamptz,
  activated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.emergency_state
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists is_active boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists emergency_state_updated_at on public.emergency_state;
create trigger emergency_state_updated_at
before update on public.emergency_state
for each row
execute function public.touch_updated_at();

create unique index if not exists idx_emergency_state_organization_id
  on public.emergency_state (organization_id);

create table if not exists public.floor_nav_paths (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor text not null,
  points jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, floor)
);

alter table public.floor_nav_paths
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists floor text,
  add column if not exists points jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.access_control_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_id text not null,
  label text not null default 'Zone',
  type text not null default 'other',
  zone_type text not null default 'normal',
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 100,
  h double precision not null default 100,
  is_blocked boolean not null default false,
  floor text not null default 'ground',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_access_control_zones_org_zone_id
  on public.access_control_zones (organization_id, zone_id);

create index if not exists idx_access_control_zones_org_floor
  on public.access_control_zones (organization_id, floor);

drop trigger if exists access_control_zones_updated_at on public.access_control_zones;
create trigger access_control_zones_updated_at
before update on public.access_control_zones
for each row
execute function public.touch_updated_at();

create table if not exists public.ar_rooms (
  room_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_name text not null,
  floor_no text,
  is_active character(1) not null default 'Y',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_rooms_org_floor
  on public.ar_rooms (organization_id, floor_no);

drop trigger if exists ar_rooms_updated_at on public.ar_rooms;
create trigger ar_rooms_updated_at
before update on public.ar_rooms
for each row
execute function public.touch_updated_at();

create table if not exists public.ar_ropin_buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  name_display text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_ropin_buildings_org_created_at
  on public.ar_ropin_buildings (organization_id, created_at);

drop trigger if exists ar_ropin_buildings_updated_at on public.ar_ropin_buildings;
create trigger ar_ropin_buildings_updated_at
before update on public.ar_ropin_buildings
for each row
execute function public.touch_updated_at();

create table if not exists public.ar_ropin_floors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor_name text,
  name_display text,
  floor_level integer not null default 0,
  building_id uuid references public.ar_ropin_buildings(id) on delete set null,
  status text not null default 'OPEN',
  weight_factor numeric not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_ropin_floors_org_building
  on public.ar_ropin_floors (organization_id, building_id);

create index if not exists idx_ar_ropin_floors_org_level
  on public.ar_ropin_floors (organization_id, floor_level);

drop trigger if exists ar_ropin_floors_updated_at on public.ar_ropin_floors;
create trigger ar_ropin_floors_updated_at
before update on public.ar_ropin_floors
for each row
execute function public.touch_updated_at();

create table if not exists public.ar_ropin_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_name text,
  name_display text,
  floor_id uuid references public.ar_ropin_floors(id) on delete set null,
  status text not null default 'OPEN',
  weight_factor numeric not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_ropin_zones_org_floor
  on public.ar_ropin_zones (organization_id, floor_id);

drop trigger if exists ar_ropin_zones_updated_at on public.ar_ropin_zones;
create trigger ar_ropin_zones_updated_at
before update on public.ar_ropin_zones
for each row
execute function public.touch_updated_at();

create table if not exists public.ar_ropin_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_name text,
  name_display text,
  entry_type text,
  building_id uuid references public.ar_ropin_buildings(id) on delete set null,
  floor_id uuid references public.ar_ropin_floors(id) on delete set null,
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  pos_z double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_ropin_entries_org_floor
  on public.ar_ropin_entries (organization_id, floor_id);

create index if not exists idx_ar_ropin_entries_org_building
  on public.ar_ropin_entries (organization_id, building_id);

drop trigger if exists ar_ropin_entries_updated_at on public.ar_ropin_entries;
create trigger ar_ropin_entries_updated_at
before update on public.ar_ropin_entries
for each row
execute function public.touch_updated_at();

create table if not exists public.emergency_stuck_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  emergency_id uuid not null,
  user_email text not null,
  user_name text not null,
  pos_x double precision,
  pos_y double precision,
  pos_z double precision,
  issue_description text,
  status text not null default 'waiting_for_help',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_stuck_reports_org_created_at
  on public.emergency_stuck_reports (organization_id, created_at desc);

drop trigger if exists emergency_stuck_reports_updated_at on public.emergency_stuck_reports;
create trigger emergency_stuck_reports_updated_at
before update on public.emergency_stuck_reports
for each row
execute function public.touch_updated_at();

create table if not exists public.emergency_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  emergency_id uuid not null,
  user_email text not null,
  user_name text not null,
  is_physically_able boolean not null default true,
  is_in_safe_place boolean not null default false,
  pos_x double precision,
  pos_y double precision,
  pos_z double precision,
  status text not null default 'recorded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_checkins_org_created_at
  on public.emergency_checkins (organization_id, created_at desc);

drop trigger if exists emergency_checkins_updated_at on public.emergency_checkins;
create trigger emergency_checkins_updated_at
before update on public.emergency_checkins
for each row
execute function public.touch_updated_at();

create table if not exists public.emergency_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  emergency_id uuid not null,
  user_email text not null,
  user_name text not null,
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  ability_status text,
  choice text,
  rescue_target_name text,
  rescue_target_status text,
  navigation_status text not null default 'pending',
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  pos_z double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_responses_ability_status_check check (
    ability_status in ('physically_abled', 'pregnant', 'children', 'not_able_to_walk')
    or ability_status is null
  ),
  constraint emergency_responses_choice_check check (
    choice in ('exit', 'save_someone')
    or choice is null
  ),
  constraint emergency_responses_navigation_status_check check (
    navigation_status in (
      'pending',
      'navigating_to_exit',
      'navigating_to_rescue',
      'waiting_for_help',
      'reached_exit',
      'reached_person',
      'rescued'
    )
  )
);

create index if not exists idx_emergency_responses_org_created_at
  on public.emergency_responses (organization_id, created_at desc);

create index if not exists idx_emergency_responses_emergency_id
  on public.emergency_responses (emergency_id);

drop trigger if exists emergency_responses_updated_at on public.emergency_responses;
create trigger emergency_responses_updated_at
before update on public.emergency_responses
for each row
execute function public.touch_updated_at();

insert into public.organizations (name, slug)
values ('Suhas House', 'suhas-house')
on conflict (slug) do nothing;

do $$
declare
  v_default_org_id uuid;
  v_table text;
begin
  select id into v_default_org_id
  from public.organizations
  where slug = 'suhas-house';

  update public.dashboard_admins
  set organization_id = v_default_org_id
  where organization_id is null
    and role <> 'super_admin';

  foreach v_table in array array[
    'ar_ropin_pois',
    'ar_ropin_users',
    'ar_ropin_navnode',
    'ar_ropin_saved_places',
    'ar_ropin_connections',
    'ar_ropin_feedback',
    'ar_electronic_assets',
    'ar_complaints',
    'ar_snapshots',
    'ar_office_gate_entries',
    'ar_nav_popups',
    'ar_nav_matrices',
    'ar_nav_matrix_items',
    'access_control_zones',
    'emergency_stuck_reports',
    'emergency_checkins',
    'emergency_responses',
    'ar_rooms',
    'ar_ropin_buildings',
    'ar_ropin_floors',
    'ar_ropin_zones',
    'ar_ropin_entries'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete cascade',
        v_table
      );
      execute format(
        'update public.%I set organization_id = %L where organization_id is null',
        v_table,
        v_default_org_id
      );
      execute format(
        'alter table public.%I alter column organization_id set not null',
        v_table
      );
      execute format(
        'create index if not exists %I on public.%I (organization_id)',
        'idx_' || v_table || '_organization_id',
        v_table
      );
      execute format(
        'alter table public.%I enable row level security',
        v_table
      );
      execute format(
        'revoke all on public.%I from anon, authenticated',
        v_table
      );
    end if;
  end loop;

  update public.emergency_state
  set organization_id = v_default_org_id
  where organization_id is null;

  alter table public.emergency_state
    alter column organization_id set not null;

  update public.floor_nav_paths
  set organization_id = v_default_org_id
  where organization_id is null;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'floor_nav_paths'
      and column_name = 'floor'
  ) then
    delete from public.floor_nav_paths
    where floor is null;
  end if;

  alter table public.floor_nav_paths
    alter column organization_id set not null,
    alter column floor set not null;

  alter table public.floor_nav_paths
    drop constraint if exists floor_nav_paths_pkey;

  alter table public.floor_nav_paths
    add constraint floor_nav_paths_pkey primary key (organization_id, floor);

  alter table public.organizations enable row level security;
  alter table public.organization_api_keys enable row level security;
  alter table public.dashboard_admins enable row level security;
  alter table public.emergency_state enable row level security;
  alter table public.floor_nav_paths enable row level security;

  revoke all on public.organizations from anon, authenticated;
  revoke all on public.organization_api_keys from anon, authenticated;
  revoke all on public.dashboard_admins from anon, authenticated;
  revoke all on public.emergency_state from anon, authenticated;
  revoke all on public.floor_nav_paths from anon, authenticated;

  if to_regclass('public.ar_ropin_users') is not null then
    execute 'alter table public.ar_ropin_users drop constraint if exists ar_ropin_users_email_key';
    execute 'create unique index if not exists idx_ar_ropin_users_org_email on public.ar_ropin_users (organization_id, lower(email))';
  end if;

  if to_regclass('public.ar_electronic_assets') is not null then
    execute 'alter table public.ar_electronic_assets drop constraint if exists ar_electronic_assets_sl_no_key';
    execute 'create unique index if not exists idx_ar_electronic_assets_org_sl_no on public.ar_electronic_assets (organization_id, sl_no)';
  end if;
end;
$$;

insert into public.emergency_state (
  organization_id,
  is_active,
  activated_at,
  activated_by,
  created_at,
  updated_at
)
select
  org.id,
  false,
  null,
  null,
  now(),
  now()
from public.organizations as org
where not exists (
  select 1
  from public.emergency_state as state
  where state.organization_id = org.id
);

insert into public.floor_nav_paths (
  organization_id,
  floor,
  points,
  updated_at
)
select
  org.id,
  v.floor,
  '[]'::jsonb,
  now()
from public.organizations as org
cross join (values ('ground'), ('first')) as v(floor)
where not exists (
  select 1
  from public.floor_nav_paths as paths
  where paths.organization_id = org.id
    and paths.floor = v.floor
);

create or replace view public.dashboard_admins_safe as
select
  admin.id,
  admin.email,
  admin.display_name,
  admin.role,
  admin.avatar_url,
  admin.organization_id,
  org.name as organization_name,
  org.slug as organization_slug,
  admin.created_at,
  admin.updated_at
from public.dashboard_admins as admin
left join public.organizations as org
  on org.id = admin.organization_id;

create or replace function public.verify_admin_login(
  p_email text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
begin
  select
    admin.id,
    admin.email,
    admin.password_hash,
    admin.display_name,
    admin.role,
    admin.avatar_url,
    admin.organization_id,
    org.name as organization_name,
    org.slug as organization_slug,
    admin.created_at,
    admin.updated_at
  into v_admin
  from public.dashboard_admins as admin
  left join public.organizations as org
    on org.id = admin.organization_id
  where lower(admin.email) = lower(trim(p_email));

  if v_admin is null then
    return null;
  end if;

  if not (v_admin.password_hash = crypt(p_password, v_admin.password_hash)) then
    return null;
  end if;

  return json_build_object(
    'id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'role', v_admin.role,
    'avatar_url', v_admin.avatar_url,
    'organization_id', v_admin.organization_id,
    'organization_name', v_admin.organization_name,
    'organization_slug', v_admin.organization_slug,
    'created_at', v_admin.created_at,
    'updated_at', v_admin.updated_at
  );
end;
$$;

drop function if exists public.create_admin_account(uuid, text, text, text, text);

create or replace function public.create_organization_with_admin(
  p_caller_id uuid,
  p_org_name text,
  p_org_slug text,
  p_admin_email text,
  p_admin_password text,
  p_admin_display_name text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
  v_org public.organizations%rowtype;
begin
  select id, role into v_caller
  from public.dashboard_admins
  where id = p_caller_id;

  if v_caller is null or v_caller.role <> 'super_admin' then
    raise exception 'Unauthorized: only super_admin can create organizations';
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_org_name), lower(trim(p_org_slug)))
  returning * into v_org;

  insert into public.dashboard_admins (
    email,
    password_hash,
    display_name,
    role,
    organization_id
  )
  values (
    lower(trim(p_admin_email)),
    crypt(p_admin_password, gen_salt('bf', 10)),
    trim(p_admin_display_name),
    'admin',
    v_org.id
  );

  insert into public.emergency_state (
    organization_id,
    is_active,
    activated_at,
    activated_by,
    created_at,
    updated_at
  )
  values (
    v_org.id,
    false,
    null,
    null,
    now(),
    now()
  )
  on conflict (organization_id) do nothing;

  insert into public.floor_nav_paths (
    organization_id,
    floor,
    points,
    updated_at
  )
  values
    (v_org.id, 'ground', '[]'::jsonb, now()),
    (v_org.id, 'first', '[]'::jsonb, now())
  on conflict (organization_id, floor) do nothing;

  return json_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'is_active', v_org.is_active,
    'created_at', v_org.created_at,
    'updated_at', v_org.updated_at
  );
end;
$$;

create or replace function public.create_admin_account(
  p_caller_id uuid,
  p_email text,
  p_password text,
  p_display_name text,
  p_role text default 'admin',
  p_organization_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller record;
  v_new_admin record;
begin
  select id, role into v_caller
  from public.dashboard_admins
  where id = p_caller_id;

  if v_caller is null or v_caller.role <> 'super_admin' then
    raise exception 'Unauthorized: only super_admin can create accounts';
  end if;

  if p_role not in ('super_admin', 'admin') then
    raise exception 'Invalid role';
  end if;

  insert into public.dashboard_admins (
    email,
    password_hash,
    display_name,
    role,
    organization_id
  )
  values (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 10)),
    trim(p_display_name),
    p_role,
    p_organization_id
  )
  returning id
  into v_new_admin;

  return (
    select json_build_object(
      'id', safe.id,
      'email', safe.email,
      'display_name', safe.display_name,
      'role', safe.role,
      'avatar_url', safe.avatar_url,
      'organization_id', safe.organization_id,
      'organization_name', safe.organization_name,
      'organization_slug', safe.organization_slug,
      'created_at', safe.created_at,
      'updated_at', safe.updated_at
    )
    from public.dashboard_admins_safe as safe
    where safe.id = v_new_admin.id
  );
end;
$$;

create or replace function public.delete_admin_account(
  p_caller_id uuid,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller record;
begin
  if p_caller_id = p_target_id then
    raise exception 'Cannot delete your own account';
  end if;

  select id, role into v_caller
  from public.dashboard_admins
  where id = p_caller_id;

  if v_caller is null or v_caller.role <> 'super_admin' then
    raise exception 'Unauthorized';
  end if;

  delete from public.dashboard_admins
  where id = p_target_id;

  return true;
end;
$$;

revoke all on public.dashboard_admins_safe from anon, authenticated;
revoke execute on function public.verify_admin_login(text, text) from anon, authenticated;
revoke execute on function public.create_admin_account(uuid, text, text, text, text, uuid) from anon, authenticated;
revoke execute on function public.create_organization_with_admin(uuid, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.delete_admin_account(uuid, uuid) from anon, authenticated;
