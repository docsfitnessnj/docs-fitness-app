import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ModalHeader } from '../components/ModalHeader';
import { Avatar } from '../components/Avatar';
import { ProfileBadgeCase } from '../components/ProfileBadgeCase';
import { useDisplayName, useProfile } from '../context/ProfileContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileScreen({ visible, onClose }: Props) {
  const { photoUri, name, instagramHandle, funFact, setPhotoUri, setName, setInstagramHandle, setFunFact } =
    useProfile();
  const displayName = useDisplayName();

  const [draftPhotoUri, setDraftPhotoUri] = useState(photoUri);
  const [draftName, setDraftName] = useState(name);
  const [draftHandle, setDraftHandle] = useState(instagramHandle);
  const [draftFunFact, setDraftFunFact] = useState(funFact);

  // Reset the draft to the saved values every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setDraftPhotoUri(photoUri);
      setDraftName(name);
      setDraftHandle(instagramHandle);
      setDraftFunFact(funFact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty =
    draftPhotoUri !== photoUri || draftName !== name || draftHandle !== instagramHandle || draftFunFact !== funFact;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission Needed', 'Allow photo access to set a profile picture.');
      return;
    }
    // allowsEditing + a locked 1:1 aspect gives the OS's native square crop/zoom
    // step before the photo ever comes back to the app.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setDraftPhotoUri(result.assets[0].uri);
    }
  };

  const save = () => {
    setPhotoUri(draftPhotoUri);
    setName(draftName);
    setInstagramHandle(draftHandle);
    setFunFact(draftFunFact);
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

          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={displayName}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>INSTAGRAM HANDLE</Text>
          <View style={styles.handleRow}>
            <Text style={styles.handlePrefix}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={draftHandle}
              onChangeText={(v) => setDraftHandle(v.replace(/^@+/, ''))}
              placeholder="yourhandle"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>FUN FACT</Text>
          <TextInput
            style={styles.input}
            value={draftFunFact}
            onChangeText={setDraftFunFact}
            placeholder="One line about you"
            placeholderTextColor={colors.textMuted}
          />

          <Pressable style={styles.saveButton} onPress={save} testID="save-profile">
            <Text style={styles.saveButtonText}>SAVE</Text>
          </Pressable>

          <ProfileBadgeCase />

        <Text style={styles.footnote}>Saved on this device for now.</Text>
      </ScrollView>
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
    fontSize: 15,
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
    fontSize: 15,
    paddingVertical: 12,
    paddingLeft: 2,
  },
  saveButton: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
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
