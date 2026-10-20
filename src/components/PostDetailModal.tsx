import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { GifPicker } from './GifPicker';
import { MediaViewer } from './MediaViewer';
import { ModalHeader } from './ModalHeader';
import { PostAuthorBadges } from './PostAuthorBadges';
import { SafeAreaTopFill } from './SafeAreaTopFill';
import { Comment, Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useCanModerate, useDisplayName, useProfile } from '../context/ProfileContext';
import { showAlert } from '../lib/alert';
import { useFocusRing } from '../lib/useFocusRing';
import { colors, fonts } from '../theme';

type Props = {
  post: Post | null;
  onClose: () => void;
  canInteract: boolean;
};

// One line at rest, grows with content up to ~5 lines then scrolls
// internally — same measured-content-box pattern as DocsGroupChatScreen's
// Composer and DocThreadView's MESSAGE DOC DIRECTLY composer.
const MIN_COMMENT_HEIGHT = 21;
const MAX_COMMENT_HEIGHT = 105; // 5 lines at 21px

function CategoryTag({ category }: { category: string }) {
  return (
    <View style={styles.categoryTag}>
      <Text style={styles.categoryTagText}>{category.toUpperCase()}</Text>
    </View>
  );
}

// The full-post view: complete (untruncated) text, full-size media, reactions,
// and the comment thread — this is where comments are actually read and
// written, reached by tapping anywhere on a PostCard in the feed.
export function PostDetailModal({ post, onClose, canInteract }: Props) {
  const { addReaction, addComment, updateComment, deleteComment, addCommentReaction } = useCommunity();
  const isAdmin = useCanModerate();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [commentText, setCommentText] = useState('');
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [commentContentHeight, setCommentContentHeight] = useState(MIN_COMMENT_HEIGHT);
  const [commentGifUrl, setCommentGifUrl] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const commentFocusRing = useFocusRing();

  if (!post) return null;

  const interactionBlockedNudge = () => showAlert('Join to Participate', 'Sign up to like, comment, and post in the community.');

  const cancelEdit = () => {
    setEditingComment(null);
    setCommentText('');
    setCommentContentHeight(MIN_COMMENT_HEIGHT);
  };

  const submitComment = () => {
    if (!canInteract) return interactionBlockedNudge();
    if (!commentText.trim() && !commentGifUrl) return;
    if (editingComment) {
      updateComment(post.id, editingComment.id, commentText.trim());
      cancelEdit();
      return;
    }
    addComment(post.id, displayName, commentText.trim(), commentGifUrl ?? undefined);
    setCommentText('');
    setCommentGifUrl(null);
    setCommentContentHeight(MIN_COMMENT_HEIGHT);
  };

  const openCommentMenu = (comment: Comment) => {
    showAlert(comment.author, undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setEditingComment(comment);
          setCommentText(comment.text);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          showAlert('Delete This Comment?', "This can't be undone.", [
            { text: 'Keep Comment', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteComment(post.id, comment.id) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <AppModal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaTopFill backgroundColor={colors.background} />
        <ModalHeader title="POST" onBack={onClose} backTestID="close-post-detail" />

        <ScrollView contentContainerStyle={styles.body}>
          {post.pinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={11} color={colors.greenDeep} />
              <Text style={styles.pinnedBadgeText}>PINNED</Text>
            </View>
          )}

          <View style={styles.postHeader}>
            <Avatar name={post.author} uri={post.author === displayName ? photoUri : undefined} />
            <View style={{ flex: 1 }}>
              <View style={styles.postNameRow}>
                <Text style={styles.postName}>{post.author}</Text>
                <PostAuthorBadges author={post.author} />
              </View>
              <View style={styles.postMetaRow}>
                <Text style={styles.postTime}>{post.timeLabel}</Text>
                <Text style={styles.postMetaDot}>·</Text>
                <CategoryTag category={post.category} />
              </View>
            </View>
          </View>

          {post.kind === 'wod' && post.meta ? (
            <View style={styles.wodBlock}>
              <Text style={styles.wodBadge}>WORKOUT COMPLETE</Text>
              <Text style={styles.wodTitle}>{post.title}</Text>
              {!!post.meta.notes && <Text style={styles.wodNotes}>{post.meta.notes}</Text>}
              {!!post.meta.resultsLine && <Text style={styles.wodResults}>{post.meta.resultsLine}</Text>}
            </View>
          ) : (
            <>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postText}>{post.text}</Text>
            </>
          )}

          {post.media && (
            <AppPressable onPress={() => setViewerOpen(true)} testID="post-detail-media">
              {post.media.type === 'image' ? (
                <Image source={{ uri: post.media.uri }} style={styles.media} resizeMode="cover" />
              ) : (
                <View style={styles.mediaVideo}>
                  <Ionicons name="play-circle" size={48} color={colors.white} />
                  <Text style={styles.mediaVideoText}>VIDEO ATTACHED</Text>
                </View>
              )}
            </AppPressable>
          )}

          <View style={styles.reactionRow}>
            {REACTION_EMOJIS.map((emoji) => {
              const mine = post.myReactions.includes(emoji);
              return (
                <AppPressable
                  key={emoji}
                  style={[styles.reactionPill, mine && styles.reactionPillActive]}
                  onPress={() => (canInteract ? addReaction(post.id, emoji) : interactionBlockedNudge())}
                  testID={`post-detail-reaction-${emoji}`}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {post.reactions[emoji] > 0 && (
                    <Text style={[styles.reactionCount, mine && styles.reactionCountActive]}>{post.reactions[emoji]}</Text>
                  )}
                </AppPressable>
              );
            })}
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.footerButtonText}>
              {post.comments.length} comment{post.comments.length === 1 ? '' : 's'}
            </Text>
          </View>

          <View style={styles.commentsBlock}>
            {post.comments.map((comment) => {
              const ownComment = comment.author === displayName;
              return (
                <View key={comment.id} style={styles.commentRow}>
                  <Avatar name={comment.author} uri={ownComment ? photoUri : undefined} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentHeaderRow}>
                      <View style={styles.commentAuthorRow}>
                        <Text style={styles.commentAuthor}>{comment.author}</Text>
                        <PostAuthorBadges author={comment.author} />
                      </View>
                      {(isAdmin || ownComment) && (
                        <AppPressable
                          onPress={() => openCommentMenu(comment)}
                          hitSlop={8}
                          testID={`comment-menu-${comment.id}`}
                        >
                          <Ionicons name="ellipsis-horizontal" size={14} color={colors.textMuted} />
                        </AppPressable>
                      )}
                    </View>
                    {!!comment.text && <Text style={styles.commentText}>{comment.text}</Text>}
                    {!!comment.mediaUrl && (
                      <Image
                        source={{ uri: comment.mediaUrl }}
                        style={styles.commentGifImage}
                        resizeMode="cover"
                        testID={`comment-gif-${comment.id}`}
                      />
                    )}
                    <View style={styles.commentReactionRow}>
                      {REACTION_EMOJIS.map((emoji) => {
                        const mine = comment.myReactions.includes(emoji);
                        return (
                          <AppPressable
                            key={emoji}
                            style={[styles.commentReactionPill, mine && styles.commentReactionPillActive]}
                            onPress={() => (canInteract ? addCommentReaction(post.id, comment.id, emoji) : interactionBlockedNudge())}
                            hitSlop={4}
                            testID={`comment-reaction-${comment.id}-${emoji}`}
                          >
                            <Text style={styles.commentReactionEmoji}>{emoji}</Text>
                            {comment.reactions[emoji] > 0 && (
                              <Text style={[styles.commentReactionCount, mine && styles.commentReactionCountActive]}>
                                {comment.reactions[emoji]}
                              </Text>
                            )}
                          </AppPressable>
                        );
                      })}
                    </View>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentMeta}>{comment.timeLabel}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {post.comments.length === 0 && <Text style={styles.noComments}>No comments yet — be the first.</Text>}
          </View>
        </ScrollView>

        {editingComment && (
          <View style={styles.editingBar}>
            <Text style={styles.editingBarText}>Editing comment</Text>
            <AppPressable onPress={cancelEdit} hitSlop={8} testID="cancel-edit-comment">
              <Text style={styles.editingBarCancel}>CANCEL</Text>
            </AppPressable>
          </View>
        )}
        {commentGifUrl && (
          <View style={styles.commentGifPreview} testID="post-detail-gif-preview">
            <Image source={{ uri: commentGifUrl }} style={styles.commentGifPreviewImage} />
            <AppPressable
              style={styles.commentGifPreviewRemove}
              onPress={() => setCommentGifUrl(null)}
              testID="post-detail-remove-gif"
            >
              <Ionicons name="close" size={12} color={colors.white} />
            </AppPressable>
          </View>
        )}
        {gifPickerOpen && (
          <View style={styles.gifPickerWrap}>
            <GifPicker
              onClose={() => setGifPickerOpen(false)}
              onSelect={(gif) => {
                setCommentGifUrl(gif.sendUrl);
                setGifPickerOpen(false);
              }}
            />
          </View>
        )}
        <View style={styles.commentInputRow}>
          <AppPressable
            onPress={() => (canInteract ? setGifPickerOpen((v) => !v) : interactionBlockedNudge())}
            hitSlop={8}
            style={styles.commentGifButton}
            testID="post-detail-attach-gif"
          >
            <Text style={styles.gifButtonText}>GIF</Text>
          </AppPressable>
          <View style={[styles.commentInputPill, { borderColor: commentFocusRing.borderColor }]}>
            <TextInput
              style={[
                styles.commentInput,
                { height: Math.min(MAX_COMMENT_HEIGHT, Math.max(MIN_COMMENT_HEIGHT, commentContentHeight)) },
              ]}
              value={commentText}
              onChangeText={setCommentText}
              onContentSizeChange={(e) => setCommentContentHeight(e.nativeEvent.contentSize.height)}
              placeholder={canInteract ? 'Write a comment...' : 'Sign up to comment'}
              placeholderTextColor={colors.textMuted}
              multiline
              {...({ rows: 1 } as { rows?: number })}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              onSubmitEditing={submitComment}
              onFocus={() => {
                commentFocusRing.onFocus();
                if (!canInteract) interactionBlockedNudge();
              }}
              onBlur={commentFocusRing.onBlur}
              nativeID="post-detail-comment-input-field"
              aria-label="Write a comment"
              testID="post-detail-comment-input"
            />
          </View>
          <AppPressable onPress={submitComment} hitSlop={8} style={styles.commentSendButton} testID="post-detail-send-comment">
            <Ionicons name={editingComment ? 'checkmark' : 'send'} size={18} color={colors.green} />
          </AppPressable>
        </View>
      </View>

      <MediaViewer
        media={viewerOpen ? post.media ?? null : null}
        onClose={() => setViewerOpen(false)}
        filenameHint="docs-fitness-post"
      />
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
    paddingBottom: 24,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  pinnedBadgeText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
    marginLeft: 4,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  postName: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  postNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  postTime: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
  },
  postMetaDot: {
    color: colors.textMuted,
    fontSize: 12,
    marginHorizontal: 5,
  },
  categoryTag: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryTagText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  postTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  postText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 23,
  },
  wodBlock: {
    backgroundColor: colors.card,
    borderLeftWidth: 3,
    borderLeftColor: colors.green,
    borderRadius: 8,
    padding: 14,
  },
  wodBadge: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  wodTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
  },
  wodDate: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 13,
    marginBottom: 6,
  },
  wodNotes: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  wodResults: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginTop: 14,
    backgroundColor: colors.card,
  },
  mediaVideo: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    marginTop: 14,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mediaVideoText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  reactionRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
  },
  reactionPillActive: {
    backgroundColor: colors.greenDeep,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    marginLeft: 4,
  },
  reactionCountActive: {
    color: colors.gold,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingVertical: 10,
    marginTop: 12,
  },
  footerButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    marginLeft: 5,
  },
  commentsBlock: {
    marginTop: 14,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthor: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  commentText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 1,
  },
  commentGifImage: {
    width: 160,
    aspectRatio: 1,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: colors.background,
  },
  // Same five-emoji reaction row as the post's own (reactionRow/reactionPill
  // above), scaled down to match the comment's smaller typography —
  // replaces the old single-heart like (never more than decorative; see
  // migration_018.sql). Applies uniformly to every row in post.comments,
  // top-level and threaded replies alike (this view has never visually
  // distinguished them — both render through this same flat map).
  commentReactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  commentReactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 4,
  },
  commentReactionPillActive: {
    backgroundColor: colors.greenDeep,
  },
  commentReactionEmoji: {
    fontSize: 11,
  },
  commentReactionCount: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    marginLeft: 3,
  },
  commentReactionCountActive: {
    color: colors.gold,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  commentMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
  },
  noComments: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  editingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  editingBarText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  editingBarCancel: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  commentGifButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No Ionicon reads unambiguously as "GIF" at this size — the app's own
  // condensed caps label instead, same pattern as the group chat composer.
  gifButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  gifPickerWrap: {
    paddingHorizontal: 20,
    backgroundColor: colors.card,
  },
  commentGifPreview: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginTop: 8,
  },
  commentGifPreviewImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  commentGifPreviewRemove: {
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
  // One rounded container only, modeled on the Skool composer — no nested
  // visible box inside it. The TextInput's own height is computed exactly
  // from its content (see commentContentHeight above), so this pill always
  // wraps tightly around it via its own padding.
  commentInputPill: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  commentInput: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 21,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
