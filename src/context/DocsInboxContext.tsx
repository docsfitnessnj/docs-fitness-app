import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

export type VoiceNote = { uri: string; durationMs: number };

export type DocMessage = {
  id: string;
  memberId: string;
  senderId: string;
  mine: boolean;
  text: string;
  media: MediaAttachment | null;
  voice: VoiceNote | null;
  createdAt: number;
};

export type DocThreadSummary = {
  memberId: string;
  memberName: string;
  memberAvatarUrl: string | null;
  lastMessage: DocMessage;
  lastActivityAt: number;
  // A member message Doc hasn't read yet — Doc's own replies never count.
  unread: boolean;
};

export type SendMessageInput = {
  text: string;
  media?: MediaAttachment | null;
  voice?: VoiceNote | null;
};

type DocsInboxContextValue = {
  loading: boolean;
  error: string | null;
  // MEMBER SIDE — the signed-in member's own thread with Doc.
  myMessages: DocMessage[];
  myThreadUnread: boolean;
  sendMyMessage: (input: SendMessageInput) => Promise<boolean>;
  markMyThreadRead: () => Promise<void>;
  // ADMIN SIDE — every member's thread, newest activity first.
  threads: DocThreadSummary[];
  getThreadMessages: (memberId: string) => DocMessage[];
  sendReply: (memberId: string, input: SendMessageInput) => Promise<boolean>;
  markThreadRead: (memberId: string) => Promise<void>;
  // Either side can unsend their own message; RLS also lets admin unsend any.
  unsendMessage: (id: string) => Promise<void>;
};

const DocsInboxContext = createContext<DocsInboxContextValue | undefined>(undefined);

