import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { loadJSON, saveJSON } from '../lib/storage';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';
import { showAlert } from '../lib/alert';

const LAST_VIEWED_STORAGE_KEY = 'docsfitness.communityLastViewed.v1';

// Round 28 root cause: a web-picked photo/video was never actually
// uploaded anywhere -- addTextPost/addWodResultPost/updateTextPost wrote
// `media.uri` straight into `media_url`, and on web that's a
// `URL.createObjectURL()` blob: URL, valid only inside the browser
// document that created it (documented as a known, not-yet-fixed gap
// since Round 18). It rendered fine for the posting member, in the same
// session, right up until a reload, a different device, or a different
// account tried to load that same URL and got nothing -- exactly "photos
// silently vanish for every member." This uploads any locally-picked
// (blob:) media to the real `community-media` Storage bucket
// (migration_026.sql) before it's ever written to the database, the same
// shape useGroupChat.ts's uploadGroupChatFile already uses for chat
// media. A `uri` that isn't a blob: URL (editing a post without touching
// its existing already-durable media, or a native file:// URI) passes
// through untouched -- there's nothing local left to upload.
const COMMUNITY_MEDIA_BUCKET = 'community-media';

async function uploadCommunityMedia(userId: string, media: MediaAttachment): Promise<MediaAttachment> {
  if (!media.uri.startsWith('blob:')) return media;
  const response = await fetch(media.uri);
  const blob = await response.blob();
  const extension = media.type === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from(COMMUNITY_MEDIA_BUCKET)
    .upload(path, blob, { upsert: false, contentType: blob.type || undefined, cacheControl: `${60 * 60 * 24 * 365}` });
  if (error) throw error;
  const { data } = supabase.storage.from(COMMUNITY_MEDIA_BUCKET).getPublicUrl(path);
  return { ...media, uri: data.publicUrl };
}

export type Comment = {
  id: string;
  author: string;
  text: string;
  timeLabel: string;
  // Full five-emoji reaction set (migration_018.sql), replacing the old
  // single-heart like — same shape as Post's own reactions/myReactions
  // below, just scoped to this one comment.
  reactions: Record<string, number>;
  myReactions: string[];
  // GIPHY-powered (see lib/giphy.ts) — the only media kind a comment
  // supports. GIPHY's own CDN URL, never uploaded anywhere.
  mediaUrl?: string | null;
};

export type WodPostMeta = {
  workoutTitle: string;
  dateLabel: string;
  notes: string;
  resultsLine?: string;
};

export type Post = {
  id: string;
  author: string;
  authorId: string;
  timeLabel: string;
  createdAt: number;
  title: string;
  text: string;
  category: string;
  media?: MediaAttachment | null;
  reactions: Record<string, number>;
  // Which of REACTION_EMOJIS this viewer has already placed — drives the
  // "active" pill styling and lets a tap toggle a reaction off (see
  // addReaction below). The heart ❤️ is just REACTION_EMOJIS[0]; there's no
  // separate "like" concept anymore.
  myReactions: string[];
  comments: Comment[];
  pinned: boolean;
  kind: 'text' | 'wod';
  meta?: WodPostMeta;
  // Unseen activity (new post or new comment) — shows the gold dot / "New comment" label.
  unread: boolean;
};

// Was ['🤙', '🔥', '💪', '❤️'] (and before that ['👍', '🔥', '💪', '❤️']) —
// heart now leads since it's the one that used to live as its own separate
// "like" button; migration_014.sql converts every stored 🤙 row (the old
// like button's emoji) to ❤️ so no like is lost. Nothing else about the
// reaction mechanism changed; this is purely order + which emoji strings
// are valid. The feed card's old dedicated heart "like" button is gone
// (see PostCard / PostDetailModal) — the ❤️ pill in this same row is now
// the only way to like a post, exactly like every other reaction. 😂 added
// at the end (round after GIF support) — both the cheers (group chat) and
// reactions (Community) tables store the emoji character itself in a plain
// text column with no check constraint on which characters are allowed, so
// adding a fifth value here is the entire change; nothing in the database
// needed to move.
export const REACTION_EMOJIS = ['❤️', '🤙', '🔥', '💪', '😂'] as const;

