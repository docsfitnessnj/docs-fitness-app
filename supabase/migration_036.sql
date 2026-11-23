-- Doc's Fitness — migration 036
-- ============================================================================
-- Round 66: Doc's Stories go real -- server-backed, admin-posted, 24-hour
-- expiry, replacing the device-local seed array StoriesContext.tsx has run
-- on since it was first built.
--
-- Two pieces, both additive and safe to re-run:
-- 1. public.stories -- one row per posted story (photo or video). "Live
--    for exactly 24 hours from created_at" is enforced in the SELECT RLS
--    policy itself (`created_at > now() - interval '24 hours'`), never
--    client clock math alone -- the exact same "the read path is the
--    enforcement" shape migration_030.sql's own scheduled_weeks release_at
--    gate already established. Admin can always read every story
--    (including an expired one), the same admin-sees-everything carve-out
--    scheduled_weeks's own RLS already uses, so the admin posting screen
--    can show and manage a story that members themselves no longer can.
--    No UPDATE policy at all -- a story isn't edited once posted, only
--    posted or deleted, the same one-way shape Instagram's own stories use.
-- 2. The "story-media" storage bucket -- same public-bucket / RLS-select
--    shape as community-media (migration_026.sql) and group-chat-media
--    (migration_012.sql): `public: true` with a `select ... to public`
--    policy (the house's own established convention: every media bucket in
--    this app is a public URL at the storage layer, with the real access
--    control enforced one level up, by the database row's own RLS and by
--    the app's UI gating -- not by the storage object URL itself). INSERT
--    and DELETE are admin-only, since only Doc ever posts a story -- unlike
--    community-media/group-chat-media's own "a member uploads into their
--    own folder" shape, there is no non-admin uploader to carve out a
--    folder for at all. 100MB cap -- generous for a real phone-recorded
--    video story, well above community-media's own 50MB post-photo cap.
--
-- Safe to run once, and safe to re-run.
-- ============================================================================

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

-- Any signed-in member reads a story for the 24 hours after it's posted;
-- admin can always read every story, live or expired, so the admin posting
-- screen itself can show and manage what's currently up regardless of age.
drop policy if exists "a story is readable for 24 hours, admin always" on public.stories;
create policy "a story is readable for 24 hours, admin always"
  on public.stories for select
  to authenticated
  using (created_at > now() - interval '24 hours' or public.is_admin(auth.uid()));

drop policy if exists "only admin can post a story" on public.stories;
create policy "only admin can post a story"
  on public.stories for insert
  to authenticated
  with check (public.is_admin(auth.uid()) and (created_by is null or created_by = auth.uid()));

drop policy if exists "only admin can delete a story" on public.stories;
create policy "only admin can delete a story"
  on public.stories for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- STORAGE: story-media bucket -- same public-read / admin-write shape as
-- community-media and group-chat-media, see the header comment above for
-- why INSERT/DELETE are admin-only rather than owner-folder-scoped.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('story-media', 'story-media', true, 104857600)
on conflict (id) do nothing;

drop policy if exists "story media is publicly viewable" on storage.objects;
create policy "story media is publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'story-media');

drop policy if exists "only admin uploads story media" on storage.objects;
create policy "only admin uploads story media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'story-media' and public.is_admin(auth.uid()));

drop policy if exists "only admin deletes story media" on storage.objects;
create policy "only admin deletes story media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'story-media' and public.is_admin(auth.uid()));
