-- Doc's Fitness — migration 012
-- ============================================================================
-- Adds DOC'S GROUP CHAT: one shared, live group chat for the whole paid
-- membership. Run this AFTER migration_011.sql. Safe to run once, and safe
-- to re-run (every statement uses "if not exists" / "or replace" / "drop ...
-- if exists", same convention as every migration before this one).
--
-- This migration also creates the "group-chat-media" storage bucket for
-- message photos and enables Supabase Realtime (the "supabase_realtime"
-- publication) on the two new tables plus `profiles` — nothing to create by
-- hand in the Supabase dashboard beyond running this file. See the PR
-- description for the one thing that IS manual: confirming Realtime is
-- turned on for this project (it is on by default for every Supabase
-- project, so this is a "double check," not a setup step).
--
-- WHO CAN USE IT: exactly the members MembershipContext's `fullContentAccess`
-- already treats as full access — admin, an active trial, or any paying
-- plan (online monthly/annual/founding, or in-person Monthly Unlimited).
-- `public.has_group_chat_access` below mirrors that exact rule in SQL so
-- access is enforced by RLS, not just hidden in the UI. Ten Pack, Drop In,
-- lapsed/free accounts, and signed-out visitors can never select or insert a
-- row here no matter what the client sends.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ACCESS RULE — shared by every policy below
-- ----------------------------------------------------------------------------
create or replace function public.has_group_chat_access(uid uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_admin(uid)
    or exists (
      select 1 from public.profiles p
      where p.id = uid and p.in_person_plan = 'monthly_unlimited'
    )
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid and s.status in ('trialing', 'active')
    );
$$;

create or replace function public.is_group_chat_muted(uid uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select p.group_chat_muted from public.profiles p where p.id = uid), false);
$$;

-- ----------------------------------------------------------------------------
-- profiles.group_chat_muted — admin's per-member mute flag (Member Manager).
-- Admin needs to write this on OTHER members' rows, which the existing
-- "members can update their own profile" policy (id = auth.uid() only)
-- doesn't allow — add the one admin-write policy this needs. Same shape as
-- "own post or admin can edit" on community_posts.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists group_chat_muted boolean not null default false;

drop policy if exists "admin can update any profile" on public.profiles;
create policy "admin can update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- DOC'S GROUP CHAT — messages
-- Text, an optional photo, or both. No titles, no threads, no editing — a
-- message can only ever be soft-deleted (the `deleted` flag), never changed,
-- enforced below by a trigger (RLS alone can't express "this column only").
-- ----------------------------------------------------------------------------
create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  -- The public storage URL of an attached photo (task's "photo path"),
  -- same convention as community_posts.media_url / profiles.avatar_url —
  -- the app always stores the full public URL, not a bare storage path.
  photo_url text,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists group_chat_messages_created_at_idx
  on public.group_chat_messages (created_at desc);

alter table public.group_chat_messages enable row level security;

drop policy if exists "paid, trial, and admin members can read group chat messages" on public.group_chat_messages;
create policy "paid, trial, and admin members can read group chat messages"
  on public.group_chat_messages for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

drop policy if exists "paid or trial members post as themselves, muted members cannot post" on public.group_chat_messages;
create policy "paid or trial members post as themselves, muted members cannot post"
  on public.group_chat_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.has_group_chat_access(auth.uid())
    and not public.is_group_chat_muted(auth.uid())
  );

drop policy if exists "own message or admin can soft delete" on public.group_chat_messages;
create policy "own message or admin can soft delete"
  on public.group_chat_messages for update
  to authenticated
  using (sender_id = auth.uid() or public.is_admin(auth.uid()))
  with check (sender_id = auth.uid() or public.is_admin(auth.uid()));

-- A member can delete their own message; admin can delete any message —
-- "delete" is always this soft-delete update, never a real DELETE (no
-- delete policy exists below, so an actual DELETE is rejected outright).
-- Nothing else about a message may ever change, and a deleted message can't
-- be undeleted.
create or replace function public.enforce_group_chat_message_delete_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.photo_url is distinct from old.photo_url
     or new.created_at is distinct from old.created_at then
    raise exception 'Group chat messages cannot be edited, only deleted.';
  end if;

  if old.deleted and not new.deleted then
    raise exception 'A deleted group chat message cannot be restored.';
  end if;

  return new;
end;
$$;

drop trigger if exists group_chat_messages_delete_only on public.group_chat_messages;
create trigger group_chat_messages_delete_only
  before update on public.group_chat_messages
  for each row execute function public.enforce_group_chat_message_delete_only();

-- ----------------------------------------------------------------------------
-- DOC'S GROUP CHAT — cheers
-- The one reaction this feature has. A member can cheer a given message at
-- most once (the unique constraint below is what toggling on the client
-- relies on) and can only ever remove their own cheer.
-- ----------------------------------------------------------------------------
create table if not exists public.group_chat_cheers (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_chat_messages (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, member_id)
);

create index if not exists group_chat_cheers_message_id_idx
  on public.group_chat_cheers (message_id);

alter table public.group_chat_cheers enable row level security;

drop policy if exists "paid, trial, and admin members can read cheers" on public.group_chat_cheers;
create policy "paid, trial, and admin members can read cheers"
  on public.group_chat_cheers for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

-- Cheering is allowed even while muted — muting only turns off posting
-- messages, per this round's spec. Blocked on an already-deleted message
-- (nothing to cheer).
drop policy if exists "members can cheer a message as themselves" on public.group_chat_cheers;
create policy "members can cheer a message as themselves"
  on public.group_chat_cheers for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.has_group_chat_access(auth.uid())
    and exists (
      select 1 from public.group_chat_messages m
      where m.id = message_id and not m.deleted
    )
  );