type CommunityContextValue = {
  loading: boolean;
  error: string | null;
  posts: Post[];
  // `author` is accepted for compatibility with existing call sites, but
  // ignored — the real author is always the signed-in member (author_id =
  // auth.uid(), enforced by RLS), never whatever string is passed in.
  addTextPost: (author: string, title: string, text: string, category?: string, media?: MediaAttachment | null) => Promise<void>;
  addWodResultPost: (author: string, title: string, meta: WodPostMeta, media?: MediaAttachment | null) => Promise<void>;
  updateTextPost: (postId: string, title: string, text: string, media?: MediaAttachment | null) => Promise<void>;
  deletePost: (postId: string) => void;
  // Toggles the given reaction off if this viewer already placed it, on
  // otherwise — the ❤️ pill is this feed's "like," using the exact same
  // call as every other emoji.
  addReaction: (postId: string, emoji: string) => void;
  addComment: (postId: string, author: string, text: string, gifUrl?: string) => void;
  updateComment: (postId: string, commentId: string, text: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  // Same toggle-on/toggle-off mechanism as addReaction, scoped to one
  // comment (migration_018.sql's community_comment_reactions) — replaces
  // the old single-heart like, which was decorative only and never had a
  // working tap handler.
  addCommentReaction: (postId: string, commentId: string, emoji: string) => void;
  // Resolves true if the pin/unpin actually went through — false if the
  // database rejected it (pin limit reached, or not actually an admin).
  togglePin: (postId: string) => Promise<boolean>;
  markRead: (postId: string) => void;
};

const CommunityContext = createContext<CommunityContextValue | undefined>(undefined);

type ProfileRef = { display_name: string } | { display_name: string }[] | null;

function nameOf(ref: ProfileRef): string {
  const profile = Array.isArray(ref) ? ref[0] : ref;
  return profile?.display_name?.trim() || 'Member';
}

type ReactionRow = { emoji: string; author_id: string };

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  media_url: string | null;
  profiles: ProfileRef;
  community_comment_reactions: ReactionRow[];
};

// Shared by posts and comments (same shape: a row with an emoji + who
// placed it) — tallies per-emoji counts and which of them this viewer
// placed themselves.
function reactionsOf(rows: ReactionRow[], userId: string | undefined): { reactions: Record<string, number>; myReactions: string[] } {
  const reactions: Record<string, number> = {};
  for (const emoji of REACTION_EMOJIS) reactions[emoji] = 0;
  const myReactions: string[] = [];
  for (const r of rows) {
    reactions[r.emoji] = (reactions[r.emoji] ?? 0) + 1;
    if (r.author_id === userId) myReactions.push(r.emoji);
  }
  return { reactions, myReactions };
}

type PostRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  kind: 'text' | 'wod';
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  workout_title: string | null;
  workout_notes: string | null;
  workout_results_line: string | null;
  pinned: boolean;
  created_at: string;
  author_id: string;
  profiles: ProfileRef;
  community_comments: CommentRow[];
  community_reactions: ReactionRow[];
};

const POST_SELECT =
  'id, title, body, category, kind, media_url, media_type, workout_title, workout_notes, workout_results_line, pinned, created_at, author_id, profiles(display_name), community_comments(id, body, created_at, author_id, media_url, profiles(display_name), community_comment_reactions(emoji, author_id)), community_reactions(emoji, author_id)';

