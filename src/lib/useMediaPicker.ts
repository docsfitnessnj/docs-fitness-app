import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { MediaAttachment } from './media';
import { showAlert } from './alert';

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

// Shared photo/video picking logic behind "ADD PHOTO / VIDEO" (the big
// dashed box on Log Results and the community composer) and the compact
// attach icon in the input row (Messages) — same permission handling and
// Take Photo / Photo Library action sheet either way.
export function useMediaPicker(onChange: (media: MediaAttachment | null) => void) {
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

  return { pick, takePhoto, pickFromLibrary };
}
