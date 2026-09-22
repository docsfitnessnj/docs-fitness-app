import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ModalHeader } from '../components/ModalHeader';
import { Avatar } from '../components/Avatar';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { ProfileBadgeCase } from '../components/ProfileBadgeCase';
import { ProfilePhotoCropModal } from '../components/ProfilePhotoCropModal';
import { HowTrain, useDisplayName, useProfile } from '../context/ProfileContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileScreen({ visible, onClose }: Props) {
  const { photoUri, name, instagramHandle, favoriteQuote, howTrain, loading, error, updateProfile, setHowTrain } =
    useProfile();
  const displayName = useDisplayName();

  const [draftPhotoUri, setDraftPhotoUri] = useState(photoUri);
  const [draftName, setDraftName] = useState(name);
  const [draftHandle, setDraftHandle] = useState(instagramHandle);
  const [draftQuote, setDraftQuote] = useState(favoriteQuote);
  // null means "no selection yet" — shown for an account that signed up
  // before this field existed, or through a path that never set an answer
  // (see the Part 2 fix for the two About page doors that used to skip it).
  const [draftHowTrain, setDraftHowTrain] = useState<HowTrain | null>(howTrain);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the draft to the saved values every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setDraftPhotoUri(photoUri);
      setDraftName(name);
      setDraftHandle(instagramHandle);
      setDraftQuote(favoriteQuote);
      setDraftHowTrain(howTrain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty =
    draftPhotoUri !== photoUri ||
    draftName !== name ||
    draftHandle !== instagramHandle ||
    draftQuote !== favoriteQuote ||
    draftHowTrain !== howTrain;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(
        'Permission Needed',
        "Doc's Fitness uses your photos to let you share workout results and set your profile picture. Turn on photo library access in Settings to continue.",
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCropUri(result.assets[0].uri);
    }
  };

  const confirmCrop = (uri: string) => {
    setDraftPhotoUri(uri);
    setCropUri(null);
  };

  const save = async () => {
    setSaving(true);
    const result = await updateProfile({
      name: draftName,
      instagramHandle: draftHandle,
      favoriteQuote: draftQuote,
      photoUri: draftPhotoUri,
    });
    if (result.error) {
      setSaving(false);
      showAlert("Couldn't Save", result.error);
      return;
    }
    // Separate write from updateProfile above — same pattern as the
    // Show Tomorrow's Workout toggle elsewhere in this context. Everything
    // driven by this answer (the Community layout, the leaderboard tag)
    // reads it live off profile context state, so it takes effect the
    // moment this resolves, no reload needed.
    if (draftHowTrain && draftHowTrain !== howTrain) {
      await setHowTrain(draftHowTrain);
    }
    setSaving(false);
    onClose();
  };

  const handleBack = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    showAlert('Discard Changes?', "You haven't saved your edits.", [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  if (!visible) return null;

  if (loading) {
    return (
      <View style={styles.container}>
        <ModalHeader title="PROFILE" onBack={onClose} backTestID="close-profile" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ModalHeader title="PROFILE" onBack={onClose} backTestID="close-profile" />
        <BackendErrorNotice message={error} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModalHeader title="PROFILE" onBack={handleBack} backTestID="close-profile" />

      <ScrollView contentContainerStyle={styles.body}>
          <Pressable onPress={pickPhoto} style={styles.photoWrap} testID="profile-photo-picker">
            <Avatar name={displayName} uri={draftPhotoUri} size={96} />
            <View style={styles.photoEditBadge}>
              <Ionicons name="camera" size={16} color={colors.white} />
            </View>
          </Pressable>
          <Text style={styles.photoHint}>Tap to choose and crop a photo</Text>

          <Text nativeID="profile-name-label" style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={displayName}
            placeholderTextColor={colors.textMuted}
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            nativeID="profile-name-input"
            aria-label="Name"
          />

          <Text nativeID="profile-handle-label" style={styles.label}>INSTAGRAM HANDLE</Text>
          <View style={styles.handleRow}>
            <Text style={styles.handlePrefix}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={draftHandle}
              onChangeText={(v) => setDraftHandle(v.replace(/^@+/, ''))}
              placeholder="yourhandle"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="username"
              nativeID="profile-handle-input"
              aria-label="Instagram handle"
            />
          </View>

          <Text nativeID="profile-how-train-label" style={styles.label}>HOW DO YOU TRAIN</Text>
          <View style={styles.segmentRow}>
            <Pressable
              style={[styles.segment, draftHowTrain === 'online' && styles.segmentActive]}
              onPress={() => setDraftHowTrain('online')}
              testID="profile-how-train-online"
            >
              <Text style={[styles.segmentText, draftHowTrain === 'online' && styles.segmentTextActive]}>
                TRAIN ONLINE
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, draftHowTrain === 'boathouse' && styles.segmentActive]}
              onPress={() => setDraftHowTrain('boathouse')}
              testID="profile-how-train-boathouse"
            >
              <Text style={[styles.segmentText, draftHowTrain === 'boathouse' && styles.segmentTextActive]}>
                TRAIN AT THE BOATHOUSE
              </Text>
            </Pressable>
          </View>

          <Text nativeID="profile-quote-label" style={styles.label}>FAVORITE QUOTE (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            value={draftQuote}
            onChangeText={setDraftQuote}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            nativeID="profile-quote-input"
            aria-label="Favorite quote"
          />

          <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} disabled={saving} onPress={save} testID="save-profile">
            <Text style={styles.saveButtonText}>{saving ? 'SAVING...' : 'SAVE'}</Text>
          </Pressable>

          <ProfileBadgeCase />

        <Text style={styles.footnote}>Saved to your account — it'll be here on any device you sign into.</Text>
      </ScrollView>

      <ProfilePhotoCropModal
        visible={cropUri !== null}
        uri={cropUri}
        onCancel={() => setCropUri(null)}
        onConfirm={confirmCrop}
      />
    </View>
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
    paddingBottom: 40,
    alignItems: 'center',
  },
  photoWrap: {
    marginTop: 8,
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  photoHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 10,
    marginBottom: 24,
  },
  label: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    marginBottom: 18,
  },
  handleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  handlePrefix: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  handleInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    paddingVertical: 12,
    paddingLeft: 2,
  },
  segmentRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  segmentActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.white,
  },
  saveButton: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  footnote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 12,
  },
});
