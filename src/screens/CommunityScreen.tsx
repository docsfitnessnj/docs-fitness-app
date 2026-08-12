import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts } from '../theme';

type Post = { name: string; time: string; text: string; likes: number };

const POSTS: Post[] = [
  { name: 'K. Alvarez', time: '2h ago', text: "PR'd the Swing Challenge today. Legs are gone.", likes: 12 },
  { name: 'D. Castillo', time: '5h ago', text: 'First Gauntlet finish under 9 minutes. Nobody cares, work harder.', likes: 8 },
  { name: 'S. Boyle', time: '1d ago', text: 'Ventnor 6am crew is relentless. See you tomorrow.', likes: 21 },
];

function CommunityPost({ post }: { post: Post }) {
  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.name.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.postName}>{post.name}</Text>
          <Text style={styles.postTime}>{post.time}</Text>
        </View>
      </View>
      <Text style={styles.postText}>{post.text}</Text>
      <View style={styles.postFooter}>
        <Ionicons name="heart" size={16} color={colors.highlight} />
        <Text style={styles.postLikes}>{post.likes}</Text>
      </View>
    </View>
  );
}

function CommunityFeed() {
  return (
    <View>
      {POSTS.map((post, index) => (
        <CommunityPost key={index} post={post} />
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

const styles = StyleSheet.create({
  post: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
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
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  postTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  postText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 20,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  postLikes: {
    color: colors.highlight,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    marginLeft: 6,
  },
});
