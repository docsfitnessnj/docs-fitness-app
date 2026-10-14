import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isBackendUnavailableError, supabase } from './supabaseClient';

const PAGE_SIZE = 50;

export type GroupChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  text: string;
  photoUrl: string | null;
  createdAt: number;
  cheerCount: number;
  cheeredByMe: boolean;
};

type ProfileRef = { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;

function profileOf(ref: ProfileRef) {
  return Array.isArray(ref) ? ref[0] : ref;
}

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  photo_url: string | null;
  created_at: string;
  deleted: boolean;
  profiles: ProfileRef;
  group_chat_cheers: { member_id: string }[];
};

const MESSAGE_SELECT =
  'id, sender_id, body, photo_url, created_at, deleted, profiles(display_name, avatar_url), group_chat_cheers(member_id)';

async function uploadGroupChatPhoto(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from('group-chat-media')
    .upload(path, blob, { upsert: false, contentType: blob.type || 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path);
  return data.publicUrl;
}

export function useGroupChat(active: boolean) {
  const { user, authReady } = useAuth();
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
  const [muted, setMuted] = useState(false);

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
    return {
      id: row.id,
      senderId: row.sender_id,
      senderName: cached?.name ?? 'Member',
      senderAvatarUrl: cached?.avatarUrl ?? null,
      text: row.body,
      photoUrl: row.photo_url,
      createdAt: new Date(row.created_at).getTime(),
      cheerCount: row.group_chat_cheers?.length ?? 0,
      cheeredByMe: row.group_chat_cheers?.some((c) => c.member_id === user?.id) ?? false,
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

  // Live messages + cheers. Every write (send, soft delete, cheer, uncheer)
  // is fire-and-forget to the database — this subscription is the ONLY
  // place local state actually changes for any of them, including the
  // sender's/cheerer's own action. One state machine, no optimistic-vs-real
  // reconciliation to get wrong.
  useEffect(() => {
    if (!active || !user) return;
    const channel = supabase
      .channel('group-chat-messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages' }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.deleted) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const next = [...prev, rowToMessage({ ...row, group_chat_cheers: [] })];
          return next;
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
        const row = payload.new as { message_id: string; member_id: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.message_id
              ? { ...m, cheerCount: m.cheerCount + 1, cheeredByMe: m.cheeredByMe || row.member_id === user.id }
              : m
          )
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chat_cheers' }, (payload) => {
        const row = payload.old as { message_id?: string; member_id?: string };
        if (!row.message_id) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.message_id
              ? {
                  ...m,
                  cheerCount: Math.max(0, m.cheerCount - 1),
                  cheeredByMe: row.member_id === user.id ? false : m.cheeredByMe,
                }
              : m
          )
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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
      supabase.removeChannel(channel);
    };
  }, [active, user]);

  // Presence — "X IN THE CHAT" only ever reflects members currently on this
  // screen right now, via a Realtime presence channel (not a database
  // table). Each mount tracks its own random key so the same account open
  // in two tabs correctly counts as two.
  useEffect(() => {
    if (!active || !user) return;
    const presenceKey = `${user.id}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel('group-chat-presence', { config: { presence: { key: presenceKey } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const count = Object.values(state).reduce((sum, entries) => sum + (entries as unknown[]).length, 0);
      setPresenceCount(count || 1);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ userId: user.id, at: Date.now() });
    });
    return () => {
      supabase.removeChannel(channel);
    };
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

  const sendMessage = async (text: string, photoLocalUri: string | null): Promise<boolean> => {
    if (!user) return false;
    const trimmed = text.trim();
    if (!trimmed && !photoLocalUri) return false;
    try {
      let photoUrl: string | null = null;
      if (photoLocalUri) photoUrl = await uploadGroupChatPhoto(user.id, photoLocalUri);
      const { error: insertError } = await supabase
        .from('group_chat_messages')
        .insert({ sender_id: user.id, body: trimmed, photo_url: photoUrl });
      if (insertError) throw insertError;
      return true;
    } catch {
      return false;
    }
  };

  const deleteMessage = async (id: string) => {
    await supabase.from('group_chat_messages').update({ deleted: true }).eq('id', id);
  };

  const toggleCheer = async (message: GroupChatMessage) => {
    if (!user) return;
    if (message.cheeredByMe) {
      await supabase.from('group_chat_cheers').delete().eq('message_id', message.id).eq('member_id', user.id);
    } else {
      await supabase.from('group_chat_cheers').insert({ message_id: message.id, member_id: user.id });
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
      loadOlder,
      sendMessage,
      deleteMessage,
      toggleCheer,
      setPinnedPrompt,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, loadingOlder, hasMoreOlder, error, messages, pinnedPrompt, presenceCount, muted]
  );
}