function relativeTimeLabel(ms: number): string {
  const diffMs = Date.now() - ms;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function rowToPost(row: PostRow, userId: string | undefined, lastViewedAt: Record<string, number>): Post {
  const { reactions, myReactions } = reactionsOf(row.community_reactions, userId);

  const comments: Comment[] = [...row.community_comments]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((c) => {
      const commentReactions = reactionsOf(c.community_comment_reactions, userId);
      return {
        id: c.id,
        author: nameOf(c.profiles),
        text: c.body,
        timeLabel: relativeTimeLabel(new Date(c.created_at).getTime()),
        reactions: commentReactions.reactions,
        myReactions: commentReactions.myReactions,
        mediaUrl: c.media_url ?? null,
      };
    });

  const createdAt = new Date(row.created_at).getTime();
  const latestActivity = comments.length > 0 ? Math.max(createdAt, new Date(row.community_comments[row.community_comments.length - 1].created_at).getTime()) : createdAt;

  return {
    id: row.id,
    author: nameOf(row.profiles),
    authorId: row.author_id,
    timeLabel: relativeTimeLabel(createdAt),
    createdAt,
    title: row.title,
    text: row.body,
    category: row.category,
    media: row.media_url ? { uri: row.media_url, type: row.media_type ?? 'image' } : null,
    reactions,
    myReactions,
    comments,
    pinned: row.pinned,
    kind: row.kind,
    meta:
      row.kind === 'wod'
        ? {
            workoutTitle: row.workout_title ?? row.title,
            dateLabel: '',
            notes: row.workout_notes ?? '',
            resultsLine: row.workout_results_line ?? undefined,
          }
        : undefined,
    unread: latestActivity > (lastViewedAt[row.id] ?? 0),
  };
}

// Every member reads the same feed from the `community_posts` /
// `community_comments` / `community_reactions` tables — see
// supabase/setup.sql for the schema and the RLS/trigger rules (max 3
// pinned, pin/moderate-any is admin only) enforced in the database itself,
// not just here in the UI.
export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [rows, setRows] = useState<PostRow[]>([]);
  const [lastViewedAt, setLastViewedAt] = useState<Record<string, number>>(() => loadJSON(LAST_VIEWED_STORAGE_KEY, {}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    if (!user) return Promise.resolve();
    return supabase
      .from('community_posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load the community feed right now." : fetchError.message);
          return;
        }
        setError(null);
        setRows((data as unknown as PostRow[]) ?? []);
      });
  };

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    setLoading(true);
    refetch().then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  useEffect(() => {
    saveJSON(LAST_VIEWED_STORAGE_KEY, lastViewedAt);
  }, [lastViewedAt]);

  const value = useMemo<CommunityContextValue>(() => {
    const posts = [...rows]
      .map((row) => rowToPost(row, user?.id, lastViewedAt))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      });

    type NewPostFields = {
      title: string;
      body: string;
      category: string;
      kind: 'text' | 'wod';
      media_url?: string | null;
      media_type?: 'image' | 'video' | null;
      workout_title?: string | null;
      workout_notes?: string | null;
      workout_results_line?: string | null;
    };

    const insertPost = async (fields: NewPostFields) => {
      if (!user) return;
      await supabase.from('community_posts').insert({ author_id: user.id, ...fields });
      refetch();
    };

    // Shared by every write path below -- uploads a locally-picked (blob:)
    // attachment to real Storage first, and tells the member plainly if
    // that upload itself fails (a real new failure mode this round
    // introduces, distinct from the write afterward) rather than silently
    // posting with no media or leaving them guessing why POST never
    // completed.
    const resolveMedia = async (media: MediaAttachment | null | undefined): Promise<MediaAttachment | null> => {
      if (!media || !user) return media ?? null;
      try {
        return await uploadCommunityMedia(user.id, media);
      } catch (uploadError) {
        showAlert('Photo Didn’t Upload', "Your post's photo or video couldn't be uploaded. Try again.");
        throw uploadError;
      }
    };

    return {
      loading,
      error,
      posts,
      addTextPost: async (_author, title, text, category = 'General', media = null) => {
        const resolved = await resolveMedia(media);
        await insertPost({
          title: title.trim() || text.trim().slice(0, 60),
          body: text,
          category,
          kind: 'text',
          media_url: resolved?.uri ?? null,
          media_type: resolved?.type ?? null,
        });
      },
      addWodResultPost: async (_author, title, meta, media = null) => {
        const resolved = await resolveMedia(media);
        await insertPost({
          title: title.trim() || meta.workoutTitle,
          body: '',
          category: 'Workout',
          kind: 'wod',
          media_url: resolved?.uri ?? null,
          media_type: resolved?.type ?? null,
          workout_title: meta.workoutTitle,
          workout_notes: meta.notes,
          workout_results_line: meta.resultsLine ?? null,
        });
      },
      updateTextPost: async (postId, title, text, media) => {
        if (!user) return;
        const patch: Record<string, unknown> = { title: title.trim() || text.trim().slice(0, 60), body: text };
        if (media !== undefined) {
          const resolved = await resolveMedia(media);
          patch.media_url = resolved?.uri ?? null;
          patch.media_type = resolved?.type ?? null;
        }
        await supabase.from('community_posts').update(patch).eq('id', postId);
        refetch();
      },
      deletePost: async (postId) => {
        setRows((prev) => prev.filter((r) => r.id !== postId));
        await supabase.from('community_posts').delete().eq('id', postId);
      },
      // Tapping a reaction pill toggles it off if this viewer already
      // placed it — same mechanism as group chat's toggleReaction (see
      // useGroupChat.ts). The heart ❤️ is just REACTION_EMOJIS[0]; there's
      // no separate like button or like-specific code path anymore.
      addReaction: async (postId, emoji) => {
        if (!user) return;
        const row = rows.find((r) => r.id === postId);
        const alreadyReacted = row?.community_reactions.some((r) => r.emoji === emoji && r.author_id === user.id);
        if (alreadyReacted) {
          await supabase.from('community_reactions').delete().eq('post_id', postId).eq('author_id', user.id).eq('emoji', emoji);
        } else {
          await supabase.from('community_reactions').insert({ post_id: postId, author_id: user.id, emoji });
        }
        refetch();
      },
      addComment: async (postId, _author, text, gifUrl) => {
        if (!user) return;
        await supabase.from('community_comments').insert({
          post_id: postId,
          author_id: user.id,
          body: text,
          media_url: gifUrl ?? null,
          media_type: gifUrl ? 'gif' : null,
        });
        refetch();
      },
      updateComment: async (postId, commentId, text) => {
        await supabase.from('community_comments').update({ body: text }).eq('id', commentId);
        refetch();
      },
      // Same toggle shape as addReaction above, just scoped to one comment
      // (community_comment_reactions, migration_018.sql) instead of a
      // post. No live Realtime push here either -- same refetch-after-
      // write behavior every other Community write already uses.
      addCommentReaction: async (postId, commentId, emoji) => {
        if (!user) return;
        const post = rows.find((r) => r.id === postId);
        const comment = post?.community_comments.find((c) => c.id === commentId);
        const alreadyReacted = comment?.community_comment_reactions.some((r) => r.emoji === emoji && r.author_id === user.id);
        if (alreadyReacted) {
          await supabase.from('community_comment_reactions').delete().eq('comment_id', commentId).eq('author_id', user.id).eq('emoji', emoji);
        } else {
          await supabase.from('community_comment_reactions').insert({ comment_id: commentId, author_id: user.id, emoji });
        }
        refetch();
      },
      deleteComment: async (postId, commentId) => {
        await supabase.from('community_comments').delete().eq('id', commentId);
        refetch();
      },
      togglePin: async (postId) => {
        const row = rows.find((r) => r.id === postId);
        if (!row) return false;
        const { error: pinError } = await supabase
          .from('community_posts')
          .update({ pinned: !row.pinned })
          .eq('id', postId);
        if (pinError) return false;
        refetch();
        return true;
      },
      markRead: (postId) => {
        setLastViewedAt((prev) => ({ ...prev, [postId]: Date.now() }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, lastViewedAt, loading, error, user]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) {
    throw new Error('useCommunity must be used within a CommunityProvider');
  }
  return ctx;
}
