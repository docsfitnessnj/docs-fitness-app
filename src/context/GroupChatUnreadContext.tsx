import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useMembership } from './MembershipContext';
import { fastRemoveChannel } from '../lib/deferredRealtimeChannel';
import { supabase } from '../lib/supabaseClient';

// Never-read baseline for a member whose group_chat_reads row doesn't
// exist yet (never opened the chat even once this account's lifetime) —
// every existing, non-own, non-deleted message counts as unread, same as
// it honestly should.
const EPOCH_ISO = new Date(0).toISOString();

type GroupChatUnreadValue = {
  // Raw count, uncapped — UnreadCountBadge is what applies the "99+" cap
  // for display; kept uncapped here so nothing downstream has to guess
  // whether a displayed "99+" means exactly 100 or 10,000.
  unreadCount: number;
  // Resets the badge to 0 locally AND writes last_read_at = now() to
  // group_chat_reads (upsert — first-ever call for an account creates the
  // row). Called by useGroupChat both when the chat screen becomes active
  // (covers "opened the chat") and again on every new live message it
  // sees while active (covers "a new message arrived while actively
  // viewing" — see migration_016.sql's table comment for why that second
  // trigger matters).
  markRead: () => void;
};

const GroupChatUnreadContext = createContext<GroupChatUnreadValue>({
  unreadCount: 0,
  markRead: () => {},
});

export function useGroupChatUnread() {
  return useContext(GroupChatUnreadContext);
}

// Mounted once, near the app root (see App.tsx), independent of whether
// DOC'S GROUP CHAT is actually open — this is what lets the unread badge
// (Community top bar icon, the hamburger drawer row, the desktop sidebar
// row) show a live count while the member is anywhere else in the app.
// Access mirrors the chat itself exactly (MembershipContext's
// `fullContentAccess`, the same rule `has_group_chat_access` enforces
// server-side) — a member without access never even opens a realtime
// channel for this, so there's never a badge to accidentally show them.
export function GroupChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { fullContentAccess } = useMembership();
  const [unreadCount, setUnreadCount] = useState(0);
  const active = !!user && fullContentAccess;
  const userId = user?.id;

  // Initial count: everything newer than this account's last_read_at (or
  // the epoch, if it's never read the chat at all) that isn't its own and
  // isn't deleted.
  useEffect(() => {
    if (!active || !userId) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    supabase
      .from('group_chat_reads')
      .select('last_read_at')
      .eq('member_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const since = (data as { last_read_at: string } | null)?.last_read_at ?? EPOCH_ISO;
        return supabase
          .from('group_chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('deleted', false)
          .neq('sender_id', userId)
          .gt('created_at', since);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setUnreadCount(res.count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  // Live increments while the member is elsewhere in the app. Deliberately
  // does NOT try to detect "is the chat currently open" and suppress
  // counting while it is — instead, useGroupChat's own markRead() calls
  // (on open, and on every new message it sees while active) correct this
  // right back to 0 for the entire time the chat IS open, and
  // unconditionally once more the moment it's closed, so by the time this
  // count is next actually visible to the member it's always accurate
  // regardless of exactly how these two independent subscriptions to the
  // same INSERT events happened to interleave in between.
  useEffect(() => {
    if (!active || !userId) return;
    const mountId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`group-chat-unread-${mountId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages' }, (payload) => {
        const row = payload.new as { sender_id: string; deleted: boolean };
        if (row.deleted || row.sender_id === userId) return;
        setUnreadCount((c) => c + 1);
      })
      .subscribe();
    return () => {
      fastRemoveChannel(channel);
    };
  }, [active, userId]);

  const markRead = useCallback(() => {
    setUnreadCount(0);
    if (!userId) return;
    supabase
      .from('group_chat_reads')
      .upsert({ member_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'member_id' })
      .then(() => {});
  }, [userId]);

  const value = useMemo(() => ({ unreadCount, markRead }), [unreadCount, markRead]);

  return <GroupChatUnreadContext.Provider value={value}>{children}</GroupChatUnreadContext.Provider>;
}
