import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { MediaAttachmentPicker } from '../components/MediaAttachmentPicker';
import { MediaAttachment } from '../lib/media';
import { colors, fonts } from '../theme';

type Message = { id: string; from: 'me' | 'doc'; text: string; media?: MediaAttachment | null };

const SEED_MESSAGES: Message[] = [
  { id: 'seed-1', from: 'doc', text: "Drop your questions here and I'll get back to you personally. Real-time replies are coming soon." },
];

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
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [photoPromptVisible, setPhotoPromptVisible] = useState(false);
  const [voiceTooltipVisible, setVoiceTooltipVisible] = useState(false);

  useEffect(() => {
    if (visible && initialDraft) {
      setDraft(initialDraft);
      setPhotoPromptVisible(true);
    }
  }, [visible, initialDraft]);

  const send = () => {
    if (!draft.trim()) return;
    setMessages((prev) => [...prev, { id: `msg-${prev.length}`, from: 'me', text: draft.trim(), media }]);
    setDraft('');
    setMedia(null);
    setPhotoPromptVisible(false);
  };

  const showVoiceTooltip = () => {
    setVoiceTooltipVisible(true);
    setTimeout(() => setVoiceTooltipVisible(false), 2000);
  };

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ModalHeader title="MESSAGE DOC" onBack={onClose} backTestID="close-messages" />

      <ScrollView style={styles.thread} contentContainerStyle={styles.threadContent}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.from === 'me' ? styles.bubbleMe : styles.bubbleDoc]}
          >
            {message.media?.type === 'image' && (
              <Image source={{ uri: message.media.uri }} style={styles.bubbleImage} />
            )}
            <Text style={[styles.bubbleText, message.from === 'me' && styles.bubbleTextMe]}>
              {message.text}
            </Text>
          </View>
        ))}
      </ScrollView>

      {photoPromptVisible && (
        <View style={styles.photoPromptWrap} testID="verify-photo-prompt">
          <Text style={styles.photoPromptLabel}>ATTACH A PHOTO OF YOUR DECK</Text>
          <MediaAttachmentPicker media={media} onChange={setMedia} />
        </View>
      )}

      <View style={styles.inputRow}>
        <View style={styles.micWrap}>
          {voiceTooltipVisible && (
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>Voice notes coming soon</Text>
            </View>
          )}
          <Pressable onPress={showVoiceTooltip} hitSlop={8} style={styles.micButton} testID="voice-note-button">
            <Ionicons name="mic-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={send}
        />
        <Pressable onPress={send} hitSlop={8} style={styles.sendButton}>
          <Ionicons name="send" size={18} color={colors.white} />
        </Pressable>
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
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.background,
  },
  photoPromptWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  photoPromptLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    marginRight: 10,
  },
  micWrap: {
    marginRight: 10,
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
  tooltip: {
    position: 'absolute',
    bottom: 48,
    left: -30,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 150,
  },
  tooltipText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    textAlign: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
