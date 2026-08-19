import React, { createContext, useContext, useMemo, useState } from 'react';
import { MediaAttachment } from '../lib/media';

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

const MAX_PINNED = 3;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function emptyReactions(): Record<string, number> {
  return REACTION_EMOJIS.reduce((acc, emoji) => ({ ...acc, [emoji]: 0 }), {} as Record<string, number>);
}

const SEED_POSTS: Post[] = [
  {
    id: nextId('post'),
    author: 'Doc',
    timeLabel: '1d ago',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    title: 'WELCOME TO THE BOATHOUSE. START HERE.',
    text: 'Welcome to the app. Take a minute and wander around. Like walking into a new place, half the fun is finding your favorite spot. Here is the lay of the land.\n\nCOMMUNITY is where you are now. Post your workouts, your wins, your questions. This board is the heartbeat of the whole thing.\n\nThe dates at the top are your week. Tap any day to sign up for class at the Boathouse and see that day\'s workout.\n\nDOC\'S WODS is your daily work. Five workouts a week. Tap the day, do the work, mark it complete, log your results. Post them to the board when you are done. That is how we push each other.\n\nWEEKLY CHALLENGE is the trophy tab. This is where my infamous COWs live, the Challenge of the Week. One challenge every week, one live leaderboard. Post your score and see where you stand.\n\nTHE DECK is 54 of my workouts built as a deck of cards. Shuffle it, let it deal you a workout, and work your way through the whole deck. And if you want the real thing in your hands, the physical Deck of WODs is right there in the same tab.\n\nThe menu in the top left has your profile, your workout history, memberships, the Boathouse schedule, and the merch store.\n\nAny questions or if anything is not working right, message me directly from the menu. I read everything.\n\nNow go find your spot. Stronger than you were 10 years ago starts today.',
    category: 'Announcement',
    likes: 14,
    liked: false,
    reactions: { ...emptyReactions(), '🔥': 9 },
    comments: [
      { id: nextId('comment'), author: 'S. Boyle', text: 'Let’s go!', timeLabel: '22h ago', likes: 2 },
    ],
    pinned: true,
    kind: 'text',
    unread: false,
  },
  {
    id: nextId('post'),
    author: 'K. Alvarez',
    timeLabel: '2h ago',
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    title: 'PR’d the Swing Challenge',
    text: "PR'd the Swing Challenge today. Legs are gone. Grinded through the last two rounds on pure stubbornness — worth it.",
    category: 'Win',
    likes: 12,
    liked: false,
    reactions: { ...emptyReactions(), '💪': 6 },
    comments: [],
    pinned: false,
    kind: 'text',
    unread: true,
  },
  {
    id: nextId('post'),
    author: 'D. Castillo',
    timeLabel: '5h ago',
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    title: 'First Gauntlet finish under 9 minutes',
    text: 'First Gauntlet finish under 9 minutes. Been chasing this since January.',
    category: 'Win',
    likes: 8,
    liked: false,
    reactions: emptyReactions(),
    comments: [],
    pinned: false,
    kind: 'text',
    unread: false,
  },
  {
    id: nextId('post'),
    author: 'S. Boyle',
    timeLabel: '1d ago',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    title: 'Ventnor 6am crew',
    text: 'Ventnor 6am crew is relentless. See you tomorrow.',
    category: 'Shoutout',
    likes: 21,
    liked: false,
    reactions: emptyReactions(),
    comments: [
      { id: nextId('comment'), author: 'K. Alvarez', text: 'Wouldn’t miss it.', timeLabel: '10m ago', likes: 1 },
    ],
    pinned: false,
    kind: 'text',
    unread: true,
  },
];

type CommunityContextValue = {
  posts: Post[];
  addTextPost: (author: string, title: string, text: string, category?: string, media?: MediaAttachment | null) => void;
  addWodResultPost: (author: string, meta: WodPostMeta, media?: MediaAttachment | null) => void;
  updateTextPost: (postId: string, title: string, text: string, media?: MediaAttachment | null) => void;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  addReaction: (postId: string, emoji: string) => void;
  addComment: (postId: string, author: string, text: string) => void;
  updateComment: (postId: string, commentId: string, text: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  togglePin: (postId: string) => boolean;
  markRead: (postId: string) => void;
};

const CommunityContext = createContext<CommunityContextValue | undefined>(undefined);

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(SEED_POSTS);

  const value = useMemo<CommunityContextValue>(() => {
    const addPost = (post: Post) => setPosts((prev) => [post, ...prev]);

    return {
      posts: [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      }),
      addTextPost: (author, title, text, category = 'General', media = null) => {
        addPost({
          id: nextId('post'),
          author,
          timeLabel: 'just now',
          createdAt: Date.now(),
          title: title.trim() || text.trim().slice(0, 60),
          text,
          category,
          media,
          likes: 0,
          liked: false,
          reactions: emptyReactions(),
          comments: [],
          pinned: false,
          kind: 'text',
          unread: false,
        });
      },
      addWodResultPost: (author, meta, media = null) => {
        addPost({
          id: nextId('post'),
          author,
          timeLabel: 'just now',
          createdAt: Date.now(),
          title: meta.workoutTitle,
          text: '',
          category: 'Workout',
          media,
          likes: 0,
          liked: false,
          reactions: emptyReactions(),
          comments: [],
          pinned: false,
          kind: 'wod',
          meta,
          unread: false,
        });
      },
      updateTextPost: (postId, title, text, media) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, title: title.trim() || text.trim().slice(0, 60), text, media: media !== undefined ? media : p.media }
              : p
          )
        );
      },
      deletePost: (postId) => {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      },
      toggleLike: (postId) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p
          )
        );
      },
      addReaction: (postId, emoji) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, reactions: { ...p.reactions, [emoji]: (p.reactions[emoji] ?? 0) + 1 } }
              : p
          )
        );
      },
      addComment: (postId, author, text) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  comments: [
                    ...p.comments,
                    { id: nextId('comment'), author, text, timeLabel: 'just now', likes: 0 },
                  ],
                }
              : p
          )
        );
      },
      updateComment: (postId, commentId, text) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, text } : c)) }
              : p
          )
        );
      },
      deleteComment: (postId, commentId) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p
          )
        );
      },
      togglePin: (postId) => {
        const target = posts.find((p) => p.id === postId);
        if (!target) return false;
        const pinnedCount = posts.filter((p) => p.pinned).length;
        if (!target.pinned && pinnedCount >= MAX_PINNED) return false;
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, pinned: !p.pinned } : p)));
        return true;
      },
      markRead: (postId) => {
        setPosts((prev) => prev.map((p) => (p.id === postId && p.unread ? { ...p, unread: false } : p)));
      },
    };
  }, [posts]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) {
    throw new Error('useCommunity must be used within a CommunityProvider');
  }
  return ctx;
}
