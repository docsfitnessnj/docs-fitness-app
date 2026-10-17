import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { Avatar } from '../components/Avatar';
import { UnreadDot } from '../components/UnreadDot';
import { DocThreadView } from '../components/DocThreadView';
import { DocMessage, useDocsInbox } from '../context/DocsInboxContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function relativeTimeLabel(ms: number): string {
  const diffMs = Date.now() - ms;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function previewOf(message: DocMessage): string {
  if (message.text.trim().length > 0) return message.text.trim();
  if (message.voice) return '🎤 Voice note';
  if (message.media?.type === 'video') return '📹 Video';
  if (message.media) return '📷 Photo';
  return '';
}

// Doc's real inbox — every member's thread, newest activity first, with a
// gold dot for any thread that has a member message she hasn't opened yet.
// Reads/writes the same doc_threads / doc_messages tables MessagesScreen
// does (see DocsInboxContext) — this is simply the admin-side view of all
// of them instead of just one.
export function DocsInboxScreen({ visible, onClose }: Props) {
  const inbox = useDocsInbox();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedMemberId) inbox.markThreadRead(selectedMemberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId]);

  if (!visible) return null;

  if (inbox.loading) {
    return (
      <View style={styles.container}>
        <ModalHeader title="DOC'S INBOX" onBack={onClose} backTestID="close-docs-inbox" />
      </View>
    );
  }

  if (inbox.error) {
    return (
      <View style={styles.container}>
        <ModalHeader title="DOC'S INBOX" onBack={onClose} backTestID="close-docs-inbox" />
        <BackendErrorNotice message={inbox.error} />
      </View>
    );
  }

  if (selectedMemberId) {
    const thread = inbox.threads.find((t) => t.memberId === selectedMemberId);
    return (
      <View style={styles.container}>
        <ModalHeader
          title={thread?.memberName ?? 'MEMBER'}
          onBack={() => setSelectedMemberId(null)}
          backTestID="docs-inbox-thread-back"
        />
        <DocThreadView
          messages={inbox.getThreadMessages(selectedMemberId)}
          onSend={(input) => inbox.sendReply(selectedMemberId, input)}
          onUnsend={inbox.unsendMessage}
          emptyStateText="No messages in this thread yet."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModalHeader title="DOC'S INBOX" onBack={onClose} backTestID="close-docs-inbox" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {inbox.threads.length === 0 ? (
          <Text style={styles.emptyText}>No conversations yet.</Text>
        ) : (
          inbox.threads.map((thread) => (
            <Pressable
              key={thread.memberId}
              style={styles.threadRow}
              onPress={() => setSelectedMemberId(thread.memberId)}
              testID={`docs-inbox-thread-${thread.memberId}`}
            >
              <Avatar name={thread.memberName} uri={thread.memberAvatarUrl} size={44} />
              <View style={styles.threadTextWrap}>
                <View style={styles.threadTopRow}>
                  <Text style={styles.threadName} numberOfLines={1}>
                    {thread.memberName}
                  </Text>
                  <Text style={styles.threadTime}>{relativeTimeLabel(thread.lastActivityAt)}</Text>
                </View>
                <View style={styles.threadPreviewRow}>
                  {thread.unread && <UnreadDot style={styles.threadUnreadDot} />}
                  <Text style={[styles.threadPreview, thread.unread && styles.threadPreviewUnread]} numberOfLines={1}>
                    {previewOf(thread.lastMessage)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  threadTextWrap: {
    flex: 1,
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  threadName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    marginRight: 8,
  },
  threadTime: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  threadPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  threadUnreadDot: {
    marginRight: 6,
  },
  threadPreview: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  threadPreviewUnread: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
  },
});
