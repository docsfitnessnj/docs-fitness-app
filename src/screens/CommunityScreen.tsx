import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useMembership } from '../context/MembershipContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function PostCard({ post }: { post: Post }) {
  const { toggleLike, addReaction, addComment, togglePin } = useCommunity();
  const { displayName } = useMembership();
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

  return (
    <View style={[styles.post, post.pinned && styles.postPinned]}>
      {post.pinned && (
        <View style={styles.pinnedBadge}>
          <Ionicons name="pin" size={11} color={colors.background} />
          <Text style={styles.pinnedBadgeText}>PINNED</Text>
        </View>
      )}

      <View style={styles.postHeader}>
        <Avatar name={post.author} />
        <View style={{ flex: 1 }}>
          <Text style={styles.postName}>{post.author}</Text>
          <Text style={styles.postTime}>{post.timeLabel}</Text>
        </View>
        <Pressable onPress={handleTogglePin} hitSlop={8}>
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
          <Text style={styles.wodTitle}>{post.meta.workoutTitle}</Text>
          <Text style={styles.wodDate}>{post.meta.dateLabel}</Text>
          <Text style={styles.wodResults}>{post.meta.results}</Text>
        </View>
      ) : (
        <Text style={styles.postText}>{post.text}</Text>
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

      {commentsOpen && (
        <View style={styles.commentsBlock}>
          {post.comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Avatar name={comment.author} />
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
    </View>
  );
}

function CommunityFeed() {
  const { posts } = useCommunity();
  return (
    <View>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </View>
  );
}

export default function CommunityScreen() {
  return (
    <ScreenContainer>
      <MembershipGate>
        <CommunityFeed />
      </MembershipGate>
    </ScreenContainer>
  );
}

const CARD_BG = '#FAF6EF';
const CARD_TEXT = '#1E2E33';
const CARD_MUTED = '#8A7F6E';

const styles = StyleSheet.create({
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
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  postName: {
    color: CARD_TEXT,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  postTime: {
    color: CARD_MUTED,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  postText: {
    color: CARD_TEXT,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 6,
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
    borderTopWidth: 1,
    borderTopColor: '#EDE6D6',
    paddingTop: 10,
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
  commentsBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDE6D6',
    paddingTop: 12,
  },
  commentRow: {
    flexDirection: 'row',
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
