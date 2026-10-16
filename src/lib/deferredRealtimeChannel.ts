import { supabase } from './supabaseClient';

// Fixes the real-device white-screen crash traced to DOC'S GROUP CHAT:
// `supabase.channel(topic)` returns the EXISTING JS channel object if one
// with that exact topic string is still registered, rather than creating a
// new one (see @supabase/realtime-js's RealtimeClient.channel()). Deferring
// a channel's removal by a macrotask (so closing a screen doesn't block on
// a websocket round trip — see useGroupChat.ts/useTypingPresence.ts) opens
// a window where a fast reopen of the SAME topic reclaims the still-
// registered, about-to-be-removed channel object: re-subscribing an
// already-joined channel, then having the stale deferred removal tear down
// the channel the new mount now depends on.
//
// DOC'S GROUP CHAT's own three channels sidestep this entirely by making
// their topic unique per mount, so a collision can never happen. That
// trick doesn't work for a presence channel whose topic must stay IDENTICAL
// across two different accounts' sessions to rendezvous on (the MESSAGE DOC
// DIRECTLY thread's typing channel, shared by the member and Doc) — for
// that case, this module tracks pending removals by topic name and, if the
// same topic is reclaimed before its deferred removal fires, cancels that
// removal and forces it through SYNCHRONOUSLY right now instead, before the
// fresh channel is created. The old channel is always fully gone before the
// new one exists — never reused, never torn down out from under it.
const pendingRemovals = new Map<string, { channel: ReturnType<typeof supabase.channel>; timer: ReturnType<typeof setTimeout> }>();

export function getOrCreateChannel(
  topic: string,
  params?: Parameters<typeof supabase.channel>[1]
): ReturnType<typeof supabase.channel> {
  const pending = pendingRemovals.get(topic);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRemovals.delete(topic);
    supabase.removeChannel(pending.channel);
  }
  return supabase.channel(topic, params);
}

export function deferRemoveChannel(topic: string, channel: ReturnType<typeof supabase.channel>): void {
  const timer = setTimeout(() => {
    pendingRemovals.delete(topic);
    supabase.removeChannel(channel);
  }, 0);
  pendingRemovals.set(topic, { channel, timer });
}
