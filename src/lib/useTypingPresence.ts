import { useEffect, useRef, useState } from 'react';
import { deferRemoveChannel, getOrCreateChannel } from './deferredRealtimeChannel';
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
    // This channel's topic (channelName) has to stay IDENTICAL across the
    // member's and Doc's separate sessions to rendezvous on — unlike group
    // chat's channels, it can't just be made unique per mount. See
    // deferredRealtimeChannel.ts for how this avoids the same real-device
    // white-screen crash that fix caused for: closing this screen defers
    // this channel's removal by a macrotask, and getOrCreateChannel here
    // cancels (and forces through immediately) any such pending removal
    // for this exact topic before reusing/resubscribing it, so a fast
    // reopen of the same thread never inherits a stale, about-to-be-
    // removed channel object.
    const channel = getOrCreateChannel(channelName, { config: { presence: { key: presenceKey } } });
    // eslint-disable-next-line no-console
    console.log('[typing] thread presence channel created', { channelName, presenceKey, selfLabel });
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
      const next = [...new Set(names)];
      // eslint-disable-next-line no-console
      console.log('[typing] thread presence sync received', { channelName, rawState: state, computedTypingNames: next });
      setTypingNames(next);
    });
    // Re-fires on every (re)join, including a reconnect after a dropped
    // connection — re-asserts the CURRENT typing state (via the ref, not a
    // hardcoded false) so a connection blip mid-typing can't silently
    // strand the other side on a stale "not typing" read.
    channel.subscribe((status) => {
      // eslint-disable-next-line no-console
      console.log('[typing] thread channel subscribe status changed', { channelName, status });
      if (status === 'SUBSCRIBED') {
        const payload = { id: selfId, name: selfLabel, typing: isTypingRef.current, at: Date.now() };
        // eslint-disable-next-line no-console
        console.log('[typing] thread channel SUBSCRIBED, sending initial track()', payload);
        channel.track(payload).then((result) => {
          // eslint-disable-next-line no-console
          console.log('[typing] thread initial track() result', result);
        });
      }
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
      // useGroupChat.ts) — but safely so, via deferRemoveChannel, which a
      // fast reopen of this same thread can cancel. Plain
      // `supabase.removeChannel` deliberately not used directly here.
      deferRemoveChannel(channelName, channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, selfId]);

  const setTyping = (typing: boolean) => {
    const payload = { id: selfId, name: selfLabel, typing, at: Date.now() };
    const channel = channelRef.current;
    // eslint-disable-next-line no-console
    console.log('[typing] thread track payload sending', { payload, channelIsNull: !channel });
    if (!channel) {
      // eslint-disable-next-line no-console
      console.log('[typing] thread track SKIPPED -- channelRef.current is null');
      return;
    }
    channel.track(payload).then((result) => {
      // eslint-disable-next-line no-console
      console.log('[typing] thread track() result', { result, payload });
    });
  };

  // Call on every keystroke — marks this viewer typing and pushes out the
  // auto-clear timer another IDLE_CLEAR_MS, and arms a heartbeat that keeps
  // re-asserting `typing: true` for as long as the viewer keeps typing —
  // belt-and-suspenders against the same dropped-update class the `at`
  // dedup above fixes on the receiving end.
  const notifyTyping = () => {
    // eslint-disable-next-line no-console
    console.log('[typing] thread notifyTyping() called -- local keystroke detected');
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
    // eslint-disable-next-line no-console
    console.log('[typing] thread notifyStopped() called');
    isTypingRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setTyping(false);
  };

  return { typingNames, notifyTyping, notifyStopped };
}
