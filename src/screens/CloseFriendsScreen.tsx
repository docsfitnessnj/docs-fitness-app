import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { Avatar } from '../components/Avatar';
import { useCommunity } from '../context/CommunityContext';
import { useCloseFriends } from '../context/CloseFriendsContext';
import { useDisplayName } from '../context/ProfileContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CloseFriendsScreen({ visible, onClose }: Props) {
  const { posts } = useCommunity();
  const displayName = useDisplayName();
  const { isCloseFriend, toggleCloseFriend, closeFriendNames } = useCloseFriends();
  const [tab, setTab] = useState<'members' | 'feed'>('members');

  const members = useMemo(() => {
    const names = new Set<string>();
    posts.forEach((p) => {
      if (p.author !== displayName) names.add(p.author);
    });
    return Array.from(names).sort();
  }, [posts, displayName]);

  const friendPosts = useMemo(
    () => posts.filter((p) => closeFriendNames.includes(p.author)),
    [posts, closeFriendNames]
  );

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>CLOSE FRIENDS</Text>
          <Pressable onPress={onClose} hitSlop={8} testID="close-close-friends">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.subtext}>
          Mark members as close friends to see just their recent posts and workouts. Local to this device for now.
        </Text>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tabButton, tab === 'members' && styles.tabButtonActive]} onPress={() => setTab('members')}>
            <Text style={[styles.tabButtonText, tab === 'members' && styles.tabButtonTextActive]}>ALL MEMBERS</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, tab === 'feed' && styles.tabButtonActive]} onPress={() => setTab('feed')}>
            <Text style={[styles.tabButtonText, tab === 'feed' && styles.tabButtonTextActive]}>CLOSE FRIENDS FEED</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {tab === 'members' ? (
            members.length === 0 ? (
              <Text style={styles.emptyText}>No other members yet.</Text>
            ) : (
              members.map((name) => {
                const friend = isCloseFriend(name);
                return (
                  <View key={name} style={styles.memberRow}>
                    <Avatar name={name} />
                    <Text style={styles.memberName}>{name}</Text>
                    <Pressable
                      style={[styles.friendButton, friend && styles.friendButtonActive]}
                      onPress={() => toggleCloseFriend(name)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={friend ? 'star' : 'star-outline'}
                        size={14}
                        color={friend ? colors.white : colors.green}
                      />
                      <Text style={[styles.friendButtonText, friend && styles.friendButtonTextActive]}>
                        {friend ? 'CLOSE FRIEND' : 'ADD'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )
          ) : friendPosts.length === 0 ? (
            <Text style={styles.emptyText}>
              {closeFriendNames.length === 0
                ? 'Add close friends from the Members tab to see their feed here.'
                : 'No recent posts or workouts from your close friends yet.'}
            </Text>
          ) : (
            friendPosts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Avatar name={post.author} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postAuthor}>{post.author}</Text>
                    <Text style={styles.postTime}>{post.timeLabel}</Text>
                  </View>
                </View>
                <Text style={styles.postTitle}>{post.title}</Text>
                {post.kind === 'wod' && post.meta ? (
                  <Text style={styles.postBody}>{post.meta.results}</Text>
                ) : (
                  <Text style={styles.postBody} numberOfLines={3}>
                    {post.text}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  tabButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tabButtonTextActive: {
    color: colors.white,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  memberName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  friendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  friendButtonActive: {
    backgroundColor: colors.green,
  },
  friendButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  friendButtonTextActive: {
    color: colors.white,
  },
  postCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  postAuthor: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
  postTime: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
  },
  postTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 19,
    marginBottom: 4,
  },
  postBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
  },
});
