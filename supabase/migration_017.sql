-- Doc's Fitness — migration 017
-- ============================================================================
-- Adds GIF support (GIPHY-powered) to DOC'S GROUP CHAT and the Community
-- comment composer.
--
-- GROUP_CHAT_MESSAGES already had media_url/media_type (migration_014.sql),
-- constrained to ('image', 'video') — this widens that constraint to also
-- allow 'gif'. A GIF message's media_url is GIPHY's own CDN URL, never a
-- Supabase Storage path — GIPHY's terms prohibit rehosting their media, so
-- nothing is ever uploaded for a GIF (see sendMessage in useGroupChat.ts).
--
-- COMMUNITY_COMMENTS never had ANY media support before this — this adds
-- the same media_url/media_type SHAPE every other media-bearing table in
-- this schema already uses (community_posts, doc_messages,
-- group_chat_messages), but constrained to just ('gif') for now, since GIF
-- is the only media kind a comment can carry as of this round — not a
-- general photo/video attachment feature, which was never asked for here.
--
-- Run this AFTER migration_016.sql. Safe to run once, and safe to re-run —
-- every statement either uses "if not exists" or drops-then-recreates a
-- constraint by its (deterministic, Postgres-default) name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- GROUP_CHAT_MESSAGES — widen media_type to also allow 'gif'
-- ----------------------------------------------------------------------------
alter table public.group_chat_messages drop constraint if exists group_chat_messages_media_type_check;
alter table public.group_chat_messages
  add constraint group_chat_messages_media_type_check check (media_type in ('image', 'video', 'gif'));

-- ----------------------------------------------------------------------------
-- COMMUNITY_COMMENTS — new media_url/media_type columns, gif-only. No RLS
-- changes needed: the existing insert/update/delete policies (migration
-- setup.sql) already apply broadly to the row, not to specific columns.
-- ----------------------------------------------------------------------------
alter table public.community_comments add column if not exists media_url text;
alter table public.community_comments
  add column if not exists media_type text check (media_type in ('gif'));
