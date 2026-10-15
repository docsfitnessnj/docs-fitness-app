import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DocsBadge } from '../components/brand/DocsBadge';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { ModalHeader } from '../components/ModalHeader';
import { PostAuthorBadges } from '../components/PostAuthorBadges';
import { useMembership } from '../context/MembershipContext';
import { useCanModerate, useDisplayName, useProfile } from '../context/ProfileContext';
import { GroupChatMessage, useGroupChat } from '../lib/useGroupChat';
import { MediaAttachment } from '../lib/media';
import { useMediaPicker } from '../lib/useMediaPicker';
import { showAlert } from '../lib/alert';
import { openMemberships } from '../lib/membershipsModal';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function LockedView({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.container}>
      <ModalHeader title="DOC'S GROUP CHAT" onBack={onClose} backTestID="close-group-chat" />
      <View style={styles.lockedBody}>
        <DocsBadge variant="white" size={96} />
        <Text style={styles.lockedText} testID="group-chat-locked-text">
          Members only.
        </Text>
        <Pressable
          style={styles.lockedButton}
          onPress={() => openMemberships('all')}
          testID="group-chat-view-memberships"
        >
          <Text style={styles.lockedButtonText}>VIEW MEMBERSHIPS</Text>
        </Pressable>
      </View>
    </View>
  );
}

function dayLabel(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, today)) return 'TODAY';
  if (isSameDay(date, yesterday)) return 'YESTERDAY';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

type ListItem = { kind: 'divider'; key: string; label: string } | { kind: 'message'; key: string; message: GroupChatMessage };

function buildListItems(messages: GroupChatMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDay: string | null = null;
  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    if (label !== lastDay) {
      items.push({ kind: 'divider', key: `divider-${label}-${message.id}`, label });
      lastDay = label;
    }
    items.push({ kind: 'message', key: message.id, message });
  }
  return items;
}

function DateDivider({ label }: { label: string }) {
  return (
    <View style={styles.dateDivider} testID={`group-chat-date-divider-${label}`}>
      <View style={styles.dateDividerLine} />
      <Text style={styles.dateDividerText}>{label}</Text>
      <View style={styles.dateDividerLine} />
    </View>
  );
}

