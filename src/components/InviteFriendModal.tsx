import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { ModalHeader } from './ModalHeader';
import { APP_SHARE_MESSAGE, APP_SHARE_URL, copyInviteLink, shareInvite } from '../lib/links';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SHARE_IMAGE = require('../../assets/brand/share-image.jpg');
// The image's real pixel dimensions (1200x630) — same reasoning as the crew
// photo on the About page: react-native-web's Image won't reliably honor a
// CSS aspectRatio, so the height is computed from a measured width instead.
const SHARE_IMAGE_RATIO = 1200 / 630;
const SHARE_DOMAIN = APP_SHARE_URL.replace(/^https?:\/\//, '');

// What the member sees before the native share sheet opens — a preview of
// exactly what a recipient will get (the link card a chat app will render,
// plus the message text), with SHARE and a COPY LINK shortcut.
export function InviteFriendModal({ visible, onClose }: Props) {
  const [cardWidth, setCardWidth] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    shareInvite();
  };

  const handleCopy = async () => {
    const ok = await copyInviteLink();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ModalHeader title="INVITE A FRIEND" onBack={onClose} backTestID="close-invite-friend" />

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>WHAT THEY'LL SEE</Text>
          <View style={styles.previewCard} testID="invite-link-preview">
            <View onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
              {cardWidth > 0 && (
                <Image
                  source={SHARE_IMAGE}
                  style={{ width: cardWidth, height: cardWidth / SHARE_IMAGE_RATIO }}
                  resizeMode="cover"
                />
              )}
            </View>
            <View style={styles.previewBody}>
              <Text style={styles.previewTitle}>Doc's Fitness</Text>
              <Text style={styles.previewDescription} numberOfLines={2}>
                Train online or in person at Doc's Fitness. Kettlebell workouts, a weekly challenge, and class
                booking, all in one app.
              </Text>
              <Text style={styles.previewDomain}>{SHARE_DOMAIN}</Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, styles.messageLabel]}>MESSAGE</Text>
          <View style={styles.messageBubble}>
            <Text style={styles.messageText}>{APP_SHARE_MESSAGE}</Text>
          </View>

          <Pressable style={styles.shareButton} onPress={handleShare} testID="invite-share-button">
            <Ionicons name="share-social-outline" size={18} color={colors.white} />
            <Text style={styles.shareButtonText}>SHARE</Text>
          </Pressable>

          <Pressable style={styles.copyButton} onPress={handleCopy} testID="invite-copy-link">
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.green} />
            <Text style={styles.copyButtonText}>{copied ? 'LINK COPIED' : 'COPY LINK'}</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
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
    paddingBottom: 32,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  messageLabel: {
    marginTop: 20,
  },
  previewCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  previewBody: {
    padding: 14,
  },
  previewTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    marginBottom: 3,
  },
  previewDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  previewDomain: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  messageBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
  },
  messageText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 24,
  },
  shareButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1.5,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  copyButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
