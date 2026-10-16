import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { REACTION_EMOJIS } from '../context/CommunityContext';
import { useDisplayName } from '../context/ProfileContext';
import { MediaAttachment } from './media';
import { firstNameOf } from './typingLabel';
import { isBackendUnavailableError, supabase } from './supabaseClient';

const PAGE_SIZE = 50;
const TYPING_IDLE_MS = 3000;
// How often an actively-typing viewer re-asserts `typing: true` on the
// presence channel — well inside TYPING_IDLE_MS so a single dropped/queued
// presence update (see the sync handler below) never leaves the indicator
// stuck off for the rest of the session; the next heartbeat self-heals it.
const TYPING_HEARTBEAT_MS = 1500;

export type GroupChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  createdAt: number;
  // Same 4-emoji set as the Community feed (shaka, fire, flex, heart) —
  // see REACTION_EMOJIS in CommunityContext.tsx, the single source of
  // truth both features read from. One count per emoji; `myReactions` is
  // which of those this viewer has already placed on this message.
  reactions: Record<string, number>;
  myReactions: string[];
};

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
  created_at: string;
  deleted: boolean;
  profiles: ProfileRef;
  group_chat_cheers: CheerRow[];
};

const MESSAGE_SELECT =
  'id, sender_id, body, media_url, media_type, created_at, deleted, profiles(display_name, avatar_url), group_chat_cheers(member_id, emoji)';