function MessageRow({
  message,
  canModerate,
  myName,
  onDelete,
  onCheer,
}: {
  message: GroupChatMessage;
  canModerate: boolean;
  myName: string;
  onDelete: (id: string) => void;
  onCheer: (message: GroupChatMessage) => void;
}) {
  const isMine = message.senderName === myName;
  const canShowMenu = isMine || canModerate;

  const confirmDelete = () => {
    showAlert('Delete This Message?', "This can't be undone.", [
      { text: 'Keep Message', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(message.id) },
    ]);
  };

  const openMenu = () => {
    showAlert(message.senderName, undefined, [
      { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.messageRow} testID={`group-chat-message-${message.id}`}>
      <Avatar name={message.senderName} uri={message.senderAvatarUrl} size={32} />
      <View style={styles.messageBody}>
        <View style={styles.messageHeaderRow}>
          <Text style={styles.senderName} numberOfLines={1}>
            {message.senderName}
          </Text>
          <PostAuthorBadges author={message.senderName} />
          <Text style={styles.timeText}>{timeLabel(message.createdAt)}</Text>
          {canShowMenu && (
            <Pressable onPress={openMenu} hitSlop={8} testID={`group-chat-message-menu-${message.id}`}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {!!message.text && <Text style={styles.messageText}>{message.text}</Text>}
        {!!message.photoUrl && <Image source={{ uri: message.photoUrl }} style={styles.messagePhoto} />}
        <Pressable
          style={styles.cheerRow}
          onPress={() => onCheer(message)}
          hitSlop={8}
          testID={`group-chat-cheer-${message.id}`}
        >
          <Ionicons
            name={message.cheeredByMe ? 'megaphone' : 'megaphone-outline'}
            size={14}
            color={message.cheeredByMe ? colors.gold : colors.textMuted}
          />
          {message.cheerCount > 0 && (
            <Text style={[styles.cheerCountText, message.cheeredByMe && styles.cheerCountTextActive]}>
              {message.cheerCount}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function PinnedPromptCard({ prompt }: { prompt: string }) {
  return (
    <View style={styles.promptCard} testID="group-chat-pinned-prompt">
      <Text style={styles.promptEyebrow}>PINNED</Text>
      <Text style={styles.promptText}>{prompt}</Text>
    </View>
  );
}

function PinnedPromptEditor({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <View style={styles.promptEditor} testID="group-chat-pinned-prompt-editor">
      <Text style={styles.promptEyebrow}>PINNED PROMPT</Text>
      <TextInput
        style={styles.promptInput}
        value={value}
        onChangeText={setValue}
        placeholder="Say something to the whole chat"
        placeholderTextColor={colors.textMuted}
        multiline
        testID="group-chat-pinned-prompt-input"
      />
      <View style={styles.promptEditorRow}>
        <Pressable style={styles.promptEditorCancel} onPress={onCancel} testID="group-chat-pinned-prompt-cancel">
          <Text style={styles.promptEditorCancelText}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={styles.promptEditorSave}
          onPress={() => onSave(value.trim())}
          testID="group-chat-pinned-prompt-save"
        >
          <Text style={styles.promptEditorSaveText}>SAVE</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Composer({
  muted,
  onSend,
}: {
  muted: boolean;
  onSend: (text: string, photoUri: string | null) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const { pick } = useMediaPicker(setMedia);

  if (muted) {
    return (
      <View style={styles.mutedComposer} testID="group-chat-muted-composer">
        <Text style={styles.mutedText}>Posting is turned off for your account.</Text>
      </View>
    );
  }

  const canSend = (text.trim().length > 0 || !!media) && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend(text, media?.uri ?? null);
    setSending(false);
    if (ok) {
      setText('');
      setMedia(null);
    } else {
      showAlert("Couldn't Send", "That message didn't go through. Check your connection and try again.");
    }
  };

  return (
    <View style={styles.composerWrap}>
      {media && (
        <View style={styles.composerMediaPreview} testID="group-chat-photo-preview">
          <Image source={{ uri: media.uri }} style={styles.composerMediaImage} />
          <Pressable style={styles.composerMediaRemove} onPress={() => setMedia(null)} testID="group-chat-remove-photo">
            <Ionicons name="close" size={12} color={colors.white} />
          </Pressable>
        </View>
      )}
      <View style={styles.composerRow}>
        <Pressable onPress={pick} hitSlop={8} style={styles.composerAttach} testID="group-chat-attach-photo">
          <Ionicons name="camera-outline" size={20} color={colors.green} />
        </Pressable>
        <View style={styles.composerInputPill}>
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={setText}
            placeholder="Say something"
            placeholderTextColor={colors.textMuted}
            multiline
            testID="group-chat-input"
            aria-label="Message the group chat"
          />
        </View>
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          testID="group-chat-send"
        >
          <Ionicons name="arrow-up" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

// DOC'S GROUP CHAT — the couch to Community's stage. One live group chat for
// the whole paid membership, backed by migration_012.sql (group_chat_messages
// / group_chat_cheers / group_chat_settings) with Supabase Realtime for new
// messages, cheers, soft deletes, and the member's own mute flag. Access
// (open and post vs. the locked view) reads MembershipContext's already-
// hardened `fullContentAccess` — settled state only, never a loading/
// refetching default (see PRs 106-109) — never just hidden in the UI; the
// same rule is enforced again, independently, by RLS in the database.
export function DocsGroupChatScreen({ visible, onClose }: Props) {
  const { fullContentAccess } = useMembership();
  const canModerate = useCanModerate();
  const myName = useDisplayName();
  const { photoUri } = useProfile();
  const chat = useGroupChat(visible && fullContentAccess);

  const [editingPrompt, setEditingPrompt] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const prevContentHeight = useRef(0);
  const isLoadingOlderRef = useRef(false);
  const insets = useSafeAreaInsets();

  if (!visible) return null;
  if (!fullContentAccess) return <LockedView onClose={onClose} />;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (e.nativeEvent.contentOffset.y < 60 && chat.hasMoreOlder && !chat.loadingOlder) {
      isLoadingOlderRef.current = true;
      chat.loadOlder();
    }
  };

  const handleContentSizeChange = (_w: number, height: number) => {
    if (isLoadingOlderRef.current) {
      const delta = height - prevContentHeight.current;
      if (delta > 0) scrollRef.current?.scrollTo({ y: delta, animated: false });
      isLoadingOlderRef.current = false;
    } else {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
    prevContentHeight.current = height;
  };

  const openAdminMenu = () => {
    const buttons = chat.pinnedPrompt
      ? [
          { text: 'Edit Prompt', onPress: () => setEditingPrompt(true) },
          {
            text: 'Clear Prompt',
            style: 'destructive' as const,
            onPress: () =>
              showAlert('Clear the pinned prompt?', undefined, [
                { text: 'Cancel', style: 'cancel' as const },
                { text: 'Clear', style: 'destructive' as const, onPress: () => chat.setPinnedPrompt(null) },
              ]),
          },
          { text: 'Cancel', style: 'cancel' as const },
        ]
      : [
          { text: 'Set Prompt', onPress: () => setEditingPrompt(true) },
          { text: 'Cancel', style: 'cancel' as const },
        ];
    showAlert('Pinned Prompt', undefined, buttons);
  };

  const items = buildListItems(chat.messages);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ModalHeader
        title="DOC'S GROUP CHAT"
        onBack={onClose}
        backTestID="close-group-chat"
        subtitle={chat.presenceCount >= 2 ? `${chat.presenceCount} IN THE CHAT` : undefined}
        rightElement={
          canModerate ? (
            <Pressable onPress={openAdminMenu} hitSlop={8} testID="group-chat-admin-menu">
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />

      {editingPrompt && (
        <PinnedPromptEditor
          initialValue={chat.pinnedPrompt ?? ''}
          onCancel={() => setEditingPrompt(false)}
          onSave={async (text) => {
            await chat.setPinnedPrompt(text.length > 0 ? text : null);
            setEditingPrompt(false);
          }}
        />
      )}
      {!editingPrompt && !!chat.pinnedPrompt && <PinnedPromptCard prompt={chat.pinnedPrompt} />}

      {chat.error ? (
        <BackendErrorNotice message={chat.error} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          onContentSizeChange={handleContentSizeChange}
        >
          {chat.loadingOlder && <Text style={styles.loadingOlderText}>Loading earlier messages…</Text>}
          {!chat.loading && items.length === 0 && (
            <Text style={styles.emptyState} testID="group-chat-empty-state">
              Nobody's said anything yet. Be the first.
            </Text>
          )}
          {items.map((item) =>
            item.kind === 'divider' ? (
              <DateDivider key={item.key} label={item.label} />
            ) : (
              <MessageRow
                key={item.key}
                message={item.message}
                canModerate={canModerate}
                myName={myName}
                onDelete={chat.deleteMessage}
                onCheer={chat.toggleCheer}
              />
            )
          )}
        </ScrollView>
      )}

      <View style={{ paddingBottom: insets.bottom }}>
        <Composer muted={chat.muted} onSend={chat.sendMessage} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  lockedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  lockedText: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 24,
  },
  lockedButton: {
    backgroundColor: colors.green,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  lockedButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 12,
  },
  loadingOlderText: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyState: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.hairline,
  },
  dateDividerText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  messageBody: {
    flex: 1,
  },
  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  senderName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  timeText: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
  },
  messageText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
  },
  messagePhoto: {
    width: 180,
    aspectRatio: 1,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: colors.card,
  },
  cheerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  cheerCountText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
  },
  cheerCountTextActive: {
    color: colors.gold,
  },
  promptCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 10,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  promptEyebrow: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  promptText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  promptEditor: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 10,
    backgroundColor: colors.card,
    padding: 14,
  },
  promptInput: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
    minHeight: 40,
  },
  promptEditorRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  promptEditorCancel: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  promptEditorCancelText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  promptEditorSave: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  promptEditorSaveText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  mutedComposer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  mutedText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
  },
  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  composerMediaPreview: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  composerMediaImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  composerMediaRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(18,33,28,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 10,
  },
  composerAttach: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInputPill: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxHeight: 100,
  },
  composerInput: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
