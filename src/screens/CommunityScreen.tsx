import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { Avatar } from '../components/Avatar';
import { ScreenContainer } from '../components/ScreenContainer';
import { StoryRow } from '../components/StoryRow';
import { DateStrip } from '../components/DateStrip';
import { DayPanel } from '../components/DayPanel';
import { Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { useStories } from '../context/StoriesContext';
import { getUpcomingDays, isDayWodUnlocked } from '../data/content';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

const BOOKING_DAYS_AHEAD = 21;

function ComposerBar({ onOpen }: { onOpen: () => void }) {
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  return (
    <Pressable style={styles.composerBar} onPress={onOpen}>
      <Avatar name={displayName} uri={photoUri} />
      <View style={styles.composerField}>
        <Text style={styles.composerPlaceholder}>LOG IT. POST IT.</Text>
        <Ionicons name="add-circle" size={22} color={colors.gold} />
      </View>
    </Pressable>
  );
}

function CreatePostModal({
  visible,
  onClose,
  editingPost,
}: {
  visible: boolean;
  onClose: () => void;
  editingPost: Post | null;
}) {
  const { addTextPost, updateTextPost } = useCommunity();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  React.useEffect(() => {
    if (visible) {
      setTitle(editingPost?.title ?? '');
      setBody(editingPost?.text ?? '');
    }
  }, [visible, editingPost]);

  const reset = () => {
    setTitle('');
    setBody('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!body.trim()) return;
    if (editingPost) {
      updateTextPost(editingPost.id, title, body.trim());
    } else {
      addTextPost(displayName, title, body.trim());
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
          <Pressable onPress={handleSubmit} hitSlop={8} disabled={!body.trim()}>
            <Text style={[styles.composePost, !body.trim() && styles.composePostDisabled]}>
              {editingPost ? 'SAVE' : 'POST'}
            </Text>
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

function PostCard({
  post,
  canInteract,
  onEdit,
}: {
  post: Post;
  canInteract: boolean;
  onEdit: (post: Post) => void;
}) {
  const { toggleLike, addReaction, addComment, togglePin, markRead } = useCommunity();
  const { isAdmin } = useMembership();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const isOwn = post.author === displayName;

  const guestNudge = () => showAlert('Join to Participate', 'Sign up to like, comment, and post in the community.');

  const submitComment = () => {
    if (!canInteract) return guestNudge();
    if (!commentText.trim()) return;
    addComment(post.id, displayName, commentText.trim());
    setCommentText('');
  };

  const openMenu = () => {
    if (isAdmin) {
      showAlert(post.title || post.author, undefined, [
        {
          text: post.pinned ? 'Unpin' : 'Pin',
          onPress: () => {
            const ok = togglePin(post.id);
            if (!ok) showAlert('Pin Limit Reached', 'Unpin another post before pinning a new one (max 3).');
          },
        },
        ...(post.kind === 'text' ? [{ text: 'Edit', onPress: () => onEdit(post) }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    } else if (isOwn) {
      showAlert(post.title || post.author, undefined, [
        ...(post.kind === 'text' ? [{ text: 'Edit', onPress: () => onEdit(post) }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const lastComment = post.comments[post.comments.length - 1];
  const footerRightText = lastComment
    ? `${post.unread ? 'NEW COMMENT' : 'LAST COMMENT'} · ${lastComment.timeLabel}`
    : 'NO COMMENTS YET';
  const footerRightGold = post.unread && !!lastComment;

  return (
    <Pressable style={[styles.post, post.pinned && styles.postPinned]} onPress={() => markRead(post.id)}>
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
        {(isAdmin || isOwn) && (
          <Pressable onPress={openMenu} hitSlop={8} testID={`post-menu-${post.id}`}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        )}
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
                <Ionicons name="image-outline" size={22} color={colors.textMuted} />
              </View>
            )}
          </View>
        </View>
      )}

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

      <View style={styles.postFooter}>
        <View style={styles.postFooterLeft}>
          <Pressable style={styles.footerButton} onPress={() => (canInteract ? toggleLike(post.id) : guestNudge())}>
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={18}
              color={post.liked ? colors.green : colors.textMuted}
            />
            <Text style={styles.footerButtonText}>{post.likes}</Text>
          </Pressable>
          <Pressable
            style={styles.footerButton}
            onPress={() => (canInteract ? setCommentsOpen((v) => !v) : guestNudge())}
          >
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
            <Text style={styles.footerButtonText}>
              {post.comments.length} comment{post.comments.length === 1 ? '' : 's'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.footerRightText, footerRightGold && styles.footerRightTextGold]}>
          {footerRightText}
        </Text>
      </View>

      {commentsOpen && canInteract && (
        <View style={styles.commentsBlock}>
          {post.comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Avatar name={comment.author} uri={comment.author === displayName ? photoUri : undefined} />
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{comment.author}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
                <View style={styles.commentMetaRow}>
                  <Text style={styles.commentMeta}>{comment.timeLabel}</Text>
                  <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
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
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submitComment}
            />
            <Pressable onPress={submitComment} hitSlop={8}>
              <Ionicons name="send" size={18} color={colors.green} />
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function GuestBanner() {
  return (
    <View style={styles.guestBanner}>
      <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
      <Text style={styles.guestBannerText}>Browsing as guest — sign up to join the conversation.</Text>
    </View>
  );
}

function ClosedCommunityNotice() {
  return (
    <View style={styles.closedCard}>
      <Ionicons name="lock-closed" size={28} color={colors.textMuted} />
      <Text style={styles.closedTitle}>COMMUNITY NOT INCLUDED</Text>
      <Text style={styles.closedSubtext}>
        Drop-In classes cover booking only. Add a class package or go Unlimited for full community access.
      </Text>
      <Pressable
        style={styles.closedButton}
        onPress={() => showAlert('Unlock Everything', 'Membership purchases are coming soon.')}
      >
        <Text style={styles.closedButtonText}>SEE PLANS</Text>
      </Pressable>
    </View>
  );
}

function CommunityFeed({
  onOpenComposer,
  onEditPost,
  communityAccess,
}: {
  onOpenComposer: () => void;
  onEditPost: (post: Post) => void;
  communityAccess: 'full' | 'read_only';
}) {
  const { posts } = useCommunity();
  const canInteract = communityAccess === 'full';
  return (
    <View>
      {canInteract ? <ComposerBar onOpen={onOpenComposer} /> : <GuestBanner />}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} canInteract={canInteract} onEdit={onEditPost} />
      ))}
    </View>
  );
}

export default function CommunityScreen() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const { wodAccessLevel, communityAccess } = useMembership();
  const { activeStories } = useStories();

  const days = useMemo(() => getUpcomingDays(BOOKING_DAYS_AHEAD), []);
  const todayIndex = days.findIndex((d) => d.isToday);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(todayIndex, 0));

  const isUnlocked = (index: number) => isDayWodUnlocked(days[index], wodAccessLevel);

  const openComposer = () => {
    setEditingPost(null);
    setComposerOpen(true);
  };
  const openEditor = (post: Post) => {
    setEditingPost(post);
    setComposerOpen(true);
  };

  return (
    <ScreenContainer>
      <DateStrip
        week={days}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        isUnlocked={isUnlocked}
        isCompleted={() => false}
        scrollable
        leading={activeStories.length > 0 ? <StoryRow compact /> : undefined}
      />
      <DayPanel day={days[selectedIndex]} wodUnlocked={isUnlocked(selectedIndex)} />

      {communityAccess === 'none' ? (
        <ClosedCommunityNotice />
      ) : (
        <>
          <CommunityFeed onOpenComposer={openComposer} onEditPost={openEditor} communityAccess={communityAccess} />
          <CreatePostModal
            visible={composerOpen}
            onClose={() => {
              setComposerOpen(false);
              setEditingPost(null);
            }}
            editingPost={editingPost}
          />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  composerField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  composerPlaceholder: {
    color: colors.textMuted,
    fontFamily: fonts.headline,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  guestBannerText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  closedCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  closedTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
    marginTop: 12,
    textAlign: 'center',
  },
  closedSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  closedButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  closedButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
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
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  post: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  postPinned: {
    borderWidth: 1.5,
    borderColor: colors.gold,
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
    marginBottom: 10,
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
    backgroundColor: colors.background,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.goldBright,
    marginRight: 6,
  },
  postTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  postText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 6,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  wodBlock: {
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: colors.green,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
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
    fontSize: 24,
    letterSpacing: 0.5,
  },
  wodDate: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 13,
    marginBottom: 6,
  },
  wodResults: {
    color: colors.text,
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
    backgroundColor: colors.background,
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
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
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
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    marginLeft: 5,
  },
  footerRightText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  footerRightTextGold: {
    color: colors.gold,
  },
  commentsBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
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
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  commentInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    marginRight: 8,
  },
});