// Same upload shape as DocsInboxContext's uploadMessageFile — the extension
// comes from `kind`, not a content-type sniff, so a video uploads as .mp4
// (and gets served with the right content type) instead of silently being
// named like a photo, which is why a video sent before this fix never
// "came through": the receiving side had no way to know photo_url wasn't
// actually a photo.
async function uploadGroupChatMedia(userId: string, localUri: string, kind: 'image' | 'video'): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const extension = kind === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from('group-chat-media')
    .upload(path, blob, { upsert: false, contentType: blob.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path);
  return data.publicUrl;
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
  const [messages, setMessages] = useState<GroupChatMessage[]>([]); // ascending — oldest first, newest last
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedPrompt, setPinnedPromptState] = useState<string | null>(null);
  // Starts at 1 (just this viewer) rather than 0 — presenceCount only ever
  // drives "X IN THE CHAT", shown starting at 2, so the exact value before
  // the presence channel's first sync doesn't matter.
  const [presenceCount, setPresenceCount] = useState(1);
  // Who else (never includes this viewer) is currently typing, per the
  // presence channel below — formatted into copy by the screen via
  // typingLabel() in lib/typingLabel.ts.
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);

  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The source of truth for "am I currently typing" — read by the presence
  // channel's (re)subscribe handler and the heartbeat interval below, so
  // both always reflect the live value rather than whatever was true when
  // their closures were created.
  const isTypingRef = useRef(false);
  const typingHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      createdAt: new Date(row.created_at).getTime(),
      reactions,
      myReactions,
    };
  };

  // Initial load: most recent 50 messages, the pinned prompt, and this
  // account's own mute flag — mirrors a fresh page load exactly once per
  // time the screen opens.
  useEffect(() => {
    if (!active || !authReady || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      supabase
        .from('group_chat_messages')
        .select(MESSAGE_SELECT)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase.from('group_chat_settings').select('pinned_prompt').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('group_chat_muted').eq('id', user.id).maybeSingle(),
    ]).then(([msgsRes, settingsRes, profileRes]) => {
      if (cancelled) return;
      if (msgsRes.error) {
        setError(isBackendUnavailableError(msgsRes.error) ? "Can't load the chat right now." : msgsRes.error.message);
        setLoading(false);
        return;
      }
      const rows = (msgsRes.data as unknown as MessageRow[]) ?? [];
      rows.forEach((r) => cacheProfile(r.sender_id, r.profiles));
      setMessages([...rows].reverse().map(rowToMessage));
      setHasMoreOlder(rows.length === PAGE_SIZE);
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

  // Live messages + reactions. Every write (send, soft delete, react,
  // un-react) is fire-and-forget to the database — this subscription is
  // the ONLY place local state actually changes for any of them, including
  // the sender's/reactor's own action. One state machine, no optimistic-
  // vs-real reconciliation to get wrong.
  useEffect(() => {
    if (!active || !user) return;
    const channel = supabase
      .channel('group-chat-messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages' }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.deleted) return;
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
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== row.message_id) return m;
            const mine = row.member_id === user.id;
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
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== row.message_id) return m;
            const mine = row.member_id === user.id;
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
      // Deferred, not awaited: tearing down a Realtime channel sends a
      // "leave" over the websocket and does internal bookkeeping that
      // doesn't need to finish before the screen visually closes — see
      // the fuller explanation on the presence channel's cleanup below,
      // which is the one most likely to actually have work to do.
      setTimeout(() => supabase.removeChannel(channel), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  // This account's own mute flag, kept live — admin flipping it in Member
  // Manager takes effect here without the member refreshing anything.
  useEffect(() => {
    if (!active || !user) return;
    const channel = supabase
      .channel(`group-chat-mute-${user.id}`)
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
      setTimeout(() => supabase.removeChannel(channel), 0);
    };
  }, [active, user]);

  // Presence — drives both "X IN THE CHAT" (members currently on this
  // screen) and the typing indicator, over the SAME Realtime presence
  // channel rather than a second one: each tracked payload carries this
  // viewer's name, whether they're actively typing right now, and when
  // that payload was tracked (`at`). No database writes for any of it.
  // Each mount tracks its own random key so the same account open in two
  // tabs correctly counts as two.
  //
  // The `at` timestamp exists specifically to fix a real bug: Phoenix's
  // presence diff merge (see @supabase/phoenix's Presence.syncDiff) can
  // leave a STALE meta entry sitting alongside a fresh one under the same
  // presence key — e.g. if the "leave" half of an update's join+leave pair
  // is delivered separately from (or is dropped relative to) the "join"
  // half. The old code iterated every entry under a key and OR'd their
  // `typing` flags together, so a stale leftover entry could permanently
  // mask the real, current state — matching the reported "fires once,
  // never again" symptom exactly. Keying off only the entry with the
  // highest `at` per presence key means a stale duplicate can never again
  // override the current one.
  useEffect(() => {
    if (!active || !user) return;
    const presenceKey = `${user.id}-${Math.random().toString(36).slice(2)}`;
    const selfName = firstNameOf(displayName);
    const channel = supabase.channel('group-chat-presence', { config: { presence: { key: presenceKey } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      let count = 0;
      const typing: string[] = [];
      Object.values(state).forEach((entries) => {
        const typed = entries as unknown as { userId: string; name: string; typing?: boolean; at?: number }[];
        if (typed.length === 0) return;
        count += 1;
        const latest = typed.reduce((a, b) => ((b.at ?? 0) > (a.at ?? 0) ? b : a));
        if (latest.userId !== user.id && latest.typing) typing.push(latest.name);
      });
      setPresenceCount(count || 1);
      setTypingNames([...new Set(typing)]);
    });
    // Re-fires on every (re)join, including a reconnect after a dropped
    // connection — re-asserts whatever this viewer's typing state actually
    // is right now (via the ref, not a hardcoded false) so a connection
    // blip mid-typing can't silently strand the rest of the chat on a
    // stale "not typing" read.
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ userId: user.id, name: selfName, typing: isTypingRef.current, at: Date.now() });
      }
    });
    presenceChannelRef.current = channel;
    return () => {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      if (typingHeartbeatTimerRef.current) clearInterval(typingHeartbeatTimerRef.current);
      // Null the ref immediately (synchronous, cheap, makes notifyTyping/
      // notifyStopped harmlessly no-op the instant this screen is on its
      // way out) but defer the actual network teardown — tapping BACK on
      // a real device was sometimes taking seconds (reported as "force
      // closing the app") because this cleanup, along with the other two
      // channels' above, ran synchronously inside React's unmount commit,
      // the same commit that's supposed to make the screen disappear. On
      // a slow/real mobile connection, three `removeChannel` calls each
      // waiting on their own websocket round trip was enough to visibly
      // block the paint. None of that teardown needs to finish before the
      // screen is gone, so it now runs in a macrotask right after.
      presenceChannelRef.current = null;
      setTimeout(() => supabase.removeChannel(channel), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  const trackTyping = (typing: boolean) => {
    if (!user) return;
    presenceChannelRef.current?.track({ userId: user.id, name: firstNameOf(displayName), typing, at: Date.now() });
  };

  // Call on every composer keystroke — marks this viewer typing on the
  // shared presence channel above and pushes the auto-clear timer out
  // another TYPING_IDLE_MS. Also arms a heartbeat that keeps re-asserting
  // `typing: true` every TYPING_HEARTBEAT_MS for as long as the viewer
  // keeps typing — belt-and-suspenders against the same class of dropped-
  // update bug the `at` dedup above fixes on the receiving end: even if
  // one presence update never reaches another viewer, the next heartbeat
  // (well under TYPING_IDLE_MS later) does.
  const notifyTyping = () => {
    if (!user) return;
    isTypingRef.current = true;
    trackTyping(true);
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      trackTyping(false);
    }, TYPING_IDLE_MS);
    if (!typingHeartbeatTimerRef.current) {
      typingHeartbeatTimerRef.current = setInterval(() => {
        if (isTypingRef.current) trackTyping(true);
      }, TYPING_HEARTBEAT_MS);
    }
  };

  // Call on send, or when the composer empties out — clears typing
  // immediately instead of waiting out the idle timer.
  const notifyStopped = () => {
    if (!user) return;
    isTypingRef.current = false;
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    trackTyping(false);
  };

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

  const sendMessage = async (text: string, media: MediaAttachment | null): Promise<boolean> => {
    if (!user) return false;
    const trimmed = text.trim();
    if (!trimmed && !media) return false;
    try {
      let mediaUrl: string | null = null;
      if (media) mediaUrl = await uploadGroupChatMedia(user.id, media.uri, media.type);
      const { error: insertError } = await supabase
        .from('group_chat_messages')
        .insert({ sender_id: user.id, body: trimmed, media_url: mediaUrl, media_type: media?.type ?? null });
      if (insertError) throw insertError;
      return true;
    } catch {
      return false;
    }
  };

  const deleteMessage = async (id: string) => {
    await supabase.from('group_chat_messages').update({ deleted: true }).eq('id', id);
  };

  // Same reaction mechanism as the Community feed (see CommunityContext's
  // addReaction/toggleLike) — insert to add, delete to remove, one row per
  // (message, member, emoji). Realtime above is the only thing that ever
  // updates local counts, including for this viewer's own tap.
  const toggleReaction = async (message: GroupChatMessage, emoji: string) => {
    if (!user) return;
    if (message.myReactions.includes(emoji)) {
      await supabase.from('group_chat_cheers').delete().eq('message_id', message.id).eq('member_id', user.id).eq('emoji', emoji);
    } else {
      await supabase.from('group_chat_cheers').insert({ message_id: message.id, member_id: user.id, emoji });
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
      typingNames,
      muted,
      loadOlder,
      sendMessage,
      deleteMessage,
      toggleReaction,
      setPinnedPrompt,
      notifyTyping,
      notifyStopped,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, loadingOlder, hasMoreOlder, error, messages, pinnedPrompt, presenceCount, typingNames, muted]
  );
}
