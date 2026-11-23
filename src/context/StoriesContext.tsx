import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { isBackendUnavailableError, supabase, uploadFileWithProgress } from '../lib/supabaseClient';
import { fastRemoveChannel } from '../lib/deferredRealtimeChannel';
import { getVideoDuration } from '../lib/videoDuration';
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

// Round 67: a real 30-second phone video failed to post while a photo
// posted fine the same session -- investigated directly before writing
// anything (see AGENTS.md's own Round 67 section for the full evidence
// trail: a real ~32MB/30-second H.264 fixture built to match, no
// client-side video re-encoding or upload timeout found anywhere in this
// app's own code, and the real root cause -- no size check at all existed
// before this round, so an oversized pick was never refused up front, only
// ever let fail late against whatever Supabase's own ceiling happens to
// be). Kept in sync with migration_037.sql's own story-media
// file_size_limit, the exact convention migration_016.sql already
// established for group chat's own 50MB number.
const MAX_STORY_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB
const MAX_STORY_VIDEO_DURATION_SECONDS = 90;

const STORY_TOO_LARGE_MESSAGE = 'That file is too big to post. Keep it under 250MB and try again.';
const STORY_TOO_LONG_MESSAGE = 'Video too long. Keep it under 90 seconds and try again.';
const STORY_GENERIC_FAILURE_MESSAGE = 'Something went wrong uploading that. Try again.';

