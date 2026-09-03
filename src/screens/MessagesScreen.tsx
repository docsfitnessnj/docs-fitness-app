import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalHeader } from '../components/ModalHeader';
import { MediaViewer } from '../components/MediaViewer';
import { MediaAttachment } from '../lib/media';
import { useMediaPicker } from '../lib/useMediaPicker';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type VoiceNote = { uri: string; durationMs: number };

type Message = { id: string; from: 'me' | 'doc'; text: string; media?: MediaAttachment | null; voice?: VoiceNote | null };

const SEED_MESSAGES: Message[] = [
  { id: 'seed-1', from: 'doc', text: "Drop your questions here and I'll get back to you personally. Real-time replies are coming soon." },
];

// Measured directly off the (unpadded) TextInput's own content box — the
// pill around it supplies the visible padding separately, so this is just
// line-height in, line-height out with no manual padding math (mixing the
// two turned out to double-count padding on web; see the PR description).
// One line settles at 20px; the cap below (~4 lines) lets a longer message
// grow the input without ever pushing the conversation off screen.
const MIN_INPUT_HEIGHT = 20;
const MAX_INPUT_HEIGHT = 80;

// Below this, a recording is almost certainly an accidental tap-and-release
// rather than an intended voice note.
const MIN_VOICE_NOTE_MS = 300;

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function VoiceMessageBubble({ uri, durationMs, mine }: { uri: string; durationMs: number; mine: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const toggle = () => (status.playing ? player.pause() : player.play());
  const totalSeconds = status.duration > 0 ? status.duration : durationMs / 1000;
  const remaining = status.currentTime > 0 ? Math.max(totalSeconds - status.currentTime, 0) : totalSeconds;
  const progress = totalSeconds > 0 ? Math.min(status.currentTime / totalSeconds, 1) : 0;

  return (
    <Pressable style={styles.voiceRow} onPress={toggle} testID="voice-note-play">
      <View style={[styles.voicePlayButton, mine && styles.voicePlayButtonMe]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={13} color={mine ? colors.green : colors.white} />
      </View>
      <View style={[styles.voiceTrack, mine && styles.voiceTrackMe]}>
        <View style={[styles.voiceTrackFill, mine && styles.voiceTrackFillMe, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[styles.voiceDuration, mine && styles.voiceDurationMe]}>{formatClock(remaining)}</Text>
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  // Prefills the draft and surfaces a photo attachment prompt above the
  // input — used by THE JOKER's VERIFY OWNERSHIP flow, which needs Doc to
  // see a photo of the physical deck.
  initialDraft?: string;
};

export function MessagesScreen({ visible, onClose, initialDraft }: Props) {
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState('');
  const [draftHeight, setDraftHeight] = useState(MIN_INPUT_HEIGHT);
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [photoPromptVisible, setPhotoPromptVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaAttachment | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { pick } = useMediaPicker(setMedia);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  useEffect(() => {
    if (visible && initialDraft) {
      setDraft(initialDraft);
      setPhotoPromptVisible(true);
    }
  }, [visible, initialDraft]);

  // The keyboard opening doesn't change the thread's scroll content size
  // (only the visible viewport shrinks), so onContentSizeChange below —
  // which handles new messages — can't catch this case on its own.
  useEffect(() => {
    if (keyboardVisible) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [keyboardVisible]);

  const send = () => {
    if (!draft.trim() && !media) return;
    setMessages((prev) => [...prev, { id: `msg-${prev.length}`, from: 'me', text: draft.trim(), media }]);
    setDraft('');
    setDraftHeight(MIN_INPUT_HEIGHT);
    setMedia(null);
    setPhotoPromptVisible(false);
  };

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      showAlert(
        'Permission Needed',
        "Doc's Fitness uses your microphone to let you send voice notes to Doc. Turn on microphone access in Settings to continue.",
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  };

  const cancelRecording = async () => {
    await recorder.stop();
    setIsRecording(false);
  };

  const sendRecording = async () => {
    // recorder.currentTime only updates on pause/stop events, not live while
    // recording — recorderState.durationMillis (from the polling hook below)
    // is the one that's actually kept current during an active recording.
    const durationMs = recorderState.durationMillis;
    await recorder.stop();
    setIsRecording(false);
    if (!recorder.uri || durationMs < MIN_VOICE_NOTE_MS) return;
    setMessages((prev) => [...prev, { id: `msg-${prev.length}`, from: 'me', text: '', voice: { uri: recorder.uri!, durationMs } }]);
  };

  if (!visible) return null;

  const hasDraftContent = draft.trim().length > 0 || media != null;
  const inputAreaBottomPadding = 16 + (keyboardVisible ? 0 : insets.bottom);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ModalHeader title="MESSAGE DOC" onBack={onClose} backTestID="close-messages" />

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.from === 'me' ? styles.bubbleMe : styles.bubbleDoc]}
          >
            {message.media && (
              <Pressable onPress={() => setViewerMedia(message.media!)} testID={`message-media-${message.id}`}>
                {message.media.type === 'image' ? (
                  <Image source={{ uri: message.media.uri }} style={styles.bubbleImage} />
                ) : (
                  <View style={styles.bubbleVideo}>
                    <Ionicons name="play-circle" size={40} color={colors.white} />
                  </View>
                )}
              </Pressable>
            )}
            {message.voice && (
              <VoiceMessageBubble uri={message.voice.uri} durationMs={message.voice.durationMs} mine={message.from === 'me'} />
            )}
            {message.text.length > 0 && (
              <Text style={[styles.bubbleText, message.from === 'me' && styles.bubbleTextMe]}>
                {message.text}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: inputAreaBottomPadding }]}>
        {photoPromptVisible && (
          <Text style={styles.photoHint} testID="verify-photo-prompt">
            ATTACH A PHOTO OF YOUR DECK
          </Text>
        )}

        {media && (
          <View style={styles.mediaPreviewWrap} testID="message-media-preview">
            {media.type === 'image' ? (
              <Image source={{ uri: media.uri }} style={styles.mediaPreviewThumb} />
            ) : (
              <View style={[styles.mediaPreviewThumb, styles.mediaPreviewVideo]}>
                <Ionicons name="videocam" size={16} color={colors.white} />
              </View>
            )}
            <Pressable style={styles.mediaPreviewRemove} onPress={() => setMedia(null)} testID="message-media-remove">
              <Ionicons name="close" size={12} color={colors.white} />
            </Pressable>
          </View>
        )}

        {isRecording ? (
          <View style={styles.recordingRow} testID="voice-recording-row">
            <Pressable onPress={cancelRecording} hitSlop={8} style={styles.recordingCancelButton} testID="voice-cancel-button">
              <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatClock((recorderState.durationMillis ?? 0) / 1000)}</Text>
            </View>
            <Pressable onPress={sendRecording} hitSlop={8} style={styles.sendButton} testID="voice-send-button">
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <Pressable onPress={pick} hitSlop={8} style={styles.attachButton} testID="attach-media-button">
              <Ionicons name="camera-outline" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.inputPill}>
              <TextInput
                style={[styles.input, { height: Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, draftHeight)) }]}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message..."
                placeholderTextColor={colors.textMuted}
                multiline
                // `rows` isn't in TextInputProps' cross-platform typing, but
                // react-native-web supports it directly (it maps straight to
                // the underlying <textarea rows>) — without it, the browser's
                // own default of rows="2" inflates the very first
                // onContentSizeChange reading before any text is typed.
                {...({ rows: 1 } as { rows?: number })}
                onContentSizeChange={(e) => setDraftHeight(e.nativeEvent.contentSize.height)}
                nativeID="message-draft-input"
                aria-label="Message"
              />
            </View>
            {hasDraftContent ? (
              <Pressable onPress={send} hitSlop={8} style={styles.sendButton} testID="send-message-button">
                <Ionicons name="send" size={18} color={colors.white} />
              </Pressable>
            ) : (
              <Pressable onPress={startRecording} hitSlop={8} style={styles.micButton} testID="voice-note-button">
                <Ionicons name="mic-outline" size={20} color={colors.text} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} filenameHint="docs-fitness-message" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  thread: {
    flex: 1,
    paddingHorizontal: 20,
  },
  threadContent: {
    paddingBottom: 20,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  bubbleDoc: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignSelf: 'flex-start',
  },
  bubbleMe: {
    backgroundColor: colors.green,
    alignSelf: 'flex-end',
  },
  bubbleText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: colors.white,
  },
  bubbleImage: {
    // A fixed width rather than '100%' — a media-only bubble (no caption)
    // has nothing else to size itself against, so a percentage width here
    // collapses the whole bubble down to its rounded corners.
    width: 200,
    aspectRatio: 1,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.background,
  },
  bubbleVideo: {
    width: 200,
    aspectRatio: 1,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 160,
    paddingVertical: 2,
  },
  voicePlayButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayButtonMe: {
    backgroundColor: colors.white,
  },
  voiceTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(18,33,28,0.15)',
    overflow: 'hidden',
  },
  voiceTrackMe: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  voiceTrackFill: {
    height: '100%',
    backgroundColor: colors.green,
  },
  voiceTrackFillMe: {
    backgroundColor: colors.white,
  },
  voiceDuration: {
    color: colors.text,
    fontFamily: fonts.label,
    fontSize: 12,
  },
  voiceDurationMe: {
    color: colors.white,
  },
  photoHint: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  mediaPreviewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  mediaPreviewThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  mediaPreviewVideo: {
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(18,33,28,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputPill: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingCancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.scoreboardRed,
  },
  recordingTime: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
});
