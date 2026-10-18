import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';
import { MediaAttachment } from './media';
import { showAlert } from './alert';
import { detectVideoCodecFromFile } from './videoCodec';

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

// iOS Safari decides whether to hand over a picked video AS-IS or
// transcode it first based on the file input's own `accept` attribute —
// not anything the app can configure after the fact. List `video/quicktime`
// (the actual container iPhone video lives in — .mov, routinely HEVC/H.265
// encoded under the hood) or a generic `video/*`, and iOS treats the
// original as already acceptable and hands it over untouched, HEVC and
// all. List ONLY `video/mp4`, and the original no longer matches what's
// accepted, so iOS transcodes it to H.264 MP4 on the way out instead —
// the one video codec reliably decodable everywhere this app runs,
// desktop Chrome included (see MediaViewer's own fallback for what a
// browser that can't decode HEVC actually does: plays the audio, never
// paints a frame). expo-image-picker's own web implementation hardcodes a
// much wider accept list for videos (video/mp4,video/quicktime,
// video/x-m4v,video/*) with no option to narrow it — confirmed by reading
// its installed source (ExponentImagePicker.web.ts) — so web bypasses it
// entirely here with a direct file input; native platforms keep using
// expo-image-picker below exactly as before, since this is a WebKit
// file-input quirk, not a native picker concern.
const WEB_ACCEPT = 'image/*,video/mp4';

function pickWebFile(capture?: 'user' | 'environment'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = WEB_ACCEPT;
    input.style.display = 'none';
    input.setAttribute('data-testid', 'file-input');
    if (capture) input.setAttribute('capture', capture);
    document.body.appendChild(input);

    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    // Not every browser fires 'change' on a canceled picker; the native
    // 'cancel' event (supported in current Chromium/WebKit) covers that
    // gap, same pattern expo-image-picker's own web code uses for this.
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

async function pickWebMedia(capture?: 'user' | 'environment'): Promise<MediaAttachment | null> {
  const file = await pickWebFile(capture);
  if (!file) return null;
  const type = file.type.startsWith('video/') ? 'video' : 'image';
  // Informational only (see videoCodec.ts / MediaAttachment.videoCodec) — never
  // blocks the send, since an iPhone plays its own HEVC video natively either way.
  const videoCodec = type === 'video' ? await detectVideoCodecFromFile(file) : undefined;
  return { uri: URL.createObjectURL(file), type, videoCodec };
}

// Shared photo/video picking logic behind "ADD PHOTO / VIDEO" (the big
// dashed box on Log Results and the community composer) and the compact
// attach icon in the input row (Messages) — same permission handling and
// Take Photo / Photo Library action sheet either way.
export function useMediaPicker(onChange: (media: MediaAttachment | null) => void) {
  const pickFromLibrary = async () => {
    if (Platform.OS === 'web') {
      const media = await pickWebMedia();
      if (media) onChange(media);
      return;
    }
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
    if (Platform.OS === 'web') {
      const media = await pickWebMedia('environment');
      if (media) onChange(media);
      return;
    }
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
