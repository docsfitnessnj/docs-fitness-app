import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { supabase } from '../lib/supabaseClient';
import { fastRemoveChannel } from '../lib/deferredRealtimeChannel';
import { showAlert } from '../lib/alert';

// Round 66: Doc's Stories go real -- server-backed (migration_036.sql),
// replacing the device-local seed array this context ran on since it was
// first built. A story is live for exactly 24 hours from createdAt, the
// SAME rule the server's own SELECT RLS policy already enforces -- this
// client-side filter is never the enforcement (a member's own fetch
// already only ever returns a live row, or an admin's own expired-row
// visibility is simply not surfaced here, see below), only a defensive
// mirror so "activeStories" always means the same thing regardless of
// which account happens to be signed in.
export type StoryItem = {
  id: string;
  mediaType: 'image' | 'video';
  mediaUri: string;
  createdAt: number;
};

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORY_MEDIA_BUCKET = 'story-media';

type StoryRow = {
  id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  created_at: string;
};

function rowToStory(row: StoryRow): StoryItem {
  return {
    id: row.id,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    mediaUri: row.media_url,
    createdAt: new Date(row.created_at).getTime(),
  };
}

type StoriesContextValue = {
  activeStories: StoryItem[];
  hasUnviewed: boolean;
  isViewed: (id: string) => boolean;
  markViewed: (id: string) => void;
  posting: boolean;
  postStory: (media: MediaAttachment) => Promise<void>;
};

const StoriesContext = createContext<StoriesContextValue | undefined>(undefined);

export function StoriesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [stories, setStories] = useState<StoryItem[]>([]);
  // Plain in-memory, per-device tracking -- no new table for view tracking,
  // the exact convention the brief itself names as fine to keep. Resets on
  // reload, which is already how the gold ring has always behaved here.
  const [viewed, setViewed] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState(false);
  const mountedRef = useRef(true);

  const fetchStories = useCallback(async () => {
    if (!user) {
      setStories([]);
      return;
    }
    // Oldest first -- newest last, the real Instagram-story stacking order.
    // The old local seed array happened to run the opposite way; that was
    // a harmless quirk of throwaway placeholder data, not a rule to carry
    // forward into real content.
    const { data, error } = await supabase
      .from('stories')
      .select('id, media_url, media_type, created_at')
      .order('created_at', { ascending: true });
    if (error || !data) {
      setStories([]);
      return;
    }
    setStories((data as StoryRow[]).map(rowToStory));
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStories();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchStories]);

  // Live updates -- an admin's story goes up for every already-open member
  // session instantly, not just on the next cold load. Unfiltered, the
  // same convention ClassBookingContext/GroupChatUnreadContext's own
  // postgres_changes subscriptions already use: RLS already means this
  // account is only ever sent a change to a row it can read, so no
  // ownership check is needed here to stay correct, only to stay cheap.
  useEffect(() => {
    if (!user) return;
    const mountId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`stories-changes-${mountId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        if (mountedRef.current) fetchStories();
      })
      .subscribe();
    return () => {
      fastRemoveChannel(channel);
    };
  }, [user, fetchStories]);

  const postStory = useCallback(
    async (media: MediaAttachment) => {
      if (!user) return;
      setPosting(true);
      try {
        const response = await fetch(media.uri);
        const blob = await response.blob();
        const extension = media.type === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(STORY_MEDIA_BUCKET)
          .upload(path, blob, {
            upsert: false,
            contentType: blob.type || undefined,
            cacheControl: `${60 * 60 * 24}`,
          });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from(STORY_MEDIA_BUCKET).getPublicUrl(path);
        const { error: insertError } = await supabase.from('stories').insert({
          media_url: publicUrlData.publicUrl,
          media_type: media.type === 'video' ? 'video' : 'photo',
          created_by: user.id,
        });
        if (insertError) throw insertError;
        await fetchStories();
      } catch {
        showAlert('Couldn\'t Post Story', 'Something went wrong uploading that. Try again.');
      } finally {
        setPosting(false);
      }
    },
    [user, fetchStories]
  );

  const value = useMemo<StoriesContextValue>(() => {
    const now = Date.now();
    const activeStories = stories.filter((s) => now - s.createdAt < STORY_TTL_MS);

    return {
      activeStories,
      hasUnviewed: activeStories.some((s) => !viewed[s.id]),
      isViewed: (id) => !!viewed[id],
      markViewed: (id) => setViewed((prev) => (prev[id] ? prev : { ...prev, [id]: true })),
      posting,
      postStory,
    };
  }, [stories, viewed, posting, postStory]);

  return <StoriesContext.Provider value={value}>{children}</StoriesContext.Provider>;
}

export function useStories() {
  const ctx = useContext(StoriesContext);
  if (!ctx) {
    throw new Error('useStories must be used within a StoriesProvider');
  }
  return ctx;
}
