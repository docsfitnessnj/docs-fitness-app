import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { Avatar } from '../components/Avatar';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { StoryRow } from '../components/StoryRow';
import { Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

function ComposerBar({ onOpen }: { onOpen: () => void }) {
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  return (
    <Pressable style={styles.composerBar} onPress={onOpen}>
      <Avatar name={displayName} uri={photoUri} />
      <View style={styles.composerField}>
        <Text style={styles.composerPlaceholder}>LOG IT. POST IT.</Text>
      </View>
    </Pressable>
  );
}

function CreatePostModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addTextPost } = useCommunity();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const reset = () => {
    setTitle('');
    setBody('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePost = () => {
    if (!body.trim()) return;
    addTextPost(displayName, title, body.trim());
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
          <Text style={styles.composeHeaderTitle}>NEW POST</Text>
          <Pressable onPress={handlePost} hitSlop={8} disabled={!body.trim()}>
            <Text style={[styles.composePost, !body.trim() && styles.composePostDisabled]}>POST</Text>
          </Pressable>
        </View>

        <View style={styles.composeAuthorRow}>
          <Avatar name={displayName} uri={photoUri} />
          <Text style={styles.composeAuthorName}>{displayName}</Text>
        </View>

        <TextInput
          style={styles.composeTitleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional)"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.composeBodyInput}
          value={body}
          onChangeText={setBody}
          placeholder="LOG IT. POST IT."
          placeholderTextColor={colors.textMuted}
          multiline
          autoFocus
        />
      </View>
    </AppModal>
  );
}

function CategoryTag({ category }: { category: string }) {
  return (
    <View style={styles.categoryTag}>
      <Text style={styles.categoryTagText}>{category.toUpperCase()}</Text>
    </View>
  );
}

