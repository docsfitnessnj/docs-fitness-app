import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { Avatar } from '../components/Avatar';
import { MediaAttachmentPicker } from '../components/MediaAttachmentPicker';
import { PostAuthorBadges } from '../components/PostAuthorBadges';
import { PostDetailModal } from '../components/PostDetailModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { StoryRow } from '../components/StoryRow';
import { DateStrip } from '../components/DateStrip';
import { DayPanel } from '../components/DayPanel';
import { Post, REACTION_EMOJIS, useCommunity } from '../context/CommunityContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { useStories } from '../context/StoriesContext';
import { useTour } from '../context/TourContext';
import { getUpcomingDays, isDayWodUnlocked } from '../data/content';
import { showAlert } from '../lib/alert';
import { MediaAttachment } from '../lib/media';
import { colors, fonts } from '../theme';

const BOOKING_DAYS_AHEAD = 21;
// ~4 lines at the body input's 22px line height — a modest starting box,
// not a giant blank rectangle, that then grows with what's typed.
const MIN_BODY_HEIGHT = 88;

function ComposerBar({ onOpen }: { onOpen: () => void }) {
  const displayName = useDisplayName();
  const { photoUri } = useProfile();
  const { registerTarget } = useTour();
  return (
    <Pressable ref={registerTarget('composer-bar')} style={styles.composerBar} onPress={onOpen}>
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
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [bodyHeight, setBodyHeight] = useState(MIN_BODY_HEIGHT);

  React.useEffect(() => {
    if (visible) {
      setTitle(editingPost?.title ?? '');
      setBody(editingPost?.text ?? '');
      setMedia(editingPost?.media ?? null);
      setBodyHeight(MIN_BODY_HEIGHT);
    }
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
          />
          <TextInput
            style={[styles.composeBodyInput, { height: Math.max(MIN_BODY_HEIGHT, bodyHeight) }]}
            value={body}
            onChangeText={setBody}
            placeholder="LOG IT. POST IT."
            placeholderTextColor={colors.textMuted}
            multiline
            onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
          />

          <View style={styles.composeMediaWrap}>
            <MediaAttachmentPicker media={media} onChange={setMedia} />
          </View>
        </ScrollView>
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
  onOpenDetail,
}: {
  post: Post;
  canInteract: boolean;
  onEdit: (post: Post) => void;
  onOpenDetail: (post: Post) => void;
}) {
  const { toggleLike, addReaction, togglePin, deletePost, markRead } = useCommunity();
  const { isAdmin } = useMembership();
  const displayName = useDisplayName();
  const { photoUri } = useProfile();

  const isOwn = post.author === displayName;

  const guestNudge = () => showAlert('Join to Participate', 'Sign up to like, comment, and post in the community.');

  const openDetail = () => {
    markRead(post.id);
    onOpenDetail(post);
  };

  const confirmDelete = () => {
    showAlert('Delete This Post?', "This can't be undone.", [
      { text: 'Keep Post', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) },
    ]);
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
        { text: 'Delete', style: 'destructive' as const, onPress: confirmDelete },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    } else if (isOwn) {
      showAlert(post.title || post.author, undefined, [
        ...(post.kind === 'text' ? [{ text: 'Edit', onPress: () => onEdit(post) }] : []),
        { text: 'Delete', style: 'destructive' as const, onPress: confirmDelete },
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
    <Pressable
      style={[styles.post, post.pinned && styles.postPinned]}
      onPress={openDetail}
      testID={`post-card-${post.id}`}
    >
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
        {(isAdmin || isOwn) && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              openMenu();
            }}
            hitSlop={8}
            testID={`post-menu-${post.id}`}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {post.kind === 'wod' && post.meta ? (
        <View style={styles.wodBlock}>
          <Text style={styles.wodBadge}>WORKOUT COMPLETE</Text>
          <View style={styles.titleRow}>
            {post.unread && <View style={styles.unreadDot} />}
            <Text style={styles.wodTitle}>{post.title}</Text>
          </View>
          {!!post.meta.notes && (
            <Text style={styles.wodNotes} numberOfLines={3}>
              {post.meta.notes}
            </Text>
          )}
          {!!post.meta.resultsLine && <Text style={styles.wodResults}>{post.meta.resultsLine}</Text>}
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
            {post.media && (
              <View style={styles.thumbnail}>
                {post.media.type === 'image' ? (
                  <Image source={{ uri: post.media.uri }} style={styles.thumbnailImage} />
                ) : (
                  <Ionicons name="videocam-outline" size={22} color={colors.textMuted} />
                )}
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
            onPress={(e) => {
              e.stopPropagation();
              canInteract ? addReaction(post.id, emoji) : guestNudge();
            }}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            {post.reactions[emoji] > 0 && <Text style={styles.reactionCount}>{post.reactions[emoji]}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={styles.postFooter}>
        <View style={styles.postFooterLeft}>
          <Pressable
            style={styles.footerButton}
            onPress={(e) => {
              e.stopPropagation();
              canInteract ? toggleLike(post.id) : guestNudge();
            }}
          >
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={18}
              color={post.liked ? colors.green : colors.textMuted}
            />
            <Text style={styles.footerButtonText}>{post.likes}</Text>
          </Pressable>
          <Pressable
            style={styles.footerButton}
            onPress={(e) => {
              e.stopPropagation();
              openDetail();
            }}
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
  onOpenDetail,
  communityAccess,
}: {
  onOpenComposer: () => void;
  onEditPost: (post: Post) => void;
  onOpenDetail: (post: Post) => void;
  communityAccess: 'full' | 'read_only';
}) {
  const { posts } = useCommunity();
  const canInteract = communityAccess === 'full';
  return (
    <View>
      {canInteract ? <ComposerBar onOpen={onOpenComposer} /> : <GuestBanner />}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} canInteract={canInteract} onEdit={onEditPost} onOpenDetail={onOpenDetail} />
      ))}
    </View>
  );
}

export default function CommunityScreen() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  // Store just the id and re-derive the post from live context state each
  // render — holding the Post object itself would freeze the detail view on
  // a stale snapshot the moment a comment/like/reaction updates it in context.
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const { posts } = useCommunity();
  const detailPost = detailPostId ? posts.find((p) => p.id === detailPostId) ?? null : null;
  const { wodAccessLevel, communityAccess } = useMembership();
  const { activeStories } = useStories();
  const tour = useTour();

  // First-open spotlight tour: fires once per install, guarded by the
  // persisted completed flag inside TourContext — this effect just needs to
  // ask exactly once per mount, not once per render.
  const tourStarted = useRef(false);
  useEffect(() => {
    if (!tourStarted.current) {
      tourStarted.current = true;
      tour.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <CommunityFeed
            onOpenComposer={openComposer}
            onEditPost={openEditor}
            onOpenDetail={(post) => setDetailPostId(post.id)}
            communityAccess={communityAccess}
          />
          <CreatePostModal
            visible={composerOpen}
            onClose={() => {
              setComposerOpen(false);
              setEditingPost(null);
            }}
            editingPost={editingPost}
          />
          <PostDetailModal
            post={detailPost}
            onClose={() => setDetailPostId(null)}
            canInteract={communityAccess === 'full'}
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
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
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
  wodNotes: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 6,
  },
  wodResults: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
});
