import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { supabase } from '../lib/supabaseClient';
import { colors, fonts } from '../theme';

type Props = {
  memberId: string | null;
  onClose: () => void;
};

type MemberProfile = { displayName: string; avatarUrl: string | null };

// A minimal, read-only view of another member's public profile -- display
// name and avatar only, the same two fields `profiles` RLS already lets any
// signed-in member read for anyone else (see every other chat participant's
// name/avatar in DocsGroupChatScreen/DocThreadView, which read this exact
// shape already). This is the only place in the app that shows someone
// ELSE's profile; ProfileScreen.tsx is the signed-in member's own.
export function MemberProfileModal({ memberId, onClose }: Props) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!memberId) {
      setProfile(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', memberId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          return;
        }
        setProfile({
          displayName: (data as { display_name: string | null }).display_name?.trim() || 'Member',
          avatarUrl: (data as { avatar_url: string | null }).avatar_url,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (!memberId) return null;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="member-profile-close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          {profile ? (
            <>
              <Avatar name={profile.displayName} uri={profile.avatarUrl} size={72} />
              <Text style={styles.name} testID="member-profile-name">
                {profile.displayName}
              </Text>
            </>
          ) : notFound ? (
            <Text style={styles.hint}>This member couldn't be found.</Text>
          ) : (
            <View testID="member-profile-loading" />
          )}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
});