drop policy if exists "members can remove their own cheer" on public.group_chat_cheers;
create policy "members can remove their own cheer"
  on public.group_chat_cheers for delete
  to authenticated
  using (member_id = auth.uid());

-- ----------------------------------------------------------------------------
-- DOC'S GROUP CHAT — pinned prompt
-- One settings row (same singleton-row pattern as founding_fifty_settings)
-- holding the single admin-set prompt shown pinned under the chat header.
-- Null/blank means "nothing pinned" — the app's own rule is the card simply
-- doesn't render in that case.
-- ----------------------------------------------------------------------------
create table if not exists public.group_chat_settings (
  id int primary key default 1,
  pinned_prompt text,
  updated_at timestamptz not null default now(),
  constraint group_chat_settings_singleton check (id = 1)
);

alter table public.group_chat_settings enable row level security;

drop policy if exists "paid, trial, and admin members can read the pinned prompt" on public.group_chat_settings;
create policy "paid, trial, and admin members can read the pinned prompt"
  on public.group_chat_settings for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

drop policy if exists "only admin can set or clear the pinned prompt" on public.group_chat_settings;
create policy "only admin can set or clear the pinned prompt"
  on public.group_chat_settings for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

insert into public.group_chat_settings (id, pinned_prompt)
values (1, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- STORAGE: group-chat-media bucket
-- Same public-read / owner-write shape as avatars and message-media — a
-- member's own folder is "<their user id>/<filename>", checked directly
-- from the upload path.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('group-chat-media', 'group-chat-media', true)
on conflict (id) do nothing;

drop policy if exists "group chat photos are publicly viewable" on storage.objects;
create policy "group chat photos are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'group-chat-media');

drop policy if exists "a member with chat access uploads into their own folder" on storage.objects;
create policy "a member with chat access uploads into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_group_chat_access(auth.uid())
    and not public.is_group_chat_muted(auth.uid())
  );

drop policy if exists "the uploader or admin can delete a group chat photo" on storage.objects;
create policy "the uploader or admin can delete a group chat photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-chat-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- REALTIME — turn on live postgres_changes delivery for the tables this
-- feature needs pushed live: new/deleted messages, cheer counts, and (scoped
-- to just the signed-in member's own row via a client-side `filter`) their
-- own `group_chat_muted` flag, so muting takes effect without a refresh.
-- `alter publication ... add table` errors if the table is already a
-- member, so this is guarded to stay safe to re-run.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_chat_messages'
  ) then
    alter publication supabase_realtime add table public.group_chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_chat_cheers'
  ) then
    alter publication supabase_realtime add table public.group_chat_cheers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- admin_list_members() — add group_chat_muted so Member Manager can show and
-- toggle it per member. Same function, one more returned column.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_members()
returns table (
  id uuid,
  display_name text,
  email text,
  how_train text,
  in_person_plan text,
  is_admin boolean,
  created_at timestamptz,
  founding_member boolean,
  sub_status text,
  sub_plan text,
  sub_current_period_end timestamptz,
  sub_trial_end timestamptz,
  sub_cancel_at_period_end boolean,
  group_chat_muted boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.display_name,
    u.email,
    p.how_train,
    p.in_person_plan,
    p.is_admin,
    p.created_at,
    (f.id is not null) as founding_member,
    s.status,
    s.plan,
    s.current_period_end,
    s.trial_end,
    s.cancel_at_period_end,
    p.group_chat_muted
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_fifty_members f on f.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

grant execute on function public.admin_list_members() to authenticated;
