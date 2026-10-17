import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { REACTION_EMOJIS } from '../context/CommunityContext';
import { useGroupChatUnread } from '../context/GroupChatUnreadContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { deferRemoveChannel, fastRemoveChannel, getOrCreateChannel } from './deferredRealtimeChannel';
import { MediaAttachment } from './media';
import { describeChatFailure, isBackendUnavailableError, supabase, uploadFileWithProgress } from './supabaseClient';
import { captureVideoThumbnail } from './videoThumbnail';

const PAGE_SIZE = 50;

// Supabase's current plan caps a single uploaded file at 50MB — this is the
// ONE place that number lives app-wide. A real iPhone video around a minute
// long routinely exceeds it, which used to fail silently late (after the
// whole upload had already run) with a generic "check your connection"
// message that had nothing to do with what actually happened. Checked
// client-side, before any upload begins (see sendMessage below), against
// the file's REAL size — not an estimate from its duration — so the limit
// stays accurate for photos too, not just video. When the Supabase plan
// upgrades and the real cap rises, this is the one line that needs to
// change (see also migration_016.sql, which sets the same number explicitly
// on the group-chat-media bucket's own file_size_limit server-side — keep
// both in sync).
const MAX_GROUP_CHAT_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

const VIDEO_TOO_LARGE_MESSAGE = 'Video too big. Trim it to under 45 seconds and try again.';
const PHOTO_TOO_LARGE_MESSAGE = "That photo is too big to send. Try a smaller one.";

export type GroupChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  // A lightweight poster frame for a video message — the list renders
  // ONLY this (or, for a photo, the photo itself) and never the video file
  // until the viewer actually taps to play it. Null for a photo message
  // (the photo IS its own thumbnail) or an older video sent before this
  // column existed.
  thumbnailUrl: string | null;
  createdAt: number;
  // Same 4-emoji set as the Community feed (shaka, fire, flex, heart) —
  // see REACTION_EMOJIS in CommunityContext.tsx, the single source of
  // truth both features read from. One count per emoji; `myReactions` is
  // which of those this viewer has already placed on this message.
  reactions: Record<string, number>;
  myReactions: string[];
  // Optimistic-send state (FIX 2) — never set by rowToMessage, only by
  // sendMessage's own local echo before the real row comes back. Absent
  // (undefined/false) once reconciled with the real row from the server;
  // a message that fails to send is removed from the list entirely
  // instead of lingering in a failed state (see sendMessage's catch
  // block and `sendError` below for the quiet note shown instead).
  pending?: boolean;
  // PART 4 — set only while `pending` is true and media is attached: a
  // 0-1 fraction once real upload progress is available, or the literal
  // string 'indeterminate' while it isn't yet (or never was, this send).
  // Undefined otherwise — a text-only pending message never sets this.
  uploadProgress?: number | 'indeterminate';
};

// FIX 3 (round 115): keeps the chat's last-loaded state alive across
// open/close WITHIN this browser tab's session — a plain module-level
// variable, not persisted anywhere, so it naturally resets on a real page
// reload but survives DocsGroupChatScreen fully unmounting every time the
// member backs out (that full unmount is itself deliberate, for a clean
// per-open ScreenErrorBoundary reset — see App.tsx). Without this, every
// reopen started from `loading: true` and an empty list, so the whole
// FlatList — every row, every photo/video thumbnail — remounted from
// nothing each time, which is what actually read as "taking seconds to
// reload" even when the underlying image bytes were already sitting in the
// browser's own HTTP cache (see uploadGroupChatFile's cacheControl for the
// other half of that fix). A reopen now paints this cached state on the
// very first frame, then quietly fetches only what's new since the
// newest cached message instead of redoing the full most-recent-50 fetch —
// see the initial-load effect below. Known, accepted tradeoff: a reaction
// added to (or a delete of) an already-cached message while the chat was
// closed won't retroactively show up on reopen — only new messages are
// fetched, not re-checked existing ones. Realtime already catches every
// live edit the instant it happens while the screen IS open, which is the
// common case by far; this just doesn't also replay what was missed while
// it wasn't.
let cache: {
  messages: GroupChatMessage[];
  pinnedPrompt: string | null;
  muted: boolean;
  hasMoreOlder: boolean;
} | null = null;

