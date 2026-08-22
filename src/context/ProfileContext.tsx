import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';
import { useMembership } from './MembershipContext';

const STORAGE_KEY = 'docsfitness.profile.v1';

type PersistedProfile = {
  photoUri: string | null;
  name: string;
  instagramHandle: string;
  favoriteQuote: string;
};

const DEFAULT_PROFILE: PersistedProfile = { photoUri: null, name: '', instagramHandle: '', favoriteQuote: '' };

type ProfileContextValue = {
  photoUri: string | null;
  name: string;
  instagramHandle: string;
  favoriteQuote: string;
  setPhotoUri: (uri: string | null) => void;
  setName: (name: string) => void;
  setInstagramHandle: (handle: string) => void;
  setFavoriteQuote: (quote: string) => void;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

// Saved to this device via localStorage so it survives app restarts — no
// backend account yet, but no longer lost on every reload either.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PersistedProfile>(() => loadJSON(STORAGE_KEY, DEFAULT_PROFILE));

  useEffect(() => {
    saveJSON(STORAGE_KEY, profile);
  }, [profile]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      photoUri: profile.photoUri,
      name: profile.name,
      instagramHandle: profile.instagramHandle,
      favoriteQuote: profile.favoriteQuote,
      setPhotoUri: (photoUri) => setProfile((prev) => ({ ...prev, photoUri })),
      setName: (name) => setProfile((prev) => ({ ...prev, name })),
      setInstagramHandle: (instagramHandle) => setProfile((prev) => ({ ...prev, instagramHandle })),
      setFavoriteQuote: (favoriteQuote) => setProfile((prev) => ({ ...prev, favoriteQuote })),
    }),
    [profile]
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
