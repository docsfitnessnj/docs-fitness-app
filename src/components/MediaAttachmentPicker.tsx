import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { MediaAttachment } from '../lib/media';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  media: MediaAttachment | null;
  onChange: (media: MediaAttachment | null) => void;
};

function denied(source: 'photo library' | 'camera') {
  showAlert(
    'Permission Needed',
    `Doc's Fitness uses your photos to let you share workout results and set your profile picture. Turn on ${source} access in Settings to continue.`,
    [
      { text: 'Not Now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
    ]
  );
}

// Shared "ADD PHOTO / VIDEO" control used on Log Results and the community
// composer — same picker, same thumbnail-preview-with-remove/replace
// pattern, so an attachment picked in one place looks and behaves like one
// picked in the other.
export function MediaAttachmentPicker({ media, onChange }: Props) {
  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      denied('photo library');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onChange({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      denied('camera');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        onChange({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
      }
    } catch {
      showAlert('Camera Unavailable', "Couldn't open the camera. Try choosing from your library instead.");
    }
  };

  const pick = () => {
    showAlert('Add Photo or Video', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickFromLibrary },
    ]);
  };

  if (media) {
    return (
      <View style={styles.previewWrap} testID="media-preview">
        {media.type === 'image' ? (
          <Image source={{ uri: media.uri }} style={styles.previewImage} />
        ) : (
          <View style={styles.previewVideo}>
            <Ionicons name="videocam" size={26} color={colors.white} />
            <Text style={styles.previewVideoText}>VIDEO ATTACHED</Text>
          </View>
        )}
        <View style={styles.previewActions}>
          <Pressable style={styles.previewActionBtn} onPress={pick} testID="media-replace">
            <Text style={styles.previewActionText}>REPLACE</Text>
          </Pressable>
          <Pressable
            style={[styles.previewActionBtn, styles.previewRemoveBtn]}
            onPress={() => onChange(null)}
            testID="media-remove"
          >
            <Ionicons name="close" size={14} color={colors.white} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.addButton} onPress={pick} testID="media-add">
      <Ionicons name="camera-outline" size={18} color={colors.green} />
      <Text style={styles.addButtonText}>ADD PHOTO / VIDEO</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 13,
  },
  addButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.background,
  },
  previewVideo: {
    width: '100%',
    height: 160,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewVideoText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  previewActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  previewActionBtn: {
    backgroundColor: 'rgba(18,33,28,0.7)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewActionText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  previewRemoveBtn: {
    paddingHorizontal: 6,
  },
});
