import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { ModalHeader } from './ModalHeader';
import { Comment, Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  post: Post | null;
  onClose: () => void;
  canInteract: boolean;
};

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
  const { toggleLike, addReaction, addComment, updateComment, deleteComment } = useCommunity();
  const { isAdmin } = useMembership();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [commentText, setCommentText] = useState('');
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  if (!post) return null;

  const guestNudge = () => showAlert('Join to Participate', 'Sign up to like, comment, and post in the community.');

  const cancelEdit = () => {
    setEditingComment(null);
    setCommentText('');
  };

  const submitComment = () => {
    if (!canInteract) return guestNudge();
    if (!commentText.trim()) return;
    if (editingComment) {
      updateComment(post.id, editingComment.id, commentText.trim());
      cancelEdit();
      return;
    }
    addComment(post.id, displayName, commentText.trim());
    setCommentText('');
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
              <Text style={styles.postName}>{post.author}</Text>
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
              <Text style={styles.wodTitle}>{post.meta.workoutTitle}</Text>
              <Text style={styles.wodDate}>{post.meta.dateLabel}</Text>
              {!!post.meta.notes && <Text style={styles.wodNotes}>{post.meta.notes}</Text>}
              {!!post.meta.resultsLine && <Text style={styles.wodResults}>{post.meta.resultsLine}</Text>}
            </View>
          ) : (
            <>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postText}>{post.text}</Text>
            </>
          )}

          {post.media &&
            (post.media.type === 'image' ? (
              <Image source={{ uri: post.media.uri }} style={styles.media} resizeMode="cover" />
            ) : (
              <View style={styles.mediaVideo}>
                <Ionicons name="play-circle" size={48} color={colors.white} />
                <Text style={styles.mediaVideoText}>VIDEO ATTACHED</Text>
              </View>
            ))}

          <View style={styles.reactionRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.reactionPill}
                onPress={() => (canInteract ? addReaction(post.id, emoji) : guestNudge())}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {post.reactions[emoji] > 0 && <Text style={styles.reactionCount}>{post.reactions[emoji]}</Text>}
              </Pressable>
            ))}
          </View>

          <View style={styles.statsRow}>
            <Pressable
              style={styles.footerButton}
              onPress={() => (canInteract ? toggleLike(post.id) : guestNudge())}
              testID="post-detail-like"
            >
              <Ionicons
                name={post.liked ? 'heart' : 'heart-outline'}
                size={18}
                color={post.liked ? colors.green : colors.textMuted}
              />
              <Text style={styles.footerButtonText}>{post.likes}</Text>
            </Pressable>
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
                      <Text style={styles.commentAuthor}>{comment.author}</Text>
                      {(isAdmin || ownComment) && (
                        <Pressable
                          onPress={() => openCommentMenu(comment)}
                          hitSlop={8}
                          testID={`comment-menu-${comment.id}`}
                        >
                          <Ionicons name="ellipsis-horizontal" size={14} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentMeta}>{comment.timeLabel}</Text>
                      <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.commentMeta}>{comment.likes}</Text>
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
            <Pressable onPress={cancelEdit} hitSlop={8} testID="cancel-edit-comment">
              <Text style={styles.editingBarCancel}>CANCEL</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder={canInteract ? 'Write a comment...' : 'Sign up to comment'}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={submitComment}
            onFocus={() => !canInteract && guestNudge()}
            testID="post-detail-comment-input"
          />
          <Pressable onPress={submitComment} hitSlop={8} testID="post-detail-send-comment">
            <Ionicons name={editingComment ? 'checkmark' : 'send'} size={18} color={colors.green} />
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
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    marginLeft: 4,
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
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  commentInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    marginRight: 10,
  },
});
