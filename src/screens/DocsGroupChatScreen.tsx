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
import { MediaViewer } from '../components/MediaViewer';
import { ModalHeader } from '../components/ModalHeader';
import { PostAuthorBadges } from '../components/PostAuthorBadges';
import { REACTION_EMOJIS } from '../context/CommunityContext';
import { useMembership } from '../context/MembershipContext';
import { useCanModerate, useDisplayName, useProfile } from '../context/ProfileContext';
import { GroupChatMessage, useGroupChat } from '../lib/useGroupChat';
import { MediaAttachment } from '../lib/media';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { useMediaPicker } from '../lib/useMediaPicker';
import { showAlert } from '../lib/alert';
import { openMemberships } from '../lib/membershipsModal';
import { typingLabel } from '../lib/typingLabel';
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

// The condensed, "only what's active" reaction pill row — text messages'
// tap-or-long-press-revealed summary.
function ActiveReactionRow({
  message,
  onReact,
}: {
  message: GroupChatMessage;
  onReact: (message: GroupChatMessage, emoji: string) => void;
}) {
  const activeEmojis = REACTION_EMOJIS.filter((emoji) => message.reactions[emoji] > 0);
  if (activeEmojis.length === 0) return null;
  return (
    <View style={styles.reactionRow}>
      {activeEmojis.map((emoji) => (
        <Pressable
          key={emoji}
          style={[styles.reactionPill, message.myReactions.includes(emoji) && styles.reactionPillActive]}
          onPress={() => onReact(message, emoji)}
          hitSlop={6}
          testID={`group-chat-reaction-${message.id}-${emoji}`}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[styles.reactionCountText, message.myReactions.includes(emoji) && styles.reactionCountTextActive]}>
            {message.reactions[emoji]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Every message with a photo or video gets this instead — all four emoji,
// always visible, one tap to react (no reveal step). See the FIX 4 note on
// DocsGroupChatScreen below for why media and text behave differently here.
function MediaReactionRow({
  message,
  onReact,
}: {
  message: GroupChatMessage;
  onReact: (message: GroupChatMessage, emoji: string) => void;
}) {
  return (
    <View style={styles.reactionRow} testID={`group-chat-media-reactions-${message.id}`}>
      {REACTION_EMOJIS.map((emoji) => {
        const mine = message.myReactions.includes(emoji);
        return (
          <Pressable
            key={emoji}
            style={[styles.reactionPill, mine && styles.reactionPillActive]}
            onPress={() => onReact(message, emoji)}
            hitSlop={6}
            testID={`group-chat-reaction-${message.id}-${emoji}`}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            {message.reactions[emoji] > 0 && (
              <Text style={[styles.reactionCountText, mine && styles.reactionCountTextActive]}>{message.reactions[emoji]}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function MessageRow({
  message,
  canModerate,
  myName,
  pickerOpen,
  onDelete,
  onTogglePicker,
  onReact,
  onOpenViewer,
}: {
  message: GroupChatMessage;
  canModerate: boolean;
  myName: string;
  pickerOpen: boolean;
  onDelete: (id: string) => void;
  onTogglePicker: (id: string) => void;
  onReact: (message: GroupChatMessage, emoji: string) => void;
  onOpenViewer: (message: GroupChatMessage) => void;
}) {
  const isMine = message.senderName === myName;
  const canShowMenu = isMine || canModerate;
  const hasMedia = !!message.mediaUrl;

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

        {/* Text alone keeps the original light-touch interaction: tap or
            long-press the message to reveal a picker, small counts only
            for reactions that are actually there. A photo or video instead
            gets the reaction row below it immediately (FIX 4) — reacting
            to it shouldn't cost an extra tap — and tapping the media
            itself opens it full screen (FIX 5) instead of toggling a
            picker, so the two affordances don't fight over the same tap. */}
        {hasMedia ? (
          <>
            {!!message.text && <Text style={styles.messageText}>{message.text}</Text>}
            <Pressable onPress={() => onOpenViewer(message)} testID={`group-chat-message-media-${message.id}`}>
              {message.mediaType === 'video' ? (
                <View style={styles.messageVideo}>
                  <Ionicons name="play-circle" size={40} color={colors.white} />
                </View>
              ) : (
                <Image source={{ uri: message.mediaUrl! }} style={styles.messagePhoto} />
              )}
            </Pressable>
            <MediaReactionRow message={message} onReact={onReact} />
          </>
        ) : (
          <>
            <Pressable
              onPress={() => onTogglePicker(message.id)}
              onLongPress={() => onTogglePicker(message.id)}
              testID={`group-chat-message-body-${message.id}`}
            >
              {!!message.text && <Text style={styles.messageText}>{message.text}</Text>}
            </Pressable>
            <ActiveReactionRow message={message} onReact={onReact} />
            {pickerOpen && (
              <View style={styles.reactionPicker} testID={`group-chat-reaction-picker-${message.id}`}>
                {REACTION_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.reactionPickerOption}
                    onPress={() => onReact(message, emoji)}
                    hitSlop={6}
                    testID={`group-chat-reaction-picker-${message.id}-${emoji}`}
                  >
                    <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
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
  typingNames,
  onSend,
  onTyping,
  onStoppedTyping,
}: {
  muted: boolean;
  typingNames: string[];
  onSend: (text: string, media: MediaAttachment | null) => Promise<boolean>;
  onTyping: () => void;
  onStoppedTyping: () => void;
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

  const handleChangeText = (value: string) => {
    setText(value);
    if (value.trim().length > 0) onTyping();
    else onStoppedTyping();
  };

  const handleSend = async () => {
    if (!canSend) return;
    onStoppedTyping();
    setSending(true);
    const ok = await onSend(text, media);
    setSending(false);
    if (ok) {
      setText('');
      setMedia(null);
    } else {
      showAlert("Couldn't Send", "That message didn't go through. Check your connection and try again.");
    }
  };

  const typing = typingLabel(typingNames);

  return (
    <View style={styles.composerWrap}>
      {typing && (
        <Text style={styles.typingText} testID="group-chat-typing-indicator">
          {typing}
        </Text>
      )}
      {media && (
        <View style={styles.composerMediaPreview} testID="group-chat-photo-preview">
          {media.type === 'video' ? (
            <View style={[styles.composerMediaImage, styles.composerMediaVideo]}>
              <Ionicons name="videocam" size={16} color={colors.white} />
            </View>
          ) : (
            <Image source={{ uri: media.uri }} style={styles.composerMediaImage} />
          )}
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
            onChangeText={handleChangeText}
            placeholder="Say something"
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            // Plain conversational text, not a credentials/contact/payment
            // field — these three together are what actually suppress
            // iOS's AutoFill accessory bar (key/card/location icons) over
            // the keyboard; same pattern already used for the Community
            // composer's title/body fields (see CreatePostModal.tsx).
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            inputMode="text"
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
// the whole paid membership, backed by migration_012.sql + migration_013.sql
// (group_chat_messages / group_chat_cheers / group_chat_settings) with
// Supabase Realtime for new messages, reactions, soft deletes, and the
// member's own mute flag. Reactions use the same 4-emoji set as the
// Community feed (shaka, fire, flex, heart) — tap or long-press a message to
// open the picker, tap an existing pill to toggle your own reaction off.
// Typing indicators ride the same presence channel as "X IN THE CHAT" — no
// database writes. Access (open and post vs. the locked view) reads
// MembershipContext's already-hardened `fullContentAccess` — settled state
// only, never a loading/refetching default (see PRs 106-109) — never just
// hidden in the UI; the same rule is enforced again, independently, by RLS
// in the database.
export function DocsGroupChatScreen({ visible, onClose }: Props) {
  const { fullContentAccess } = useMembership();
  const canModerate = useCanModerate();
  const myName = useDisplayName();
  const { photoUri } = useProfile();
  const chat = useGroupChat(visible && fullContentAccess);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [viewerMedia, setViewerMedia] = useState<MediaAttachment | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const prevContentHeight = useRef(0);
  const isLoadingOlderRef = useRef(false);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

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
                pickerOpen={pickerMessageId === item.message.id}
                onDelete={chat.deleteMessage}
                onTogglePicker={(id) => setPickerMessageId((prev) => (prev === id ? null : id))}
                onReact={(message, emoji) => {
                  chat.toggleReaction(message, emoji);
                  setPickerMessageId(null);
                }}
                onOpenViewer={(message) =>
                  message.mediaUrl && setViewerMedia({ uri: message.mediaUrl, type: message.mediaType ?? 'image' })
                }
              />
            )
          )}
        </ScrollView>
      )}

      {/* The keyboard already occupies the safe-area inset while it's up —
          adding insets.bottom on top of it left a gap at the very bottom
          of the composer where the screen's own background (not actually
          "Community" — there's nothing behind this full-bleed overlay —
          but still an odd bare strip) showed through. Same fix DocThreadView
          already uses for the MESSAGE DOC DIRECTLY composer. */}
      <View style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
        <Composer
          muted={chat.muted}
          typingNames={chat.typingNames}
          onSend={chat.sendMessage}
          onTyping={chat.notifyTyping}
          onStoppedTyping={chat.notifyStopped}
        />
      </View>

      <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} filenameHint="docs-fitness-group-chat" />
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
    // A bit more than the old 12 — clean separation between the last
    // message and the composer, so the composer reads as its own distinct
    // area (the iMessage reference) instead of crowding the conversation.
    paddingBottom: 20,
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
  messageVideo: {
    width: 180,
    aspectRatio: 1,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  reactionPillActive: {
    backgroundColor: colors.greenDeep,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCountText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
  },
  reactionCountTextActive: {
    color: colors.gold,
  },
  reactionPicker: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reactionPickerOption: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPickerEmoji: {
    fontSize: 20,
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
  // The iMessage reference: a clearly separate, roomier band under the
  // conversation, not a composer bunched up against the keyboard/AutoFill
  // bar — paddingTop/paddingVertical bumped up from the original 10/9.
  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  typingText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  composerMediaPreview: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  composerMediaImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  composerMediaVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenDeep,
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
    gap: 10,
    paddingBottom: 14,
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
