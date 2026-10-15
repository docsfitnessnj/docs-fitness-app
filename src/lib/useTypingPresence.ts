import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const IDLE_CLEAR_MS = 3000;

type TypingEntry = { id: string; name: string; typing: boolean };

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

  useEffect(() => {
    if (!channelName || !selfId) return;
    const presenceKey = `${selfId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName, { config: { presence: { key: presenceKey } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const names: string[] = [];
      Object.values(state).forEach((entries) => {
        (entries as unknown as TypingEntry[]).forEach((entry) => {
          if (entry.id !== selfId && entry.typing) names.push(entry.name);
        });
      });
      setTypingNames([...new Set(names)]);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ id: selfId, name: selfLabel, typing: false });
    });
    channelRef.current = channel;
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setTypingNames([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, selfId]);

  const setTyping = (typing: boolean) => {
    channelRef.current?.track({ id: selfId, name: selfLabel, typing });
  };

  // Call on every keystroke — marks this viewer typing and pushes out the
  // auto-clear timer another IDLE_CLEAR_MS. Safe to call rapidly; each call
  // just resets the same timer rather than re-tracking redundantly on every
  // keypress would be a nice-to-have, but tracking is cheap and this keeps
  // the logic simple.
  const notifyTyping = () => {
    setTyping(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setTyping(false), IDLE_CLEAR_MS);
  };

  // Call on send (or on leaving the screen) — clears typing immediately
  // rather than waiting out the idle timer.
  const notifyStopped = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setTyping(false);
  };

  return { typingNames, notifyTyping, notifyStopped };
}
