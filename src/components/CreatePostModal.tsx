import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import { Post, useCommunity } from '../context/CommunityContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { MediaAttachment } from '../lib/media';
import { colors, fonts } from '../theme';

// ~4 lines at the body input's 22px line height — a modest starting box,
// not a giant blank rectangle, that then grows with what's typed.
const MIN_BODY_HEIGHT = 88;

type Props = {
  visible: boolean;
  onClose: () => void;
  editingPost: Post | null;
};

// Shared "new post" / "edit post" composer for the Community tab's
// LOG IT. POST IT. bar — a title + body box that writes through to the
// community_posts table via addTextPost/updateTextPost.
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

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (editingPost) {
      updateTextPost(editingPost.id, title, body.trim(), media);
    } else {
      addTextPost(displayName, title, body.trim(), undefined, media);
    }
    reset();
    onClose();
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.composeContainer}>
        <View style={styles.composeHeader}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Text style={styles.composeCancel}>CANCEL</Text>
          </Pressable>
          <Text style={styles.composeHeaderTitle}>{editingPost ? 'EDIT POST' : 'NEW POST'}</Text>
          <Pressable onPress={handleSubmit} hitSlop={8} disabled={!canSubmit}>
            <Text style={[styles.composePost, !canSubmit && styles.composePostDisabled]}>
              {editingPost ? 'SAVE' : 'POST'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.composeScroll}
          contentContainerStyle={styles.composeScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.composeAuthorRow}>
            <Avatar name={displayName} uri={photoUri} />
            <Text style={styles.composeAuthorName}>{displayName}</Text>
          </View>

          <TextInput
            style={styles.composeTitleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            nativeID="compose-post-title-input"
            aria-label="Post title"
          />
          <TextInput
            style={[styles.composeBodyInput, { height: Math.max(MIN_BODY_HEIGHT, bodyHeight) }]}
            value={body}
            onChangeText={setBody}
            placeholder="LOG IT. POST IT."
            placeholderTextColor={colors.textMuted}
            multiline
            onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            nativeID="compose-post-body-input"
            aria-label="Post body"
          />

          <View style={styles.composeMediaWrap}>
            <MediaAttachmentPicker media={media} onChange={setMedia} />
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  composeContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  composeScroll: {
    flex: 1,
  },
  composeScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  composeHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
  },
  composeCancel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  composePost: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  composePostDisabled: {
    color: colors.textMuted,
  },
  composeAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  composeAuthorName: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  composeTitleInput: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingBottom: 12,
    marginBottom: 16,
  },
  composeBodyInput: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  composeMediaWrap: {
    marginTop: 12,
    marginBottom: 12,
  },
});
