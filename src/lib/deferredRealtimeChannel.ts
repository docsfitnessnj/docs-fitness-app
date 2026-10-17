import { supabase } from './supabaseClient';

// Fixes the real-device white-screen crash traced to DOC'S GROUP CHAT:
// `supabase.channel(topic)` returns the EXISTING JS channel object if one
// with that exact topic string is still registered, rather than creating a
// new one (see @supabase/realtime-js's RealtimeClient.channel()). Deferring
// a channel's removal by a macrotask (so closing a screen doesn't block on
// a websocket round trip — see useGroupChat.ts) opens a window where a fast
// reopen of the SAME topic reclaims the still-registered, about-to-be-
// removed channel object: re-subscribing an already-joined channel, then
// having the stale deferred removal tear down the channel the new mount now
// depends on.
//
// Most of DOC'S GROUP CHAT's channels sidestep this entirely by making
// their topic unique per mount, so a collision can never happen. That
// trick doesn't work for a presence channel whose topic must stay IDENTICAL
// across every member's session to rendezvous on (group-chat-presence,
// which drives "X IN THE CHAT") — for that case, this module tracks
// pending removals by topic name and, if the same topic is reclaimed
// before its deferred removal fires, evicts the old channel immediately.
//
// A SECOND, more subtle bug lived here too (found this round, after the
// first fix still let a white screen through under very many rapid
// open/close cycles): the original "cancel and force through" simply
// called `supabase.removeChannel(oldChannel)` without awaiting it, then
// immediately called `supabase.channel(topic)` again. But `removeChannel`
// is `async` — it does `await channel.unsubscribe()` (a real websocket
// round trip waiting on the server's "leave" ack, or @supabase/realtime-js's
// own DEFAULT_TIMEOUT of 10 SECONDS if the server never replies in time —
// see lib/constants.js) before it tears the channel down and removes it
// from the client's internal topic registry. Calling `.channel(topic)`
// again right away, before that promise has resolved, finds the OLD
// channel STILL registered and hands it straight back — now in Phoenix's
// `leaving` state. A channel in that state never reaches `joined` again,
// so `subscribe()` silently no-ops (see RealtimeChannel.subscribe()'s
// `channelAdapter.isClosed()` guard) and nothing on it ever resolves —
// exactly the "channel registry waiting forever" hang this round went
// looking for, reachable specifically under "very many fast" cycles because
// that's what it takes for a reopen to land inside that (normally narrow,
// but not bounded) async window.
//
// The fix: don't wait on the server's ack, or on `removeChannel`'s promise,
// to find out whether the old channel is really gone. Evict it from the
// client's own topic registry ourselves, synchronously, right now.
// `supabase.getChannels()` is public, documented API that returns
// @supabase/realtime-js's own live internal array (not a defensive copy —
// confirmed by reading RealtimeClient.getChannels()); splicing the old
// channel out of it is what actually makes the next `.channel(topic)` call
// create a genuinely new object, with no dependency on any async handshake
// completing first. The polite "leave" message to the server still gets
// sent in the background via `unsubscribe()` — just fire-and-forget, never
// gating the new channel on it.
// Also exported directly (as `fastRemoveChannel`) for the OTHER two
// DOC'S GROUP CHAT channels (messages-live, mute), whose unique-per-mount
// topics mean they never need the pending-removal bookkeeping below — but
// under a 25-cycle abusive open/close test, letting each of THOSE teardowns
// also idle on the server's ack (rather than evicting immediately) means up
// to dozens of zombie channels can be simultaneously mid-leave at once,
// each still holding a live postgres_changes subscription open against the
// same tables — real connection/resource pressure for no benefit, since
// nothing is waiting on their graceful close either. Same fast-eviction
// treatment fixes that too.
function evictChannel(channel: ReturnType<typeof supabase.channel>): void {
  const channels = supabase.getChannels();
  const idx = channels.indexOf(channel);
  if (idx !== -1) channels.splice(idx, 1);
  channel
    .unsubscribe()
    .catch(() => {})
    .then(() => channel.teardown());
}

export const fastRemoveChannel = evictChannel;

const pendingRemovals = new Map<string, { channel: ReturnType<typeof supabase.channel>; timer: ReturnType<typeof setTimeout> }>();

export function getOrCreateChannel(
  topic: string,
  params?: Parameters<typeof supabase.channel>[1]
): ReturnType<typeof supabase.channel> {
  const pending = pendingRemovals.get(topic);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRemovals.delete(topic);
    evictChannel(pending.channel);
  }
  return supabase.channel(topic, params);
}

export function deferRemoveChannel(topic: string, channel: ReturnType<typeof supabase.channel>): void {
  const timer = setTimeout(() => {
    pendingRemovals.delete(topic);
    evictChannel(channel);
  }, 0);
  pendingRemovals.set(topic, { channel, timer });
}
