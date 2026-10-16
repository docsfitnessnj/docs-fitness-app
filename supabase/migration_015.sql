-- Doc's Fitness — migration 015
-- ============================================================================
-- Adds a poster-thumbnail column to DOC'S GROUP CHAT's messages table. A
-- video message now carries a lightweight JPEG frame captured client-side
-- at send time (see src/lib/videoThumbnail.ts) and uploaded alongside the
-- video — the message list renders ONLY this image, never the video file
-- itself, until a member actually taps through to play it.
--
-- Run this AFTER migration_014.sql. Safe to run once, and safe to re-run —
-- the column add is guarded, and no data migration is needed: existing
-- video messages simply have thumbnail_url = null and keep showing the
-- plain placeholder they always have (see DocsGroupChatScreen.tsx's
-- fallback), exactly the pre-this-migration behavior for them. ORDER: the
-- column is added before the trigger function is replaced to reference it;
-- no DROP TRIGGER is needed here (unlike migration_014.sql's media_url
-- rename) because this migration contains no UPDATE statement of its own
-- that would fire group_chat_messages_delete_only against a function body
-- that hasn't been replaced yet.
-- ============================================================================

alter table public.group_chat_messages
  add column if not exists thumbnail_url text;

-- Extends the existing "nothing about a sent message may change, only its
-- `deleted` flag" rule to cover the new column too — same function, same
-- signature (name, args, return type all unchanged), just one more field
-- in the immutability check.
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
     or new.thumbnail_url is distinct from old.thumbnail_url
     or new.created_at is distinct from old.created_at then
    raise exception 'Group chat messages cannot be edited, only deleted.';
  end if;

  if old.deleted and not new.deleted then
    raise exception 'A deleted group chat message cannot be restored.';
  end if;

  return new;
end;
$$;
