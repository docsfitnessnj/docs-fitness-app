-- Doc's Fitness — migration 005
-- ============================================================================
-- Adds the FOUNDING 50 launch offer's real backend: a settings row holding
-- the launch window (starts_at/ends_at) Doc sets from the admin area, and a
-- real table of who's actually claimed one of the 50 spots. Before this
-- migration, "The Founding 50" only existed as a device-local on/off flag
-- and a device-local roster (see src/context/FoundingFiftyContext.tsx) —
-- every device had its own separate, fake count. This replaces that with
-- real, shared, permanent rows so the live "X of 50 claimed" count on the
-- Memberships screen is the same true number everywhere, and one member can
-- never claim more than one spot.
--
-- Run this AFTER supabase/setup.sql. Safe to run once, and safe to re-run.
--
-- Doc: you must run this migration for the FOUNDING 50 LAUNCH admin section
-- and the live spots-claimed counter to work at all.
-- ============================================================================

create table if not exists public.founding_fifty_settings (
  id int primary key default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  constraint founding_fifty_settings_singleton check (id = 1)
);

alter table public.founding_fifty_settings enable row level security;

drop policy if exists "founding fifty settings readable by any signed-in member" on public.founding_fifty_settings;
create policy "founding fifty settings readable by any signed-in member"
  on public.founding_fifty_settings for select
  to authenticated
  using (true);

drop policy if exists "only admin can set the founding fifty launch window" on public.founding_fifty_settings;
create policy "only admin can set the founding fifty launch window"
  on public.founding_fifty_settings for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

insert into public.founding_fifty_settings (id, starts_at, ends_at)
values (1, null, null)
on conflict (id) do nothing;

create table if not exists public.founding_fifty_members (
  id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.founding_fifty_members enable row level security;

drop policy if exists "founding fifty roster readable by any signed-in member" on public.founding_fifty_members;
create policy "founding fifty roster readable by any signed-in member"
  on public.founding_fifty_members for select
  to authenticated
  using (true);

drop policy if exists "members can claim their own founding fifty spot" on public.founding_fifty_members;
create policy "members can claim their own founding fifty spot"
  on public.founding_fifty_members for insert
  to authenticated
  with check (id = auth.uid());

create or replace function public.enforce_founding_fifty_capacity()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.founding_fifty_members) >= 50 then
    raise exception 'The Founding 50 is sold out.';
  end if;
  return new;
end;
$$;

drop trigger if exists founding_fifty_capacity_check on public.founding_fifty_members;
create trigger founding_fifty_capacity_check
  before insert on public.founding_fifty_members
  for each row execute function public.enforce_founding_fifty_capacity();
