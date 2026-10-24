import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import { Post, useCommunity } from '../context/CommunityContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { MediaAttachment } from '../lib/media';
import { useActionCompletion } from '../lib/useActionCompletion';
import { colors, fonts } from '../theme';

// ~4 lines at the body input's 22px line height — a modest starting box,
// not a giant blank rectangle, that then grows with what's typed.
const MIN_BODY_HEIGHT = 88;

// react-native-web supports the CSS `outline` properties on TextInput to
// kill the browser's default blue focus ring, but RN's own TextStyle type
// doesn't declare them — cast once here rather than fight the excess-
// property check on every StyleSheet.create object that needs it.
const NO_OUTLINE = { outlineStyle: 'none' } as object;
// Same cast trick for the text cursor — react-native-web passes CSS
// `caretColor` straight through, but it isn't part of RN's TextStyle type.
// Without this the cursor renders in the browser's default system blue,
// clashing with the green focus treatment used everywhere else.
const CURSOR_GREEN = { caretColor: colors.green } as object;

type Props = {
  visible: boolean;
  onClose: () => void;
  editingPost: Post | null;
};

// Shared "new post" / "edit post" composer for the Community tab's
// LOG IT. POST IT. bar — a title + body box that writes through to the
// community_posts table via addTextPost/updateTextPost. Laid out to match
// the Skool posting experience (X close, filled POST pill, quiet identity
// line, thin toolbar) since that's where most of the app's most engaged
// members are coming from. Title/body are each their own bounded card
// (same treatment as Log Results' fields) rather than borderless text --
// see composeTitleInput/composeBodyInput below.
export function CreatePostModal({ visible, onClose, editingPost }: Props) {
  const { addTextPost, updateTextPost } = useCommunity();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [bodyHeight, setBodyHeight] = useState(MIN_BODY_HEIGHT);

  React.useEffect(() => {
    if (visible) {
      setTitle(editingPost?.title ?? '');
      setBody(editingPost?.text ?? '');
      setMedia(editingPost?.media ?? null);
      setBodyHeight(MIN_BODY_HEIGHT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingPost]);

  const reset = () => {
    setTitle('');
    setBody('');
    setMedia(null);
    setBodyHeight(MIN_BODY_HEIGHT);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;
  const { status: submitStatus, run: runSubmit } = useActionCompletion();

  const handleSubmit = () => {
    if (!canSubmit) return;
    runSubmit(() => {
      // Awaited by useActionCompletion's own run() -- the POSTED/SAVED
      // acknowledgment (and the modal closing behind it) now genuinely
      // waits for the real upload + database write to finish, not just
      // for this function to return.
      if (editingPost) {
        return updateTextPost(editingPost.id, title, body.trim(), media);
      }
      return addTextPost(displayName, title, body.trim(), undefined, media);
    }, () => {
      reset();
      onClose();
    });
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.composeContainer} nativeID="create-post-safe-top">
        <View style={styles.composeHeader}>
          <AppPressable onPress={handleClose} hitSlop={8} testID="compose-close" aria-label="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </AppPressable>
          <AppPressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.postPill, canSubmit && styles.postPillActive]}
            pressedStyle={canSubmit ? styles.postPillPressed : undefined}
            testID="compose-submit"
          >
            {submitStatus === 'completed' ? (
              <View style={styles.postPillCompletedRow}>
                <Ionicons name="checkmark" size={13} color={colors.white} />
                <Text style={[styles.postPillText, styles.postPillTextActive]}>
                  {editingPost ? 'SAVED' : 'POSTED'}
                </Text>
              </View>
            ) : (
              <Text style={[styles.postPillText, canSubmit && styles.postPillTextActive]}>
                {editingPost ? 'SAVE' : 'POST'}
              </Text>
            )}
          </AppPressable>
        </View>

        <ScrollView
          style={styles.composeScroll}
          contentContainerStyle={styles.composeScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Defensive keyboard-inset padding, not a fix for a confirmed
              bug -- see index.html's #create-post-scroll-content rule and
              AGENTS.md's "Keyboard regression" writeup. Title/body are
              plain in-flow content here, not a bottom-pinned bar, so the
              browser's own focus-scroll-into-view already keeps the
              focused one clear of the keyboard; this is just insurance for
              a very tall body entry leaving no scroll room left over. */}
          <View nativeID="create-post-scroll-content">
          <View style={styles.composeIdentityRow}>
            <Avatar name={displayName} uri={photoUri} size={26} />
            <Text style={styles.composeIdentityLine}>
              <Text style={styles.composeAuthorName}>{displayName}</Text>
              <Text style={styles.composeIdentityMuted}> posting in </Text>
              <Text style={styles.composeIdentityBrand}>Doc's Fitness</Text>
            </Text>
          </View>

          <TextInput
            style={[styles.composeTitleInput, NO_OUTLINE, CURSOR_GREEN]}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            nativeID="compose-post-title-input"
            aria-label="Post title"
          />
          <TextInput
            style={[styles.composeBodyInput, { height: Math.max(MIN_BODY_HEIGHT, bodyHeight) }, NO_OUTLINE, CURSOR_GREEN]}
            value={body}
            onChangeText={setBody}
            placeholder="Write something"
            placeholderTextColor={colors.textMuted}
            multiline
            onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            nativeID="compose-post-body-input"
            aria-label="Post body"
          />

          <View style={styles.composeDivider} />

          <View style={styles.composeToolbar}>
            <MediaAttachmentPicker media={media} onChange={setMedia} compact />
          </View>
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  // paddingTop here is the ordinary-browser-chrome value; index.html's
  // #create-post-safe-top rule adds the real env(safe-area-inset-top) on
  // top of it in standalone mode -- a single additive source. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  composeContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 16,
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  composeScroll: {
    flex: 1,
  },
  composeScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  postPill: {
    backgroundColor: colors.hairline,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  postPillActive: {
    backgroundColor: colors.green,
  },
  postPillPressed: {
    backgroundColor: colors.greenDeep,
  },
  postPillCompletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postPillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  postPillTextActive: {
    color: colors.white,
  },
  composeIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  composeIdentityLine: {
    flexShrink: 1,
  },
  composeAuthorName: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  composeIdentityMuted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  composeIdentityBrand: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  // Bounded fields, same treatment as Log Results' own `input` style
  // (card background + hairline border) -- a real device report found the
  // borderless Skool-style title/body read as floating text on a blank
  // page, with no visible boundary telling a member they were typing into
  // a field at all.
  composeTitleInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    marginBottom: 12,
  },
  composeBodyInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  composeDivider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginTop: 16,
    marginBottom: 4,
  },
  composeToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
