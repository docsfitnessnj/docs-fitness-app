import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const IDLE_CLEAR_MS = 3000;
// Re-asserts `typing: true` on an interval well inside IDLE_CLEAR_MS while
// the viewer keeps typing — see the `at`-dedup note below for why a single
// dropped/queued presence update should never be able to strand the
// indicator off for the rest of the session.
const TYPING_HEARTBEAT_MS = 1500;

type TypingEntry = { id: string; name: string; typing: boolean; at?: number };

// Presence-only typing indicator, scoped to a single Realtime channel —
// no database writes, nothing persisted, nothing another session reads
// after the fact. Used both by DOC'S GROUP CHAT (which layers this same
// idea onto its own existing presence channel directly — see
// useGroupChat.ts) and by the MESSAGE DOC DIRECTLY thread (via this hook,
// one channel per thread, shared by both the member's and Doc's sessions).
//
// `selfLabel` is what the OTHER party should see when this viewer is
// typing — e.g. the member's own first name when the member is the
// viewer, or the literal "Doc" when an admin is replying. `channelName`
// null/empty means "not ready yet" (e.g. still waiting on a thread id) —
// the hook just stays idle until a real name is passed.
export function useTypingPresence(channelName: string | null, selfId: string | null, selfLabel: string) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!channelName || !selfId) return;
    const presenceKey = `${selfId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName, { config: { presence: { key: presenceKey } } });
    // Every presence key is reduced to its single MOST RECENT entry (by
    // `at`) before reading `typing` off it — Phoenix's presence diff merge
    // (@supabase/phoenix's Presence.syncDiff) can leave a stale meta sitting
    // alongside a fresh one under the same key if an update's "leave" half
    // is delivered separately from (or dropped relative to) its "join"
    // half. Without this, a stale leftover entry could permanently mask
    // the real, current state — this is what caused "fires once, never
    // again": the very first typing cycle synced cleanly, but a stale
    // entry left behind by a later update could keep masking every cycle
    // after it.
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const names: string[] = [];
      Object.values(state).forEach((entries) => {
        const typed = entries as unknown as TypingEntry[];
        if (typed.length === 0) return;
        const latest = typed.reduce((a, b) => ((b.at ?? 0) > (a.at ?? 0) ? b : a));
        if (latest.id !== selfId && latest.typing) names.push(latest.name);
      });
      setTypingNames([...new Set(names)]);
    });
    // Re-fires on every (re)join, including a reconnect after a dropped
    // connection — re-asserts the CURRENT typing state (via the ref, not a
    // hardcoded false) so a connection blip mid-typing can't silently
    // strand the other side on a stale "not typing" read.
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ id: selfId, name: selfLabel, typing: isTypingRef.current, at: Date.now() });
    });
    channelRef.current = channel;
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      channelRef.current = null;
      setTypingNames([]);
      // Deferred, not awaited — tearing down a Realtime channel shouldn't
      // block whatever just caused this screen to close (see the matching
      // note on the group chat presence channel's cleanup in
      // useGroupChat.ts).
      setTimeout(() => supabase.removeChannel(channel), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, selfId]);

  const setTyping = (typing: boolean) => {
    channelRef.current?.track({ id: selfId, name: selfLabel, typing, at: Date.now() });
  };

  // Call on every keystroke — marks this viewer typing and pushes out the
  // auto-clear timer another IDLE_CLEAR_MS, and arms a heartbeat that keeps
  // re-asserting `typing: true` for as long as the viewer keeps typing —
  // belt-and-suspenders against the same dropped-update class the `at`
  // dedup above fixes on the receiving end.
  const notifyTyping = () => {
    isTypingRef.current = true;
    setTyping(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      setTyping(false);
    }, IDLE_CLEAR_MS);
    if (!heartbeatTimerRef.current) {
      heartbeatTimerRef.current = setInterval(() => {
        if (isTypingRef.current) setTyping(true);
      }, TYPING_HEARTBEAT_MS);
    }
  };

  // Call on send (or on leaving the screen) — clears typing immediately
  // rather than waiting out the idle timer.
  const notifyStopped = () => {
    isTypingRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setTyping(false);
  };

  return { typingNames, notifyTyping, notifyStopped };
}
