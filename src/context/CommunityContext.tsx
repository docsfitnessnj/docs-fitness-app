import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { loadJSON, saveJSON } from '../lib/storage';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

const LAST_VIEWED_STORAGE_KEY = 'docsfitness.communityLastViewed.v1';

export type Comment = {
  id: string;
  author: string;
  text: string;
  timeLabel: string;
  likes: number;
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
  likes: number;
  liked: boolean;
  reactions: Record<string, number>;
  comments: Comment[];
  pinned: boolean;
  kind: 'text' | 'wod';
  meta?: WodPostMeta;
  // Unseen activity (new post or new comment) — shows the gold dot / "New comment" label.
  unread: boolean;
};

export const REACTION_EMOJIS = ['👍', '🔥', '💪', '❤️'] as const;
// The heart "like" button is just a shortcut for the 👍 reaction — one
// shared mechanism instead of two separate counters like the old
// local-only version had, now that reactions are real per-member rows in
// the database (see community_reactions in supabase/setup.sql).
const LIKE_EMOJI = '👍';

type CommunityContextValue = {
  loading: boolean;
  error: string | null;
  posts: Post[];
  // `author` is accepted for compatibility with existing call sites, but
  // ignored — the real author is always the signed-in member (author_id =
  // auth.uid(), enforced by RLS), never whatever string is passed in.
  addTextPost: (author: string, title: string, text: string, category?: string, media?: MediaAttachment | null) => void;
  addWodResultPost: (author: string, title: string, meta: WodPostMeta, media?: MediaAttachment | null) => void;
  updateTextPost: (postId: string, title: string, text: string, media?: MediaAttachment | null) => void;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  addReaction: (postId: string, emoji: string) => void;
  addComment: (postId: string, author: string, text: string) => void;
  updateComment: (postId: string, commentId: string, text: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
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

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: ProfileRef;
};

type ReactionRow = { emoji: string; author_id: string };

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
  'id, title, body, category, kind, media_url, media_type, workout_title, workout_notes, workout_results_line, pinned, created_at, author_id, profiles(display_name), community_comments(id, body, created_at, author_id, profiles(display_name)), community_reactions(emoji, author_id)';

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
  const reactions: Record<string, number> = {};
  for (const emoji of REACTION_EMOJIS) reactions[emoji] = 0;
  for (const r of row.community_reactions) reactions[r.emoji] = (reactions[r.emoji] ?? 0) + 1;
  const liked = row.community_reactions.some((r) => r.emoji === LIKE_EMOJI && r.author_id === userId);

  const comments: Comment[] = [...row.community_comments]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((c) => ({
      id: c.id,
      author: nameOf(c.profiles),
      text: c.body,
      timeLabel: relativeTimeLabel(new Date(c.created_at).getTime()),
      likes: 0,
    }));

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
    likes: reactions[LIKE_EMOJI] ?? 0,
    liked,
    reactions,
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

    return {
      loading,
      error,
      posts,
      addTextPost: (_author, title, text, category = 'General', media = null) => {
        insertPost({
          title: title.trim() || text.trim().slice(0, 60),
          body: text,
          category,
          kind: 'text',
          media_url: media?.uri ?? null,
          media_type: media?.type ?? null,
        });
      },
      addWodResultPost: (_author, title, meta, media = null) => {
        insertPost({
          title: title.trim() || meta.workoutTitle,
          body: '',
          category: 'Workout',
          kind: 'wod',
          media_url: media?.uri ?? null,
          media_type: media?.type ?? null,
          workout_title: meta.workoutTitle,
          workout_notes: meta.notes,
          workout_results_line: meta.resultsLine ?? null,
        });
      },
      updateTextPost: async (postId, title, text, media) => {
        if (!user) return;
        const patch: Record<string, unknown> = { title: title.trim() || text.trim().slice(0, 60), body: text };
        if (media !== undefined) {
          patch.media_url = media?.uri ?? null;
          patch.media_type = media?.type ?? null;
        }
        await supabase.from('community_posts').update(patch).eq('id', postId);
        refetch();
      },
      deletePost: async (postId) => {
        setRows((prev) => prev.filter((r) => r.id !== postId));
        await supabase.from('community_posts').delete().eq('id', postId);
      },
      toggleLike: async (postId) => {
        if (!user) return;
        const row = rows.find((r) => r.id === postId);
        const alreadyLiked = row?.community_reactions.some((r) => r.emoji === LIKE_EMOJI && r.author_id === user.id);
        if (alreadyLiked) {
          await supabase.from('community_reactions').delete().eq('post_id', postId).eq('author_id', user.id).eq('emoji', LIKE_EMOJI);
        } else {
          await supabase.from('community_reactions').insert({ post_id: postId, author_id: user.id, emoji: LIKE_EMOJI });
        }
        refetch();
      },
      addReaction: async (postId, emoji) => {
        if (!user) return;
        await supabase.from('community_reactions').insert({ post_id: postId, author_id: user.id, emoji });
        refetch();
      },
      addComment: async (postId, _author, text) => {
        if (!user) return;
        await supabase.from('community_comments').insert({ post_id: postId, author_id: user.id, body: text });
        refetch();
      },
      updateComment: async (postId, commentId, text) => {
        await supabase.from('community_comments').update({ body: text }).eq('id', commentId);
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