function PostCard({ post }: { post: Post }) {
  const { toggleLike, addReaction, addComment, togglePin, markRead } = useCommunity();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const submitComment = () => {
    if (!commentText.trim()) return;
    addComment(post.id, displayName, commentText.trim());
    setCommentText('');
  };

  const handleTogglePin = () => {
    const ok = togglePin(post.id);
    if (!ok) {
      showAlert('Pin Limit Reached', 'Unpin another post before pinning a new one (max 3).');
    }
  };

  const lastComment = post.comments[post.comments.length - 1];
  const footerRightText = lastComment
    ? `${post.unread ? 'New comment' : 'Last comment'} ${lastComment.timeLabel}`
    : 'No comments yet';
  const footerRightGold = post.unread && !!lastComment;

  return (
    <Pressable style={[styles.post, post.pinned && styles.postPinned]} onPress={() => markRead(post.id)}>
      {post.pinned && (
        <View style={styles.pinnedBadge}>
          <Ionicons name="pin" size={11} color={colors.background} />
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
        <Pressable onPress={handleTogglePin} hitSlop={8} testID={`pin-toggle-${post.id}`}>
          <Ionicons
            name={post.pinned ? 'pin' : 'pin-outline'}
            size={18}
            color={post.pinned ? colors.highlight : '#B8AC9A'}
          />
        </Pressable>
      </View>

      {post.kind === 'wod' && post.meta ? (
        <View style={styles.wodBlock}>
          <Text style={styles.wodBadge}>WORKOUT COMPLETE</Text>
          <View style={styles.titleRow}>
            {post.unread && <View style={styles.unreadDot} />}
            <Text style={styles.wodTitle}>{post.meta.workoutTitle}</Text>
          </View>
          <Text style={styles.wodDate}>{post.meta.dateLabel}</Text>
          <Text style={styles.wodResults}>{post.meta.results}</Text>
        </View>
      ) : (
        <View>
          <View style={styles.titleRow}>
            {post.unread && <View style={styles.unreadDot} />}
            <Text style={styles.postTitle}>{post.title}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.postText} numberOfLines={3}>
              {post.text}
            </Text>
            {post.hasImage && (
              <View style={styles.thumbnail}>
                <Ionicons name="image-outline" size={22} color={CARD_MUTED} />
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.reactionRow}>
        {REACTION_EMOJIS.map((emoji) => (
          <Pressable key={emoji} style={styles.reactionPill} onPress={() => addReaction(post.id, emoji)}>
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            {post.reactions[emoji] > 0 && <Text style={styles.reactionCount}>{post.reactions[emoji]}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={styles.postFooter}>
        <View style={styles.postFooterLeft}>
          <Pressable style={styles.footerButton} onPress={() => toggleLike(post.id)}>
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={18}
              color={post.liked ? '#D9534F' : '#8A7F6E'}
            />
            <Text style={styles.footerButtonText}>{post.likes}</Text>
          </Pressable>
          <Pressable style={styles.footerButton} onPress={() => setCommentsOpen((v) => !v)}>
            <Ionicons name="chatbubble-outline" size={16} color="#8A7F6E" />
            <Text style={styles.footerButtonText}>
              {post.comments.length} comment{post.comments.length === 1 ? '' : 's'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.footerRightText, footerRightGold && styles.footerRightTextGold]}>
          {footerRightText}
        </Text>
      </View>

      {commentsOpen && (
        <View style={styles.commentsBlock}>
          {post.comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Avatar name={comment.author} uri={comment.author === displayName ? photoUri : undefined} />
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{comment.author}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
                <View style={styles.commentMetaRow}>
                  <Text style={styles.commentMeta}>{comment.timeLabel}</Text>
                  <Ionicons name="heart-outline" size={12} color="#8A7F6E" />
                  <Text style={styles.commentMeta}>{comment.likes}</Text>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Write a comment..."
              placeholderTextColor="#A79C89"
              onSubmitEditing={submitComment}
            />
            <Pressable onPress={submitComment} hitSlop={8}>
              <Ionicons name="send" size={18} color={colors.highlight} />
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function CommunityFeed({ onOpenComposer }: { onOpenComposer: () => void }) {
  const { posts } = useCommunity();
  return (
    <View>
      <StoryRow />
      <ComposerBar onOpen={onOpenComposer} />
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </View>
  );
}

export default function CommunityScreen() {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <ScreenContainer>
      <MembershipGate>
        <CommunityFeed onOpenComposer={() => setComposerOpen(true)} />
        <CreatePostModal visible={composerOpen} onClose={() => setComposerOpen(false)} />
      </MembershipGate>
    </ScreenContainer>
  );
}

const CARD_BG = '#FAF6EF';
const CARD_TEXT = '#1E2E33';
const CARD_MUTED = '#8A7F6E';

const styles = StyleSheet.create({
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  composerField: {
    flex: 1,
    backgroundColor: '#F0EBDF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composerPlaceholder: {
    color: CARD_MUTED,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  composeContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  composeHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
  },
  composeCancel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  composePost: {
    color: colors.highlight,
    fontFamily: fonts.bodyBold,
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
    borderBottomColor: colors.locked,
    paddingBottom: 12,
    marginBottom: 16,
  },
  composeBodyInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  post: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  postPinned: {
    borderWidth: 1.5,
    borderColor: colors.highlight,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.highlight,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  pinnedBadgeText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    marginLeft: 4,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  postName: {
    color: CARD_TEXT,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  postTime: {
    color: CARD_MUTED,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  postMetaDot: {
    color: CARD_MUTED,
    fontSize: 12,
    marginHorizontal: 5,
  },
  categoryTag: {
    backgroundColor: '#F0EBDF',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryTagText: {
    color: CARD_MUTED,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.highlight,
    marginRight: 6,
  },
  postTitle: {
    color: CARD_TEXT,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  postText: {
    flex: 1,
    color: CARD_TEXT,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 6,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#F0EBDF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  wodBlock: {
    backgroundColor: '#F0E6D2',
    borderLeftWidth: 3,
    borderLeftColor: colors.highlight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  wodBadge: {
    color: '#9A6B1E',
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  wodTitle: {
    color: CARD_TEXT,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
  },
  wodDate: {
    color: CARD_MUTED,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginBottom: 6,
  },
  wodResults: {
    color: CARD_TEXT,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  reactionRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 8,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBDF',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    color: CARD_TEXT,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    marginLeft: 4,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EDE6D6',
    paddingTop: 10,
  },
  postFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  footerButtonText: {
    color: CARD_MUTED,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    marginLeft: 5,
  },
  footerRightText: {
    color: CARD_MUTED,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  footerRightTextGold: {
    color: colors.highlight,
    fontFamily: fonts.bodySemiBold,
  },
  commentsBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDE6D6',
    paddingTop: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  commentAuthor: {
    color: CARD_TEXT,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  commentText: {
    color: CARD_TEXT,
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
    color: CARD_MUTED,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBDF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  commentInput: {
    flex: 1,
    color: CARD_TEXT,
    fontFamily: fonts.body,
    fontSize: 14,
    marginRight: 8,
  },
});