// Mirrors supabaseClient.ts's own describeChatFailure, with story-flavored
// copy rather than chat-flavored copy -- the same classification logic
// (a genuine Storage rejection vs. a real connection/backend failure),
// kept as its own small local function rather than generalizing the
// shared one, since the two features' copy genuinely differs ("post" vs.
// "send") and this is the only other caller. Reached only as a defense in
// depth backstop now -- the real, primary fix is the client-side
// pre-upload size/duration checks in postStory below, which refuse a bad
// pick before any upload is ever attempted.
function describeStoryFailure(error: unknown): string {
  if (isBackendUnavailableError(error)) return STORY_GENERIC_FAILURE_MESSAGE;
  const err = (error ?? {}) as { message?: string; __isStorageError?: boolean };
  const message = err.message ?? '';
  if (err.__isStorageError) {
    if (/exceeded the maximum allowed size/i.test(message)) return STORY_TOO_LARGE_MESSAGE;
    if (/mime type|not supported|invalid (file|mime)/i.test(message)) return "That file type isn't supported here.";
    return message ? `Couldn't post that: ${message}` : "Couldn't post that — something went wrong with the upload.";
  }
  return STORY_GENERIC_FAILURE_MESSAGE;
}

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
  // Round 67: real upload progress, driven by uploadFileWithProgress's own
  // xhr.upload.onprogress (exactly the mechanism useGroupChat.ts's video
  // upload already established) -- a 0-1 fraction once real progress is
  // available, the literal string 'indeterminate' before the first real
  // progress event arrives (or if a progress-tracked upload couldn't be
  // used at all, the one documented fallback case), and null whenever
  // nothing is posting. StoryRow reads this to drive the real circular
  // progress ring; it's never a fake/decorative spinner standing in for a
  // number this context doesn't actually have.
  uploadProgress: number | 'indeterminate' | null;
  postStory: (media: MediaAttachment) => Promise<void>;
  // Round 67: admin-only, enforced server-side by migration_036.sql's own
  // RLS delete policy -- this is purely the client call. Returns whether
  // it actually succeeded so the caller (StoryViewer) can decide what to
  // show/advance to without guessing from a later refetch.
  deleteStory: (id: string) => Promise<boolean>;
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
  const [uploadProgress, setUploadProgress] = useState<number | 'indeterminate' | null>(null);
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

      // PART 5.2 / PART 1 -- a video that's too long is refused up front,
      // before any upload (or even a blob fetch) starts. getVideoDuration
      // reads the local file's own metadata via an off-screen <video>
      // element -- no network cost, no app state ever set, so a rejected
      // pick leaves `posting`/the ring exactly as it was, with nothing to
      // roll back (PART 2).
      if (media.type === 'video') {
        const duration = await getVideoDuration(media.uri);
        if (duration !== null && duration > MAX_STORY_VIDEO_DURATION_SECONDS) {
          showAlert("Couldn't Post Story", STORY_TOO_LONG_MESSAGE);
          return;
        }
      }

      // PART 1 -- the real byte size check, BEFORE setPosting(true) and
      // BEFORE any upload is attempted. fetch() against a local blob:/
      // object: URI never touches the network (it's the same document that
      // created it), so this is a cheap, instant read, not a real request.
      let blob: Blob;
      try {
        blob = await fetch(media.uri).then((r) => r.blob());
      } catch {
        showAlert("Couldn't Post Story", STORY_GENERIC_FAILURE_MESSAGE);
        return;
      }
      if (blob.size > MAX_STORY_UPLOAD_BYTES) {
        showAlert("Couldn't Post Story", STORY_TOO_LARGE_MESSAGE);
        return;
      }

      setPosting(true);
      // Real progress is only known once uploadFileWithProgress's own real
      // xhr.upload.onprogress events start arriving -- 'indeterminate'
      // until then (and permanently, if a progress-tracked upload couldn't
      // be used at all, the one documented fallback below), never a fake
      // fraction standing in for a number this doesn't have yet.
      setUploadProgress('indeterminate');
      try {
        const extension = media.type === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

        // PART 5.3 -- real upload progress, the exact uploadFileWithProgress
        // mechanism useGroupChat.ts's own video upload already established
        // (a raw-XHR replication of supabase-js's own upload request, purely
        // so xhr.upload.onprogress is observable). Falls back to the plain,
        // non-progress-tracked upload only in the one documented case that
        // function itself throws for (no session token available at this
        // exact moment) -- a genuine Storage rejection is never swallowed by
        // that fallback, it's re-thrown as-is.
        let progressUploadSucceeded = false;
        try {
          await uploadFileWithProgress(STORY_MEDIA_BUCKET, path, blob, `${60 * 60 * 24}`, (p) => setUploadProgress(p));
          progressUploadSucceeded = true;
        } catch (err) {
          if ((err as { __isStorageError?: boolean } | null)?.__isStorageError) throw err;
          setUploadProgress('indeterminate');
        }
        if (!progressUploadSucceeded) {
          const { error: uploadError } = await supabase.storage.from(STORY_MEDIA_BUCKET).upload(path, blob, {
            upsert: false,
            contentType: blob.type || undefined,
            cacheControl: `${60 * 60 * 24}`,
          });
          if (uploadError) throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage.from(STORY_MEDIA_BUCKET).getPublicUrl(path);
        const { error: insertError } = await supabase.from('stories').insert({
          media_url: publicUrlData.publicUrl,
          media_type: media.type === 'video' ? 'video' : 'photo',
          created_by: user.id,
        });
        if (insertError) throw insertError;
        await fetchStories();
      } catch (err) {
        // PART 2 -- nothing optimistic was ever set above (the story list
        // is only ever updated by fetchStories, after a real successful
        // insert) -- the finally block below is the ENTIRE rollback this
        // needs: posting/uploadProgress reset to exactly their pre-attempt
        // values, with no stale story, no stuck spinner, no disabled
        // control left behind.
        showAlert("Couldn't Post Story", describeStoryFailure(err));
      } finally {
        setPosting(false);
        setUploadProgress(null);
      }
    },
    [user, fetchStories]
  );

  // PART 4 -- admin-only in the UI (StoryViewer gates its own DELETE
  // control on isAdmin); the real enforcement is migration_036.sql's own
  // RLS delete policy on both the `stories` row and the storage object,
  // which this function relies on rather than duplicating client-side.
  const deleteStory = useCallback(
    async (id: string): Promise<boolean> => {
      const target = stories.find((s) => s.id === id);
      try {
        const { error } = await supabase.from('stories').delete().eq('id', id);
        if (error) throw error;
        // Best-effort: also remove the underlying Storage object. A failed
        // object delete never blocks the real, already-successful row
        // delete -- the row being gone is what makes the story invisible
        // everywhere (RLS, the realtime subscription above); an orphaned
        // object left behind costs nothing a member can ever see.
        if (target) {
          const objectPath = target.mediaUri.split(`/${STORY_MEDIA_BUCKET}/`)[1];
          if (objectPath) {
            await supabase.storage
              .from(STORY_MEDIA_BUCKET)
              .remove([objectPath])
              .catch(() => {});
          }
        }
        await fetchStories();
        return true;
      } catch {
        return false;
      }
    },
    [stories, fetchStories]
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
      uploadProgress,
      postStory,
      deleteStory,
    };
  }, [stories, viewed, posting, uploadProgress, postStory, deleteStory]);

  return <StoriesContext.Provider value={value}>{children}</StoriesContext.Provider>;
}

export function useStories() {
  const ctx = useContext(StoriesContext);
  if (!ctx) {
    throw new Error('useStories must be used within a StoriesProvider');
  }
  return ctx;
}