// Called alongside requestAppReset() on sign-out (see SettingsScreen.tsx) —
// this cache lives at module scope, outside React entirely, so remounting
// the provider tree alone (what requestAppReset does) can't clear it.
// Without this, signing out and back in as a DIFFERENT member on the same
// tab could briefly show the previous member's cached `myReactions`
// highlighting on old messages until the next new message arrives.
export function clearGroupChatCache() {
  cache = null;
}

type ProfileRef = { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;

function profileOf(ref: ProfileRef) {
  return Array.isArray(ref) ? ref[0] : ref;
}

type CheerRow = { member_id: string; emoji: string };

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  thumbnail_url: string | null;
  created_at: string;
  deleted: boolean;
  profiles: ProfileRef;
  group_chat_cheers: CheerRow[];
};

const MESSAGE_SELECT =
  'id, sender_id, body, media_url, media_type, thumbnail_url, created_at, deleted, profiles(display_name, avatar_url), group_chat_cheers(member_id, emoji)';

// FIX 3b (round 115): each path is unique (timestamp + random suffix) and
// `upsert: false` means nothing ever overwrites it — once uploaded, the
// bytes at this exact public URL never change. That makes it safe to tell
// the browser (and any CDN in front of Supabase Storage) to cache it
// essentially forever, instead of the SDK's own one-hour default — the
// difference between a photo/video thumbnail silently redownloading the
// next time the chat happens to be reopened more than an hour later, vs.
// never again for the life of the browser's cache. This is the other half
// of "reopening shows what was already loaded instantly" — the in-memory
// chat-state cache (see the `cache` module variable above) means the
// <Image>/thumbnail elements remount with the same URL right away, and
// this is what lets the browser serve them from its own cache instead of
// hitting the network again at all.
const FAR_FUTURE_CACHE_CONTROL = `${60 * 60 * 24 * 365}`; // seconds, ~1 year

// PART 4 — `onProgress`, when given, is called with a 0-1 fraction as real
// upload bytes go out (uploadFileWithProgress, a raw-XHR replication of
// exactly what supabase-js's own fetch-based upload sends, purely so
// xhr.upload.onprogress is available) or with the literal string
// 'indeterminate' if real progress couldn't be used for this upload (no
// session token available at the moment it started, the only case that
// falls through) — the caller then shows a smooth indeterminate animation
// instead of a bar that would never move. A genuine upload failure (wrong
// type, too big, quota, ...) is never swallowed by that fallback — it's
// only for the inability to show real progress, not for the request
// itself, so it's always re-thrown as-is.
async function uploadGroupChatFile(
  userId: string,
  blob: Blob,
  extension: string,
  onProgress?: (progress: number | 'indeterminate') => void
): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  if (onProgress) {
    try {
      await uploadFileWithProgress('group-chat-media', path, blob, FAR_FUTURE_CACHE_CONTROL, onProgress);
      const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      if ((err as { __isStorageError?: boolean } | null)?.__isStorageError) throw err;
      onProgress('indeterminate');
    }
  }
  const { error } = await supabase.storage
    .from('group-chat-media')
    .upload(path, blob, { upsert: false, contentType: blob.type || undefined, cacheControl: FAR_FUTURE_CACHE_CONTROL });
  if (error) throw error;
  const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path);
  return data.publicUrl;
}

