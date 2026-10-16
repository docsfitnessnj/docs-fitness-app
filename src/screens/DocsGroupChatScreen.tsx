import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
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
import { useIsDesktop } from '../lib/responsive';
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

// Memoized so a Realtime event touching ONE message (a new reaction, a new
// message appended) only re-renders that message's own row, not all 50 —
// see the perf note on the FlatList itself in DocsGroupChatScreen for why
// this matters for "open, scroll, send, react, back out, all feeling
// immediate" with a media-heavy thread.
const MessageRow = React.memo(function MessageRow({
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
    <View style={[styles.messageRow, message.pending && styles.messageRowPending]} testID={`group-chat-message-${message.id}`}>
      <Avatar name={message.senderName} uri={message.senderAvatarUrl} size={32} />
      <View style={styles.messageBody}>
        <View style={styles.messageHeaderRow}>
          <Text style={styles.senderName} numberOfLines={1}>
            {message.senderName}
          </Text>
          <PostAuthorBadges author={message.senderName} />
          {message.pending ? (
            <Ionicons name="time-outline" size={12} color={colors.textMuted} testID={`group-chat-message-pending-${message.id}`} />
          ) : (
            <Text style={styles.timeText}>{timeLabel(message.createdAt)}</Text>
          )}
          {canShowMenu && !message.pending && (
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
                // The list NEVER loads the actual video file (FIX 3) — only
                // this lightweight poster frame, captured client-side at
                // send time (see videoThumbnail.ts). The real file is only
                // fetched once the viewer taps through to MediaViewer. No
                // thumbnail (capture failed, or an older message sent
                // before this fix) falls back to the plain placeholder.
                <View style={styles.messageVideo}>
                  {message.thumbnailUrl && (
                    <Image source={{ uri: message.thumbnailUrl }} style={styles.messageVideoThumb} />
                  )}
                  <Ionicons name="play-circle" size={40} color={colors.white} style={styles.messageVideoPlayIcon} />
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
});

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
  sendError,
  isDesktop,
  onSend,
  onTyping,
  onStoppedTyping,
}: {
  muted: boolean;
  typingNames: string[];
  sendError: string | null;
  isDesktop: boolean;
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
    // Optimistic (FIX 2): clear immediately rather than waiting on the
    // send to resolve — the message already appears in the list via
    // useGroupChat's own optimistic update the instant onSend is called.
    // A failure removes it there and shows a quiet note (sendError,
    // rendered below) instead of this composer re-populating the text or
    // blocking on an alert.
    const sentText = text;
    const sentMedia = media;
    setText('');
    setMedia(null);
    setSending(true);
    await onSend(sentText, sentMedia);
    setSending(false);
  };

  // Desktop convention: Enter sends, Shift+Enter inserts a newline. Phone
  // keyboards don't have a physical Enter key in the same sense (mobile
  // messaging apps universally treat it as "new line," with a dedicated
  // send button instead) so this is desktop-only.
  const handleKeyPress = (e: { nativeEvent: { key?: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
    if (!isDesktop) return;
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const typing = typingLabel(typingNames);
  if (typing) {
    // eslint-disable-next-line no-console
    console.log('[typing] rendering typing line', { typingNames, label: typing });
  } else if (typingNames.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[typing] typingNames non-empty but typingLabel() produced nothing -- suppressed', { typingNames });
  }

  return (
    <View style={[styles.composerWrap, isDesktop && styles.composerWrapDesktop]}>
      {typing && (
        <Text style={styles.typingText} testID="group-chat-typing-indicator">
          {typing}
        </Text>
      )}
      {sendError && (
        <Text style={styles.sendErrorText} testID="group-chat-send-error">
          {sendError}
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
        <View style={[styles.composerInputPill, isDesktop && styles.composerInputPillDesktop]}>
          <TextInput
            style={[styles.composerInput, isDesktop && styles.composerInputDesktop]}
            value={text}
            onChangeText={handleChangeText}
            onKeyPress={handleKeyPress as any}
            placeholder="Say something"
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            // Plain conversational text, not a credentials/contact/payment
            // field. These attributes are what's actually supported for
            // suppressing iOS's AutoFill accessory bar (key/card/location
            // icons) from a web page — same pattern already used for the
            // Community composer's title/body fields (CreatePostModal.tsx).
            // FIX 6 (2nd attempt) note: Safari deliberately does not treat
            // `autocomplete=off` as authoritative on fields it heuristically
            // suspects could be a credential/contact field — this has been
            // true since iOS 11 as a declared anti-pattern-prevention
            // measure, not a bug in this app, and no combination of HTML
            // attributes available to a web page can override it (confirmed
            // against current Safari/WebKit release notes and WHATWG's own
            // autofill spec, which explicitly allows a UA to ignore `off`).
            // The one further lever tried here is `name` — an unexpected,
            // non-credential-shaped value, since Safari's heuristic also
            // weighs the field's name/id, not just autocomplete — everything
            // else in this list was already in place as of round 113. If the
            // bar still shows on a real device, that's this platform
            // limitation, not something left unfixed; the composer's spacing
            // (below) is what actually keeps the layout breathing around it
            // regardless of whether Safari shows it.
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            inputMode="text"
            {...({ name: 'group-chat-message-text' } as { name?: string })}
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
  const isDesktop = useIsDesktop();

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [viewerMedia, setViewerMedia] = useState<MediaAttachment | null>(null);

  const listRef = useRef<FlatList<ListItem>>(null);
  const isLoadingOlderRef = useRef(false);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  // Stable across renders where the underlying data hasn't changed, so
  // FlatList/React.memo'd rows don't all re-render just because the
  // SCREEN re-rendered for an unrelated reason (e.g. the keyboard
  // toggling) — part of the general perf pass: before this, the message
  // list was a plain ScrollView + .map(), which both re-created every
  // row's element on every render AND mounted every message (including
  // every photo/video) at once, for the life of the screen. FlatList only
  // renders what's near the viewport, which is also what makes "stop
  // loading full video files in the list" and "photos load lazily as
  // they scroll into view" (FIX 3) fall out for free rather than needing
  // a separate IntersectionObserver-style mechanism.
  const items = useMemo(() => buildListItems(chat.messages), [chat.messages]);

  if (!visible) return null;
  if (!fullContentAccess) return <LockedView onClose={onClose} />;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (e.nativeEvent.contentOffset.y < 60 && chat.hasMoreOlder && !chat.loadingOlder) {
      isLoadingOlderRef.current = true;
      chat.loadOlder();
    }
  };

  const renderItem = ({ item }: { item: ListItem }) =>
    item.kind === 'divider' ? (
      <DateDivider label={item.label} />
    ) : (
      <MessageRow
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
    );

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

      <View style={[styles.contentColumn, isDesktop && styles.contentColumnDesktop]}>
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
          <FlatList
            ref={listRef}
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.key}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            // The idiomatic FlatList way to handle "prepend older items at
            // the top without the visible content jumping" — replaces the
            // old ScrollView version's manual height-diff-and-scrollTo
            // dance (measure the delta, scrollTo by that delta) with
            // something the list itself guarantees.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              if (!isLoadingOlderRef.current) listRef.current?.scrollToEnd({ animated: false });
              isLoadingOlderRef.current = false;
            }}
            ListHeaderComponent={chat.loadingOlder ? <Text style={styles.loadingOlderText}>Loading earlier messages…</Text> : null}
            ListEmptyComponent={
              !chat.loading ? (
                <Text style={styles.emptyState} testID="group-chat-empty-state">
                  Nobody's said anything yet. Be the first.
                </Text>
              ) : null
            }
          />
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
            sendError={chat.sendError}
            isDesktop={isDesktop}
            onSend={chat.sendMessage}
            onTyping={chat.notifyTyping}
            onStoppedTyping={chat.notifyStopped}
          />
        </View>
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
  contentColumn: {
    flex: 1,
  },
  // FIX 5: on a wide desktop viewport, the chat's own full-bleed overlay
  // would otherwise stretch edge to edge — a comfortably capped, centered
  // column (wider than the phone layout's ~375px, not the whole browser
  // window) reads much closer to a real desktop messaging app.
  contentColumnDesktop: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
  // FIX 2: a sent-but-not-yet-confirmed message is visibly lighter —
  // enough to read as "still going," not so faint it looks broken.
  messageRowPending: {
    opacity: 0.55,
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
    overflow: 'hidden',
  },
  messageVideoThumb: {
    ...StyleSheet.absoluteFill,
  },
  messageVideoPlayIcon: {
    // Sits on top of the thumbnail image (or the plain green placeholder,
    // if there isn't one) — same position either way.
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
  composerWrapDesktop: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  typingText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  sendErrorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.body,
    fontSize: 12,
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
  // FIX 5: a noticeably larger, roomier composer on desktop — more
  // vertical room to actually use the multi-line input comfortably with a
  // mouse/keyboard, not just the phone-sized pill stretched wide.
  composerInputPillDesktop: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 160,
  },
  composerInput: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
  },
  composerInputDesktop: {
    fontSize: 17,
    lineHeight: 23,
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
