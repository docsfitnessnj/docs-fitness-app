import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useMembership } from './MembershipContext';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

export type HowTrain = 'online' | 'boathouse';

type ProfileRow = {
  photoUri: string | null;
  name: string;
  instagramHandle: string;
  favoriteQuote: string;
  howTrain: HowTrain | null;
  isAdmin: boolean;
  // Monthly Unlimited's SHOW TOMORROW'S WORKOUT preference — defaults true
  // (see supabase's `show_tomorrows_workout boolean not null default true`)
  // so every existing member keeps seeing tomorrow's workout unless they
  // deliberately turn it off.
  showTomorrowsWorkout: boolean;
};

const DEFAULT_PROFILE: ProfileRow = {
  photoUri: null,
  name: '',
  instagramHandle: '',
  favoriteQuote: '',
  howTrain: null,
  isAdmin: false,
  showTomorrowsWorkout: true,
};

export type UpdateProfileInput = {
  name: string;
  instagramHandle: string;
  favoriteQuote: string;
  // A freshly-picked-and-cropped local URI to upload as the new avatar, the
  // already-saved public URL if unchanged, or null to leave the photo as-is.
  photoUri: string | null;
};

type ProfileContextValue = {
  loading: boolean;
  // Non-null only when the backend is genuinely unreachable / the schema
  // hasn't been created yet — see isBackendUnavailableError. The profile
  // screen shows this instead of crashing or silently discarding edits.
  error: string | null;
  photoUri: string | null;
  name: string;
  instagramHandle: string;
  favoriteQuote: string;
  howTrain: HowTrain | null;
  // The real, backend-authoritative admin flag (profiles.is_admin) — this is
  // what actually gates community moderation and badge-granting server
  // side. Distinct from useMembership().isAdmin, which is only the
  // dev/preview tier toggle used for demoing UI states.
  isAdmin: boolean;
  showTomorrowsWorkout: boolean;
  updateProfile: (input: UpdateProfileInput) => Promise<{ error: string | null }>;
  setHowTrain: (value: HowTrain) => Promise<void>;
  setShowTomorrowsWorkout: (value: boolean) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// Real, backend-tied profile (display name, Instagram handle, favorite
// quote, avatar, how they train, admin flag) — one row per signed-in
// member in the `profiles` table, created automatically on sign-up (see
// supabase/setup.sql's handle_new_user trigger).
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [profile, setProfile] = useState<ProfileRow>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setProfile(DEFAULT_PROFILE);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('profiles')
      .select('display_name, instagram_handle, favorite_quote, avatar_url, how_train, is_admin, show_tomorrows_workout')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(
            isBackendUnavailableError(fetchError)
              ? "Can't load your profile right now — the backend isn't reachable."
              : fetchError.message
          );
          setLoading(false);
          return;
        }
        setProfile({
          photoUri: data?.avatar_url ?? null,
          name: data?.display_name ?? '',
          instagramHandle: data?.instagram_handle ?? '',
          favoriteQuote: data?.favorite_quote ?? '',
          howTrain: (data?.how_train as HowTrain | null) ?? null,
          isAdmin: data?.is_admin ?? false,
          showTomorrowsWorkout: data?.show_tomorrows_workout ?? true,
        });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      loading,
      error,
      photoUri: profile.photoUri,
      name: profile.name,
      instagramHandle: profile.instagramHandle,
      favoriteQuote: profile.favoriteQuote,
      howTrain: profile.howTrain,
      isAdmin: profile.isAdmin,
      showTomorrowsWorkout: profile.showTomorrowsWorkout,
      updateProfile: async (input) => {
        if (!user) return { error: 'Not signed in.' };
        try {
          let avatarUrl = profile.photoUri;
          // A brand new local pick/crop always looks like a blob:/data:/
          // file: URI rather than the https:// public URL already saved —
          // that's the signal to actually upload it.
          if (input.photoUri && input.photoUri !== profile.photoUri && !input.photoUri.startsWith('http')) {
            avatarUrl = await uploadAvatar(user.id, input.photoUri);
          } else if (input.photoUri === null) {
            avatarUrl = null;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              display_name: input.name,
              instagram_handle: input.instagramHandle,
              favorite_quote: input.favoriteQuote,
              avatar_url: avatarUrl,
            })
            .eq('id', user.id);
          if (updateError) throw updateError;

          setProfile((prev) => ({
            ...prev,
            name: input.name,
            instagramHandle: input.instagramHandle,
            favoriteQuote: input.favoriteQuote,
            photoUri: avatarUrl,
          }));
          return { error: null };
        } catch (err) {
          const message = isBackendUnavailableError(err)
            ? "Can't save your profile right now — the backend isn't reachable."
            : err instanceof Error
              ? err.message
              : 'Something went wrong saving your profile.';
          return { error: message };
        }
      },
      setHowTrain: async (howTrain) => {
        if (!user) return;
        setProfile((prev) => ({ ...prev, howTrain }));
        const { error: updateError } = await supabase.from('profiles').update({ how_train: howTrain }).eq('id', user.id);
        if (updateError) {
          // Best-effort — the in-memory value above still lets onboarding
          // continue past the question for this session even if the write
          // didn't land, rather than blocking signup on it.
        }
      },
      setShowTomorrowsWorkout: async (value) => {
        if (!user) return;
        setProfile((prev) => ({ ...prev, showTomorrowsWorkout: value }));
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ show_tomorrows_workout: value })
          .eq('id', user.id);
        if (updateError) {
          // Best-effort, same as setHowTrain above — the toggle still
          // reflects instantly on this device even if the write didn't land.
        }
      },
    }),
    [loading, error, profile, user]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}

// The name shown around the app: the profile's custom name if the member set
// one, otherwise the name derived from their signup email.
export function useDisplayName(): string {
  const { name } = useProfile();
  const { displayName } = useMembership();
  return name.trim() || displayName;
}

// Whether this signed-in member can moderate the community / grant badges —
// true either for a real admin (profiles.is_admin, enforced for real by
// every RLS policy and trigger in supabase/setup.sql) or for the dev/preview
// "ADMIN PREVIEW" tier toggle used throughout this app for demoing UI
// states. The dev toggle is UI-only: showing an admin control it enables to
// a non-real-admin just means the resulting write is rejected server side,
// same as it always would be — this only ever widens what's *shown*, never
// what's actually allowed.
export function useCanModerate(): boolean {
  const { isAdmin: devPreviewAdmin } = useMembership();
  const { isAdmin: realAdmin } = useProfile();
  return devPreviewAdmin || realAdmin;
}
