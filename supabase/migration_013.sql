-- Doc's Fitness — migration 013
-- ============================================================================
-- Retires the thumbs-up 👍 reaction app-wide in favor of shaka 🤙, and gives
-- DOC'S GROUP CHAT cheers the same 4-emoji reaction set the Community feed
-- uses (🤙 shaka, 🔥 fire, 💪 flex, ❤️ heart) instead of its one single
-- megaphone cheer. Run this AFTER migration_012.sql. Safe to run once, and
-- safe to re-run — the data conversion below only ever touches remaining 👍
-- rows (there are none left after the first run), and every schema
-- statement uses "if exists" / "if not exists", same convention as every
-- migration before this one.
--
-- ORDER OF OPERATIONS (also described in the PR): first the community_
-- reactions DATA migration (every stored 👍 row becomes 🤙, resolving the
-- case where a member already reacted with both), then the group_chat_
-- cheers SCHEMA migration (add the emoji column — which backfills every
-- existing cheer row as 🤙 — then swap the old one-cheer-per-message unique
-- constraint for one that allows one row per (message, member, emoji)). No
-- function here changes its return type, so there's nothing to drop before
-- recreating; the column is added before the constraint that depends on it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COMMUNITY_REACTIONS — convert every stored 👍 to 🤙
-- A member can only hold one row per (post_id, author_id, emoji) (see the
-- unique constraint in setup.sql). Someone who already reacted with both 👍
-- and 🤙 on the same post would violate that constraint if we just renamed
-- their 👍 row to 🤙 — so first drop the now-redundant 👍 row in that case,
-- then convert every 👍 row that's left (the member never also used 🤙).
-- ----------------------------------------------------------------------------
delete from public.community_reactions dup
where dup.emoji = '👍'
  and exists (
    select 1 from public.community_reactions keep
    where keep.post_id = dup.post_id
      and keep.author_id = dup.author_id
      and keep.emoji = '🤙'
  );

update public.community_reactions
set emoji = '🤙'
where emoji = '👍';

-- ----------------------------------------------------------------------------
-- GROUP_CHAT_CHEERS — one cheer type to four
-- Was: at most one cheer per (message, member) — an undifferentiated
-- megaphone. Now: at most one reaction per (message, member, emoji), same
-- shape as community_reactions. Adding a NOT NULL column with a DEFAULT
-- backfills every existing row with that default, so every pre-existing
-- cheer becomes a shaka automatically — nothing else to migrate.
-- ----------------------------------------------------------------------------
alter table public.group_chat_cheers
  add column if not exists emoji text not null default '🤙';

alter table public.group_chat_cheers
  drop constraint if exists group_chat_cheers_message_id_member_id_key;

alter table public.group_chat_cheers
  drop constraint if exists group_chat_cheers_message_id_member_id_emoji_key;

alter table public.group_chat_cheers
  add constraint group_chat_cheers_message_id_member_id_emoji_key unique (message_id, member_id, emoji);