// Same upload shape as DocsInboxContext's uploadMessageFile — the extension
// comes from `kind`, not a content-type sniff, so a video uploads as .mp4
// (and gets served with the right content type) instead of silently being
// named like a photo, which is why a video sent before this fix never
// "came through": the receiving side had no way to know photo_url wasn't
// actually a photo. For a video, also captures and uploads a poster frame
// (see videoThumbnail.ts) — never blocks the send if capture fails, the
// message just goes out without a thumbnail (the existing placeholder).
//
// Takes the already-fetched `blob` rather than fetching `localUri` itself —
// sendMessage below fetches it once, up front, specifically so it can check
// the real byte size against MAX_GROUP_CHAT_UPLOAD_BYTES BEFORE any upload
// is attempted (and before the optimistic bubble even appears). `localUri`
// is still needed separately for captureVideoThumbnail, which reads it via
// an off-screen <video> element, not the blob.
async function uploadGroupChatMedia(
  userId: string,
  blob: Blob,
  localUri: string,
  kind: 'image' | 'video',
  onProgress?: (progress: number | 'indeterminate') => void
): Promise<{ mediaUrl: string; thumbnailUrl: string | null }> {
  const extension = kind === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
  // Progress is only tracked for the main file — the poster-frame thumbnail
  // (below) is a small JPEG that uploads near-instantly and was never part
  // of what read as "frozen."
  const mediaUrl = await uploadGroupChatFile(userId, blob, extension, onProgress);

  let thumbnailUrl: string | null = null;
  if (kind === 'video') {
    const thumbBlob = await captureVideoThumbnail(localUri);
    if (thumbBlob) {
      try {
        thumbnailUrl = await uploadGroupChatFile(userId, thumbBlob, 'jpg');
      } catch {
        thumbnailUrl = null;
      }
    }
  }
  return { mediaUrl, thumbnailUrl };
}

function reactionsOf(rows: CheerRow[] | undefined, viewerId: string | undefined): { reactions: Record<string, number>; myReactions: string[] } {
  const reactions: Record<string, number> = {};
  for (const emoji of REACTION_EMOJIS) reactions[emoji] = 0;
  const myReactions: string[] = [];
  (rows ?? []).forEach((r) => {
    reactions[r.emoji] = (reactions[r.emoji] ?? 0) + 1;
    if (r.member_id === viewerId) myReactions.push(r.emoji);
  });
  return { reactions, myReactions };
}

