-- add organization-scoped mattercraft feature visibility flags
-- creates one row per organization, seeds existing organizations,
-- and keeps future organizations in sync automatically.

create table if not exists public.organization_features (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  search_people_enabled boolean not null default true,
  search_explore_enabled boolean not null default true,
  search_places_enabled boolean not null default true,
  fab_snapshot_enabled boolean not null default true,
  fab_logout_enabled boolean not null default true,
  fab_complaint_enabled boolean not null default false,
  fab_whatsapp_enabled boolean not null default true,
  fab_feedback_enabled boolean not null default true,
  chatbot_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organization_features is
  'Per-organization Mattercraft feature visibility controls.';

comment on column public.organization_features.search_people_enabled is
  'Controls the People category inside the Mattercraft search panel.';

comment on column public.organization_features.search_explore_enabled is
  'Controls the Explore category inside the Mattercraft search panel.';

comment on column public.organization_features.search_places_enabled is
  'Controls the Places category inside the Mattercraft search panel.';

comment on column public.organization_features.fab_snapshot_enabled is
  'Controls the Snapshot action inside the Mattercraft FAB menu.';

comment on column public.organization_features.fab_logout_enabled is
  'Controls the Logout action inside the Mattercraft FAB menu.';

comment on column public.organization_features.fab_complaint_enabled is
  'Controls the Complaint or Report Issue action inside the Mattercraft FAB menu.';

comment on column public.organization_features.fab_whatsapp_enabled is
  'Controls the WhatsApp action inside the Mattercraft FAB menu.';

comment on column public.organization_features.fab_feedback_enabled is
  'Controls the Feedback action inside the Mattercraft FAB menu.';

comment on column public.organization_features.chatbot_enabled is
  'Controls the Mattercraft chatbot launcher.';

create index if not exists idx_organization_features_organization_id
  on public.organization_features (organization_id);

drop trigger if exists organization_features_updated_at on public.organization_features;
create trigger organization_features_updated_at
before update on public.organization_features
for each row
execute function public.touch_updated_at();

create or replace function public.seed_organization_features()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_features (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists organizations_seed_features on public.organizations;
create trigger organizations_seed_features
after insert on public.organizations
for each row
execute function public.seed_organization_features();

insert into public.organization_features (organization_id)
select org.id
from public.organizations as org
left join public.organization_features as features
  on features.organization_id = org.id
where features.organization_id is null;

alter table public.organization_features enable row level security;
revoke all on public.organization_features from anon, authenticated;