type ProfileRef = { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;

function profileOf(ref: ProfileRef) {
  return Array.isArray(ref) ? ref[0] : ref;
}

type ThreadRow = {
  member_id: string;
  member_last_read_at: string;
  admin_last_read_at: string | null;
  profiles: ProfileRef;
};

type MessageRow = {
  id: string;
  member_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  voice_url: string | null;
  voice_duration_ms: number | null;
  created_at: string;
};

// Voice notes and photo/video attachments are uploaded for real (not kept as
// a local-only file URI) — this is a shared, cross-device inbox, so a photo
// a member sends has to actually be visible from Doc's own device.
async function uploadMessageFile(memberId: string, localUri: string, kind: 'image' | 'video' | 'voice'): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const extension = kind === 'voice' ? 'm4a' : kind === 'video' ? 'mp4' : blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${memberId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from('message-media')
    .upload(path, blob, { upsert: false, contentType: blob.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from('message-media').getPublicUrl(path);
  return data.publicUrl;
}

function rowToMessage(row: MessageRow, viewerId: string | undefined): DocMessage {
  return {
    id: row.id,
    memberId: row.member_id,
    senderId: row.sender_id,
    mine: row.sender_id === viewerId,
    text: row.body,
    media: row.media_url ? { uri: row.media_url, type: row.media_type ?? 'image' } : null,
    voice: row.voice_url ? { uri: row.voice_url, durationMs: row.voice_duration_ms ?? 0 } : null,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// The one real member <-> Doc inbox. Scope is strictly one-on-one with
// Doc — there is no member-to-member messaging anywhere in this app. One
// thread per member (doc_threads, keyed by member id) holds both sides'
// "last read" timestamp so the gold unread dot is real, shared state; every
// message (either side) is a row in doc_messages. A member's own queries are
// already scoped to just their thread by RLS; admin's queries return every
// thread, which is what drives DOC'S INBOX. See supabase/setup.sql /
// migration_006.sql for the schema and RLS.
export function DocsInboxProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [threadRows, setThreadRows] = useState<ThreadRow[]>([]);
  const [messageRows, setMessageRows] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    if (!user) return Promise.resolve();
    return Promise.all([
      supabase.from('doc_threads').select('member_id, member_last_read_at, admin_last_read_at, profiles(display_name, avatar_url)'),
      supabase
        .from('doc_messages')
        .select('id, member_id, sender_id, body, media_url, media_type, voice_url, voice_duration_ms, created_at')
        .order('created_at', { ascending: true }),
    ]).then(([threadsRes, messagesRes]) => {
      if (threadsRes.error) {
        setError(isBackendUnavailableError(threadsRes.error) ? "Can't load messages right now." : threadsRes.error.message);
        return;
      }
      if (messagesRes.error) {
        setError(isBackendUnavailableError(messagesRes.error) ? "Can't load messages right now." : messagesRes.error.message);
        return;
      }
      setError(null);
      setThreadRows((threadsRes.data as unknown as ThreadRow[]) ?? []);
      setMessageRows((messagesRes.data as unknown as MessageRow[]) ?? []);
    });
  };

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Lazily makes sure this signed-in account's own thread row exists —
    // harmless no-op if it's already there (see the "do nothing" conflict
    // target on doc_threads' primary key).
    supabase
      .from('doc_threads')
      .upsert({ member_id: user.id }, { onConflict: 'member_id', ignoreDuplicates: true })
      .then(() => refetch())
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  const value = useMemo<DocsInboxContextValue>(() => {
    const messages = messageRows.map((row) => rowToMessage(row, user?.id));

    const myMessages = user ? messages.filter((m) => m.memberId === user.id) : [];
    const myThreadRow = threadRows.find((t) => t.member_id === user?.id);
    const myLastReadAt = myThreadRow ? new Date(myThreadRow.member_last_read_at).getTime() : 0;
    const myThreadUnread = myMessages.some((m) => !m.mine && m.createdAt > myLastReadAt);

    const threads: DocThreadSummary[] = threadRows
      .map((row) => {
        const memberMessages = messages.filter((m) => m.memberId === row.member_id);
        if (memberMessages.length === 0) return null;
        const lastMessage = memberMessages[memberMessages.length - 1];
        const adminLastReadAt = row.admin_last_read_at ? new Date(row.admin_last_read_at).getTime() : 0;
        const unread = memberMessages.some((m) => m.senderId === row.member_id && m.createdAt > adminLastReadAt);
        const profile = profileOf(row.profiles);
        return {
          memberId: row.member_id,
          memberName: profile?.display_name?.trim() || 'Member',
          memberAvatarUrl: profile?.avatar_url ?? null,
          lastMessage,
          lastActivityAt: lastMessage.createdAt,
          unread,
        };
      })
      .filter((t): t is DocThreadSummary => t !== null)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    const send = async (memberId: string, input: SendMessageInput): Promise<boolean> => {
      if (!user) return false;
      try {
        let mediaUrl: string | null = null;
        let mediaType: 'image' | 'video' | null = null;
        if (input.media) {
          mediaUrl = await uploadMessageFile(memberId, input.media.uri, input.media.type);
          mediaType = input.media.type;
        }
        let voiceUrl: string | null = null;
        let voiceDurationMs: number | null = null;
        if (input.voice) {
          voiceUrl = await uploadMessageFile(memberId, input.voice.uri, 'voice');
          voiceDurationMs = input.voice.durationMs;
        }
        const { error: insertError } = await supabase.from('doc_messages').insert({
          member_id: memberId,
          sender_id: user.id,
          body: input.text,
          media_url: mediaUrl,
          media_type: mediaType,
          voice_url: voiceUrl,
          voice_duration_ms: voiceDurationMs,
        });
        if (insertError) throw insertError;
        await refetch();
        return true;
      } catch {
        return false;
      }
    };

    const markRead = async (memberId: string) => {
      if (!user) return;
      const patch = memberId === user.id ? { member_last_read_at: new Date().toISOString() } : { admin_last_read_at: new Date().toISOString() };
      await supabase.from('doc_threads').upsert({ member_id: memberId, ...patch }, { onConflict: 'member_id' });
      refetch();
    };

    return {
      loading,
      error,
      myMessages,
      myThreadUnread,
      sendMyMessage: (input) => (user ? send(user.id, input) : Promise.resolve(false)),
      markMyThreadRead: () => (user ? markRead(user.id) : Promise.resolve()),
      threads,
      getThreadMessages: (memberId) => messages.filter((m) => m.memberId === memberId),
      sendReply: (memberId, input) => send(memberId, input),
      markThreadRead: (memberId) => markRead(memberId),
      unsendMessage: async (id) => {
        setMessageRows((prev) => prev.filter((r) => r.id !== id));
        await supabase.from('doc_messages').delete().eq('id', id);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, threadRows, messageRows, user]);

  return <DocsInboxContext.Provider value={value}>{children}</DocsInboxContext.Provider>;
}

export function useDocsInbox() {
  const ctx = useContext(DocsInboxContext);
  if (!ctx) {
    throw new Error('useDocsInbox must be used within a DocsInboxProvider');
  }
  return ctx;
}