export function useGroupChat(active: boolean) {
  const { user, authReady } = useAuth();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const { markRead } = useGroupChatUnread();
  // Seeded from the module-level cache above when there is one — see its
  // comment for why. `loading` starts false in that case too: there's
  // already something real to show, so the familiar spinner/empty-state
  // flash only happens on the very first open of the session.
  const [messages, setMessages] = useState<GroupChatMessage[]>(() => cache?.messages ?? []); // ascending — oldest first, newest last
  const [loading, setLoading] = useState(() => !cache);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(() => cache?.hasMoreOlder ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedPrompt, setPinnedPromptState] = useState<string | null>(() => cache?.pinnedPrompt ?? null);
  // Starts at 1 (just this viewer) rather than 0 — presenceCount only ever
  // drives "X IN THE CHAT", shown starting at 2, so the exact value before
  // the presence channel's first sync doesn't matter.
  const [presenceCount, setPresenceCount] = useState(1);
  const [muted, setMuted] = useState(() => cache?.muted ?? false);
  // A quiet note for a failed send/delete (FIX 2) — never a blocking
  // alert. Null means nothing to show. Round 118: this used to clear
  // itself after 4 seconds, which raced a member actually reading it
  // (especially the oversized-video message, the whole point of which is
  // to explain what to do about it). It now persists until the member
  // dismisses it themselves — see showSendError/clearSendError below.
  const [sendError, setSendError] = useState<string | null>(null);

  // Keys (`${messageId}:${emoji}`) this viewer just applied optimistically
  // in toggleReaction, not yet reconciled against the Realtime echo of
  // that same write — see toggleReaction below. Lets the INSERT/DELETE
  // handlers on group_chat_cheers recognize "this is my own action coming
  // back" and skip re-applying it (which would double the count), while
  // still applying normally for every other member's reactions.
  const pendingReactionKeysRef = useRef<Set<string>>(new Set());

  // Realtime INSERT payloads are the raw row only — no joined profile. Most
  // senders will already be in this cache from the initial page (everyone
  // active enough to be chatting has almost certainly already appeared in
  // the last 50 messages); a cache miss falls back to one small profiles
  // fetch, resolved async so it never blocks the message from appearing.
  const profileCache = useRef<Map<string, { name: string; avatarUrl: string | null }>>(new Map());

  const cacheProfile = (id: string, ref: ProfileRef) => {
    const p = profileOf(ref);
    if (p) profileCache.current.set(id, { name: p.display_name?.trim() || 'Member', avatarUrl: p.avatar_url ?? null });
  };

  const rowToMessage = (row: MessageRow): GroupChatMessage => {
    const cached = profileCache.current.get(row.sender_id);
    const { reactions, myReactions } = reactionsOf(row.group_chat_cheers, user?.id);
    return {
      id: row.id,
      senderId: row.sender_id,
      senderName: cached?.name ?? 'Member',
      senderAvatarUrl: cached?.avatarUrl ?? null,
      text: row.body,
      mediaUrl: row.media_url,
      mediaType: row.media_type,
      thumbnailUrl: row.thumbnail_url,
      createdAt: new Date(row.created_at).getTime(),
      reactions,
      myReactions,
    };
  };

  // Unread badge: opening the chat is "read everything up to now" —
  // resets GroupChatUnreadContext's count to 0 and writes last_read_at
  // immediately, rather than waiting for the message list to finish
  // loading. markRead() itself is stable (useCallback) so this only fires
  // on a genuine active-state transition, not on every render.
  useEffect(() => {
    if (active) markRead();
  }, [active, markRead]);

  // Initial load. First-ever open this session (no cache yet): most recent
  // 50 messages, the pinned prompt, and this account's own mute flag —
  // mirrors a fresh page load. Every reopen after that already has the
  // cache's content on screen from the very first frame (see the `cache`
  // module variable's comment above), so this instead fetches only
  // messages newer than the newest one already showing — a much smaller
  // request — and appends them, while still refreshing the pinned prompt
  // and mute flag (both single cheap rows) so those stay correct even
  // after being closed a while.
  useEffect(() => {
    if (!active || !authReady || !user) return;
    let cancelled = false;
    const cachedAtOpen = cache;
    if (!cachedAtOpen) setLoading(true);
    setError(null);

    const messagesQuery = cachedAtOpen
      ? supabase
          .from('group_chat_messages')
          .select(MESSAGE_SELECT)
          .eq('deleted', false)
          .gt(
            'created_at',
            new Date(cachedAtOpen.messages[cachedAtOpen.messages.length - 1]?.createdAt ?? 0).toISOString()
          )
          .order('created_at', { ascending: true })
      : supabase
          .from('group_chat_messages')
          .select(MESSAGE_SELECT)
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

    Promise.all([
      messagesQuery,
      supabase.from('group_chat_settings').select('pinned_prompt').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('group_chat_muted').eq('id', user.id).maybeSingle(),
    ]).then(([msgsRes, settingsRes, profileRes]) => {
      if (cancelled) return;
      if (msgsRes.error) {
        // A cached reopen already has something real on screen — a failed
        // "what's new" refresh quietly leaves it as-is rather than
        // replacing a working view with an error notice.
        if (!cachedAtOpen) {
          setError(isBackendUnavailableError(msgsRes.error) ? "Can't load the chat right now." : msgsRes.error.message);
          setLoading(false);
        }
        return;
      }
      const rows = (msgsRes.data as unknown as MessageRow[]) ?? [];
      rows.forEach((r) => cacheProfile(r.sender_id, r.profiles));
      if (cachedAtOpen) {
        if (rows.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = rows.filter((r) => !existingIds.has(r.id)).map(rowToMessage);
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } else {
        setMessages([...rows].reverse().map(rowToMessage));
        setHasMoreOlder(rows.length === PAGE_SIZE);
      }
      setPinnedPromptState((settingsRes.data as { pinned_prompt: string | null } | null)?.pinned_prompt ?? null);
      setMuted(!!(profileRes.data as { group_chat_muted: boolean } | null)?.group_chat_muted);
      setError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, authReady, user]);

  // Keeps the module-level cache current with the latest state, so the
  // NEXT open (of this tab's session) can seed from it — see `cache`'s own
  // comment above for why this lives outside React state entirely. Strips
  // out any still-`pending` optimistic bubble first: closing the chat
  // between sendMessage's optimistic insert and the real row coming back
  // is the one window where that could happen, and caching it would
  // resurrect a "sending…" ghost on the next open that nothing will ever
  // resolve (sendMessage's own reconciliation is tied to THIS unmounting
  // hook instance) — worse, likely alongside a genuine duplicate once the
  // real row shows up through the normal "what's new" fetch below. Simply
  // not caching it means the real message just shows up the normal way
  // next time, exactly as if the screen had been closed before sending at
  // all.
  useEffect(() => {
    if (!active) return;
    const cacheable = messages.some((m) => m.pending) ? messages.filter((m) => !m.pending) : messages;
    cache = { messages: cacheable, pinnedPrompt, muted, hasMoreOlder };
  }, [active, messages, pinnedPrompt, muted, hasMoreOlder]);

  // Live messages + reactions. Every write (send, soft delete, react,
  // un-react) is fire-and-forget to the database — this subscription is
  // the ONLY place local state actually changes for any of them, including
  // the sender's/reactor's own action. One state machine, no optimistic-
  // vs-real reconciliation to get wrong.
  useEffect(() => {
    if (!active || !user) return;
    // Unique per mount (not just `group-chat-messages-live`) — this is the
    // actual root cause of the real-device white-screen crash on rapid
    // open/close/open/close: supabase-js's `.channel(topic)` returns the
    // EXISTING JS channel object if one with that exact topic string is
    // still registered, rather than creating a new one. Closing the chat
    // defers this effect's `removeChannel` by a macrotask (see FIX 8 in
    // the previous round); a fast reopen before that macrotask runs used
    // to get back the SAME still-registered, about-to-be-removed channel
    // object — re-subscribing an already-joining/joined channel, then
    // having the stale deferred removal tear down the channel the new
    // mount now depends on. A unique topic per mount means `.channel()`
    // always creates a genuinely new object, so a late deferred removal
    // can only ever affect its own channel, never a different mount's.
    const mountId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`group-chat-messages-live-${mountId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages' }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.deleted) return;
        // Unread badge: a new message arriving from someone else WHILE
        // this screen is actively open is, by definition, already seen —
        // keep last_read_at current so closing right after never leaves a
        // gap the badge would wrongly resurrect (see GroupChatUnreadContext
        // for the fuller mechanics). Skipped for the sender's own message —
        // sending was already its own "I'm caught up" moment.
        if (row.sender_id !== user.id) markRead();
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, rowToMessage({ ...row, group_chat_cheers: [] })];
        });
        if (!profileCache.current.has(row.sender_id)) {
          supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', row.sender_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              cacheProfile(row.sender_id, data as { display_name: string; avatar_url: string | null });
              setMessages((prev) =>
                prev.map((m) =>
                  m.senderId === row.sender_id
                    ? { ...m, senderName: (data as { display_name: string }).display_name?.trim() || 'Member', senderAvatarUrl: (data as { avatar_url: string | null }).avatar_url }
                    : m
                )
              );
            });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_chat_messages' }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.deleted) {
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_cheers' }, (payload) => {
        const row = payload.new as { message_id: string; member_id: string; emoji: string };
        const mine = row.member_id === user.id;
        const key = `${row.message_id}:${row.emoji}`;
        // This is the Realtime echo of a reaction THIS viewer just placed
        // via toggleReaction's optimistic update below — already applied
        // locally, so just clear the pending flag instead of applying it
        // again (which would double the count).
        if (mine && pendingReactionKeysRef.current.has(key)) {
          pendingReactionKeysRef.current.delete(key);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== row.message_id) return m;
            return {
              ...m,
              reactions: { ...m.reactions, [row.emoji]: (m.reactions[row.emoji] ?? 0) + 1 },
              myReactions: mine && !m.myReactions.includes(row.emoji) ? [...m.myReactions, row.emoji] : m.myReactions,
            };
          })
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chat_cheers' }, (payload) => {
        const row = payload.old as { message_id?: string; member_id?: string; emoji?: string };
        if (!row.message_id || !row.emoji) return;
        const mine = row.member_id === user.id;
        const key = `${row.message_id}:${row.emoji}`;
        if (mine && pendingReactionKeysRef.current.has(key)) {
          pendingReactionKeysRef.current.delete(key);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== row.message_id) return m;
            return {
              ...m,
              reactions: { ...m.reactions, [row.emoji!]: Math.max(0, (m.reactions[row.emoji!] ?? 0) - 1) },
              myReactions: mine ? m.myReactions.filter((e) => e !== row.emoji) : m.myReactions,
            };
          })
        );
      })
      .subscribe();
    return () => {
      // Evicted immediately, not awaited — tearing down a Realtime channel
      // normally sends a "leave" over the websocket and waits on the
      // server's ack (or @supabase/realtime-js's own 10-second timeout)
      // before it's actually dropped from the client's registry. Under a
      // rapid open/close cycle that doesn't need to finish before the
      // screen visually closes, and under MANY rapid cycles, waiting on it
      // anyway would leave dozens of zombie channels simultaneously
      // mid-teardown — see deferredRealtimeChannel.ts's header comment for
      // the fuller mechanism (confirmed from library source) and why this
      // one topic is unique-per-mount but still goes through the same fast
      // eviction as the shared presence channel.
      fastRemoveChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  // This account's own mute flag, kept live — admin flipping it in Member
  // Manager takes effect here without the member refreshing anything.
  useEffect(() => {
    if (!active || !user) return;
    // Unique per mount — see the matching note on the messages-live
    // channel above for why.
    const mountId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`group-chat-mute-${user.id}-${mountId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { group_chat_muted?: boolean };
          if (typeof row.group_chat_muted === 'boolean') setMuted(row.group_chat_muted);
        }
      )
      .subscribe();
    return () => {
      fastRemoveChannel(channel);
    };
  }, [active, user]);

  // Presence — drives "X IN THE CHAT" (members currently on this screen).
  // No database writes. Each mount tracks its own random key so the same
  // account open in two tabs correctly counts as two.
  //
  // This used to also carry a typing indicator over the same channel —
  // cut from scope (never worked against the real backend; see git history
  // for the removed implementation if a future round wants to try again).
  // The member-count half, below, is the part that actually works and
  // stays.
  useEffect(() => {
    if (!active || !user) return;
    const presenceKey = `${user.id}-${Math.random().toString(36).slice(2)}`;
    // This topic ('group-chat-presence') must stay the exact same string
    // for every member — presence is peer-to-peer rendezvous, so everyone
    // has to be on the same topic to see each other at all.
    // getOrCreateChannel/deferRemoveChannel (deferredRealtimeChannel.ts)
    // gets the crash fix's benefit for this stable-topic channel: a fast
    // reopen cancels and forces through any still-pending deferred removal
    // for this exact topic before reusing it, instead of ever risking a
    // stale teardown landing on the channel a new mount depends on.
    const channel = getOrCreateChannel('group-chat-presence', { config: { presence: { key: presenceKey } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      let count = 0;
      Object.values(state).forEach((entries) => {
        if ((entries as unknown[]).length > 0) count += 1;
      });
      setPresenceCount(count || 1);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ userId: user.id, at: Date.now() });
      }
    });
    return () => {
      // Deferred, not awaited — tearing down a Realtime channel shouldn't
      // block whatever just caused this screen to close (see the matching
      // note on the other channels' cleanup above).
      deferRemoveChannel('group-chat-presence', channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const { data, error: fetchError } = await supabase
      .from('group_chat_messages')
      .select(MESSAGE_SELECT)
      .eq('deleted', false)
      .lt('created_at', new Date(oldest.createdAt).toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (!fetchError && data) {
      const rows = data as unknown as MessageRow[];
      rows.forEach((r) => cacheProfile(r.sender_id, r.profiles));
      setMessages((prev) => [...[...rows].reverse().map(rowToMessage), ...prev]);
      setHasMoreOlder(rows.length === PAGE_SIZE);
    }
    setLoadingOlder(false);
  };

  // Shared by sendMessage/deleteMessage's failure paths — a quiet note,
  // never a blocking alert, and never auto-dismissed (round 118): it waits
  // to be read instead of racing the member for their own attention. Only
  // clearSendError below — tapping the note itself, typing again, or
  // picking a new attachment (see Composer in DocsGroupChatScreen.tsx) —
  // ever clears it.
  const showSendError = (message: string) => {
    setSendError(message);
  };

  const clearSendError = () => setSendError(null);

  // FIX 2 — optimistic send: a temp message with a client-generated id
  // appears in `messages` immediately (pending: true), well before the
  // upload + insert round trip resolves. Once the real row comes back
  // (via .select().single(), not by waiting on the Realtime echo — that
  // would be exactly the network wait this fix removes), the temp message
  // is swapped for the real one. If the Realtime INSERT for this same row
  // happens to arrive first (a race, not the common case), the dedupe
  // below just drops the now-redundant temp-to-real swap instead of
  // inserting a second copy. On failure, the temp message is removed and
  // a quiet, auto-clearing note is shown — no blocking alert.
  const sendMessage = async (text: string, media: MediaAttachment | null): Promise<boolean> => {
    if (!user) return false;
    const trimmed = text.trim();
    if (!trimmed && !media) return false;

    // Honest size check, BEFORE any upload begins and before the optimistic
    // bubble even appears — a real iPhone video around a minute long
    // routinely exceeds Supabase's plan cap, and used to only fail late,
    // after the whole file had already uploaded, with a message that
    // blamed the connection for something the connection never did wrong.
    // Reading the real file via fetch().blob() on a local file:// / blob:
    // URI never touches the network — this is instant, not a real upload
    // attempt.
    let mediaBlob: Blob | null = null;
    if (media) {
      const fetchedBlob = await fetch(media.uri).then((r) => r.blob());
      if (fetchedBlob.size > MAX_GROUP_CHAT_UPLOAD_BYTES) {
        showSendError(media.type === 'video' ? VIDEO_TOO_LARGE_MESSAGE : PHOTO_TOO_LARGE_MESSAGE);
        return false;
      }
      mediaBlob = fetchedBlob;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticReactions: Record<string, number> = {};
    for (const emoji of REACTION_EMOJIS) optimisticReactions[emoji] = 0;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: user.id,
        senderName: displayName,
        senderAvatarUrl: photoUri ?? null,
        text: trimmed,
        // The LOCAL file uri — shows the actual photo/video frame
        // immediately rather than a blank gap while it uploads.
        mediaUrl: media?.uri ?? null,
        mediaType: media?.type ?? null,
        thumbnailUrl: null,
        createdAt: Date.now(),
        reactions: optimisticReactions,
        myReactions: [],
        pending: true,
      },
    ]);

    try {
      let mediaUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      if (media && mediaBlob) {
        const uploaded = await uploadGroupChatMedia(user.id, mediaBlob, media.uri, media.type, (progress) => {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, uploadProgress: progress } : m)));
        });
        mediaUrl = uploaded.mediaUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
      }
      const { data, error: insertError } = await supabase
        .from('group_chat_messages')
        .insert({ sender_id: user.id, body: trimmed, media_url: mediaUrl, media_type: media?.type ?? null, thumbnail_url: thumbnailUrl })
        .select(MESSAGE_SELECT)
        .single();
      if (insertError) throw insertError;
      const realRow = data as unknown as MessageRow;
      cacheProfile(realRow.sender_id, realRow.profiles);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === realRow.id)) return withoutTemp; // Realtime echo already added it
        return [...withoutTemp, rowToMessage(realRow)];
      });
      return true;
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showSendError(describeChatFailure(err, "Message didn't send. Check your connection and try again."));
      return false;
    }
  };

  const deleteMessage = async (id: string) => {
    // Optimistic — gone from the list immediately. Restored (with a quiet
    // note, same pattern as a failed send) if the soft-delete write fails;
    // the common case (it succeeds) never shows anything, same as the
    // Realtime UPDATE handler's own "deleted => filter it out" already did
    // before this fix, just without the wait.
    const removed = messages.find((m) => m.id === id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error: deleteError } = await supabase.from('group_chat_messages').update({ deleted: true }).eq('id', id);
    if (deleteError && removed) {
      setMessages((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, removed].sort((a, b) => a.createdAt - b.createdAt)));
      showSendError(describeChatFailure(deleteError, "Couldn't delete that message. Check your connection and try again."));
    }
  };

  // Same reaction mechanism as the Community feed (see CommunityContext's
  // addReaction/toggleLike) — insert to add, delete to remove, one row per
  // (message, member, emoji). FIX 2: applied optimistically — the pill and
  // count update the instant this is called, not when Realtime echoes it
  // back. pendingReactionKeysRef (set here, read by the INSERT/DELETE
  // handlers above) is what keeps that echo from double-applying. Rolled
  // back if the write itself fails.
  const toggleReaction = async (message: GroupChatMessage, emoji: string) => {
    if (!user) return;
    const wasActive = message.myReactions.includes(emoji);
    const key = `${message.id}:${emoji}`;
    pendingReactionKeysRef.current.add(key);

    const applyDelta = (delta: number, active: boolean) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m;
          return {
            ...m,
            reactions: { ...m.reactions, [emoji]: Math.max(0, (m.reactions[emoji] ?? 0) + delta) },
            myReactions: active ? [...m.myReactions.filter((e) => e !== emoji), emoji] : m.myReactions.filter((e) => e !== emoji),
          };
        })
      );
    };

    applyDelta(wasActive ? -1 : 1, !wasActive);

    try {
      const { error: writeError } = wasActive
        ? await supabase.from('group_chat_cheers').delete().eq('message_id', message.id).eq('member_id', user.id).eq('emoji', emoji)
        : await supabase.from('group_chat_cheers').insert({ message_id: message.id, member_id: user.id, emoji });
      if (writeError) throw writeError;
    } catch {
      pendingReactionKeysRef.current.delete(key);
      applyDelta(wasActive ? 1 : -1, wasActive);
    }
  };

  // Admin only — enforced by RLS regardless of what calls this. Applied
  // optimistically for the admin's own view; every other member sees the
  // new prompt the next time they open the chat.
  const setPinnedPrompt = async (text: string | null): Promise<boolean> => {
    const { error: updateError } = await supabase
      .from('group_chat_settings')
      .update({ pinned_prompt: text, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (updateError) return false;
    setPinnedPromptState(text);
    return true;
  };

  return useMemo(
    () => ({
      loading,
      loadingOlder,
      hasMoreOlder,
      error,
      messages,
      pinnedPrompt,
      presenceCount,
      muted,
      sendError,
      clearSendError,
      loadOlder,
      sendMessage,
      deleteMessage,
      toggleReaction,
      setPinnedPrompt,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, loadingOlder, hasMoreOlder, error, messages, pinnedPrompt, presenceCount, muted, sendError]
  );
}
