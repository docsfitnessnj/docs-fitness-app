-- Doc's Fitness — migration 014
-- ============================================================================
-- Two independent changes from this round's polish/bug-fix pass:
--
-- 1. COMMUNITY_REACTIONS data migration — the feed card's old dedicated
--    heart "like" button is gone (the ❤️ reaction pill now IS the like).
--    Every row stored as 🤙 (what the old like button used to write — see
--    migration_013.sql) is converted to ❤️ so no existing like is lost,
--    resolving the case where a member already had both 🤙 and ❤️ on the
--    same post the same way migration_013.sql resolved the 👍/🤙 case: drop
--    the now-redundant row, then convert what's left. Pure data, no schema
--    dependency, so it's listed first.
--
-- 2. GROUP_CHAT_MESSAGES schema migration — the column that held a message's
--    attached photo was always photo-url-only (text, no type), so a video
--    uploaded fine but had no way to tell the receiving side it wasn't a
--    photo — it silently failed to render anywhere. Renamed to media_url
--    and paired with a media_type column, same shape as community_posts and
--    doc_messages already use. Existing rows backfill as 'image' (every
--    message sent before this migration really was photo-only).
--
-- Run this AFTER migration_013.sql. Safe to run once, and safe to re-run —
-- the reaction conversion only ever touches remaining 🤙 rows (none are left
-- after the first run), the column rename is guarded to a no-op if it
-- already happened, and every other statement uses "if not exists" / "or
-- replace". ORDER: the media_url rename + media_type column are created
-- BEFORE enforce_group_chat_message_delete_only() is recreated to reference
-- them — that function's signature (name, args, return type) is unchanged,
-- so no drop is needed before the replace, only a body update. The
-- group_chat_messages_delete_only trigger itself is dropped before the
-- media_type backfill UPDATE below and recreated after: that backfill is
-- itself a real UPDATE on the table the trigger protects, and firing the
-- OLD trigger body mid-migration would either reject the backfill outright
-- (its whole job is "nothing may change except via soft-delete") or, if it
-- ran before the rename, fail with "record NEW has no field photo_url" the
-- moment the column was gone — both learned the hard way running this
-- against a simulated production database before settling on this order.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COMMUNITY_REACTIONS — convert every stored 🤙 (the old like button's
-- emoji) to ❤️. A member can only hold one row per (post_id, author_id,
-- emoji) — someone who already reacted with both 🤙 and ❤️ on the same post
-- would violate that constraint if we just renamed their 🤙 row, so first
-- drop the now-redundant 🤙 row in that case, then convert every 🤙 row
-- that's left (the member never also used ❤️).
-- ----------------------------------------------------------------------------
delete from public.community_reactions dup
where dup.emoji = '🤙'
  and exists (
    select 1 from public.community_reactions keep
    where keep.post_id = dup.post_id
      and keep.author_id = dup.author_id
      and keep.emoji = '❤️'
  );

update public.community_reactions
set emoji = '❤️'
where emoji = '🤙';

-- ----------------------------------------------------------------------------
-- GROUP_CHAT_MESSAGES — photo_url -> media_url + media_type
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_chat_messages' and column_name = 'photo_url'
  ) then
    alter table public.group_chat_messages rename column photo_url to media_url;
  end if;
end $$;

alter table public.group_chat_messages
  add column if not exists media_type text check (media_type in ('image', 'video'));

-- Drop the delete-only trigger before the backfill below — that trigger's
-- entire job is blocking any UPDATE that isn't a soft-delete, which would
-- otherwise reject (or, with the old function body still in place, error
-- outright on the now-renamed column) the very backfill this migration
-- needs to run. Recreated right after, once both the columns and the
-- function body are correct.
drop trigger if exists group_chat_messages_delete_only on public.group_chat_messages;

update public.group_chat_messages
set media_type = 'image'
where media_url is not null and media_type is null;

-- This trigger's body is updated to check media_url/media_type (previously
-- photo_url); the function's own signature (name, args, return type) never
-- changes, so a plain replace is all that's needed, and it only runs after
-- the column rename above so media_url already exists.
create or replace function public.enforce_group_chat_message_delete_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.media_url is distinct from old.media_url
     or new.media_type is distinct from old.media_type
     or new.created_at is distinct from old.created_at then
    raise exception 'Group chat messages cannot be edited, only deleted.';
  end if;

  if old.deleted and not new.deleted then
    raise exception 'A deleted group chat message cannot be restored.';
  end if;

  return new;
end;
$$;

create trigger group_chat_messages_delete_only
  before update on public.group_chat_messages
  for each row execute function public.enforce_group_chat_message_delete_only();
