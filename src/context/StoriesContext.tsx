import React, { createContext, useContext, useMemo, useState } from 'react';

export type StoryItem = {
  id: string;
  mediaType: 'image' | 'video';
  // Real uploaded media comes in a later backend round. Until then every
  // story renders its placeholderColor + placeholderLabel instead — set
  // mediaUri once real content exists and the viewer will use it.
  mediaUri?: string;
  placeholderColor: string;
  placeholderLabel: string;
  postedAt: number;
};

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const SEED_STORIES: StoryItem[] = [
  {
    id: 'story-1',
    mediaType: 'image',
    placeholderColor: '#1F4A57',
    placeholderLabel: "TODAY'S WOD PREVIEW",
    postedAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: 'story-2',
    mediaType: 'image',
    placeholderColor: '#2E5A45',
    placeholderLabel: 'BOATHOUSE 6AM CREW',
    postedAt: Date.now() - 1000 * 60 * 60 * 7,
  },
  {
    id: 'story-3',
    mediaType: 'video',
    placeholderColor: '#5A3E1F',
    placeholderLabel: 'FORM TIP: KB SWING',
    postedAt: Date.now() - 1000 * 60 * 60 * 12,
  },
];

type StoriesContextValue = {
  activeStories: StoryItem[];
  hasUnviewed: boolean;
  isViewed: (id: string) => boolean;
  markViewed: (id: string) => void;
};

const StoriesContext = createContext<StoriesContextValue | undefined>(undefined);

export function StoriesProvider({ children }: { children: React.ReactNode }) {
  const [viewed, setViewed] = useState<Record<string, boolean>>({});

  const value = useMemo<StoriesContextValue>(() => {
    const now = Date.now();
    const activeStories = SEED_STORIES.filter((s) => now - s.postedAt < STORY_TTL_MS);

    return {
      activeStories,
      hasUnviewed: activeStories.some((s) => !viewed[s.id]),
      isViewed: (id) => !!viewed[id],
      markViewed: (id) => setViewed((prev) => (prev[id] ? prev : { ...prev, [id]: true })),
    };
  }, [viewed]);

  return <StoriesContext.Provider value={value}>{children}</StoriesContext.Provider>;
}

export function useStories() {
  const ctx = useContext(StoriesContext);
  if (!ctx) {
    throw new Error('useStories must be used within a StoriesProvider');
  }
  return ctx;
}
