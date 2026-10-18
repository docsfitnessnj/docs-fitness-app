-- Doc's Fitness — migration 018
-- ============================================================================
-- Brings the app's full five-emoji reaction set (❤️ 🤙 🔥 💪 😂 — see
-- REACTION_EMOJIS in CommunityContext.tsx) to Community comments, replacing
-- the old single-heart "like."
--
-- COMMENT LIKES, STATED PLAINLY: there is no pre-existing comment-like data
-- anywhere in this database to carry over. community_comments has never had
-- a likes column, and no earlier migration ever created a comment_likes (or
-- similarly named) table — confirmed by reading every prior migration and
-- the current app code: PostDetailModal.tsx's heart-outline count read
-- `comment.likes`, and CommunityContext.tsx's rowToPost hardcoded that
-- field to the literal 0 for every comment, never from a database column.
-- The old heart affordance was decorative only — it never had a working
-- tap handler and never persisted anything. So there is nothing to convert
-- or lose here; this migration does not touch community_comments at all and
-- carries nothing over, because there is genuinely nothing stored to carry.
-- (Compare migration_014.sql's community_reactions 🤙→❤️ conversion, which
-- WAS real data from a real prior like button on POSTS — a different
-- feature from this one, already migrated two rounds ago.)
--
-- NEW TABLE — community_comment_reactions, same shape and RLS as
-- community_reactions (posts' own reaction table): one row per
-- (comment, member, emoji), react as yourself, remove only your own, no
-- admin override on deletion (identical to how post reactions already
-- work).
--
-- REALTIME, STATED PLAINLY: Community (community_posts, community_comments,
-- community_reactions) has never been added to the supabase_realtime
-- publication and CommunityContext.tsx has no Realtime subscription at all
-- — every reaction, comment, and post update there is a plain refetch()
-- after a write, not a live push. This migration does NOT add
-- community_comment_reactions to supabase_realtime either, matching that
-- existing (non-live, refetch-based) behavior exactly. No realtime
-- publication settings are changed by this migration.
--
-- Run this AFTER migration_017.sql. Safe to run once, and safe to re-run —
-- table/policy creation is fully guarded ("if not exists" / drop-then-
-- create by name).
-- ============================================================================

create table if not exists public.community_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, author_id, emoji)
);

alter table public.community_comment_reactions enable row level security;

drop policy if exists "comment reactions are readable by any signed-in member" on public.community_comment_reactions;
create policy "comment reactions are readable by any signed-in member"
  on public.community_comment_reactions for select
  to authenticated
  using (true);

drop policy if exists "members can react to comments as themselves" on public.community_comment_reactions;
create policy "members can react to comments as themselves"
  on public.community_comment_reactions for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "members can remove their own comment reaction" on public.community_comment_reactions;
create policy "members can remove their own comment reaction"
  on public.community_comment_reactions for delete
  to authenticated
  using (author_id = auth.uid());
