-- Doc's Fitness — migration 016
-- ============================================================================
-- Two independent changes to DOC'S GROUP CHAT:
--
-- PART 1 — honest video upload limits. Explicitly caps the group-chat-media
-- storage bucket's per-file size at Supabase's current plan maximum (50MB)
-- via its own file_size_limit column, instead of relying solely on the
-- platform's own enforcement. `storage.buckets.file_size_limit` is a column
-- Supabase's own storage schema already provides in every project — this
-- only ever UPDATEs an existing row (inserted back in migration_012.sql),
-- never alters storage's own table structure. The REAL client-side fix (a
-- clear, instant, no-upload-attempted rejection for an oversized file) is
-- MAX_GROUP_CHAT_UPLOAD_BYTES in src/lib/useGroupChat.ts — keep the two
-- numbers in sync; this bucket setting is the honest, defense-in-depth
-- backstop for the rare case that check is ever bypassed (e.g. a future
-- platform the client-side check hasn't been ported to), not the primary
-- fix. If the project's plan upgrades the real per-file cap, update BOTH:
-- this migration doesn't retroactively change anything on its own; someone
-- still has to write the next one. (If this project's Supabase plan is ever
-- below 50MB already — unlikely, since 50MB has been the published free-tier
-- cap — this UPDATE would be LOWERING the limit relative to what the
-- platform already enforces, which is always safe and never rejected.)
--
-- PART 2 — DOC'S GROUP CHAT's unread badge. One row per member, holding
-- only when they last read the chat. Written by the client (see
-- GroupChatUnreadContext.tsx) both when they open the chat (mark
-- everything up to now as read) and again on every new message that
-- arrives while they're actively viewing it (keeps last_read_at current
-- throughout the whole time the screen is open, not just at the moment it
-- opened, so an abrupt close — tab killed, browser crash — never leaves a
-- gap the badge would wrongly resurrect next time). The unread COUNT
-- itself is never stored here or anywhere else; it's computed client-side
-- each time as "messages newer than my last_read_at, not mine, not
-- deleted" — this table is only ever the one timestamp that count is
-- computed against. A member with no row yet (never opened the chat even
-- once) is treated as having read nothing — every existing message counts
-- as unread, which is the honest answer for a member who's genuinely never
-- seen any of it.
--
-- Run this AFTER migration_015.sql. Safe to run once, and safe to re-run.
-- ORDER: the UPDATE in part 1 only touches storage.buckets, entirely
-- independent of part 2's new table — no ordering constraint between the
-- two parts themselves. Within part 2, the table is created (guarded) and
-- RLS enabled on it before any policy referencing it is created, and
-- has_group_chat_access (used by the insert policy's WITH CHECK) already
-- exists as of migration_012.sql, well before this migration runs.
-- ============================================================================

-- PART 1
update storage.buckets
set file_size_limit = 52428800 -- 50MB in bytes; keep in sync with MAX_GROUP_CHAT_UPLOAD_BYTES (src/lib/useGroupChat.ts)
where id = 'group-chat-media';

-- PART 2
create table if not exists public.group_chat_reads (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.group_chat_reads enable row level security;

drop policy if exists "members read only their own read position" on public.group_chat_reads;
create policy "members read only their own read position"
  on public.group_chat_reads for select
  to authenticated
  using (member_id = auth.uid());

-- Same access gate as the chat itself (has_group_chat_access) — a member
-- without chat access should never be able to create a read-position row
-- in the first place, even though nothing would actually read it back for
-- them (the client only ever queries this for itself, gated the same way).
drop policy if exists "members insert only their own read position" on public.group_chat_reads;
create policy "members insert only their own read position"
  on public.group_chat_reads for insert
  to authenticated
  with check (member_id = auth.uid() and public.has_group_chat_access(auth.uid()));

drop policy if exists "members update only their own read position" on public.group_chat_reads;
create policy "members update only their own read position"
  on public.group_chat_reads for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());
