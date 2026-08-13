import React, { createContext, useContext, useMemo, useState } from 'react';
import { useMembership } from './MembershipContext';

type ProfileContextValue = {
  photoUri: string | null;
  name: string;
  instagramHandle: string;
  funFact: string;
  setPhotoUri: (uri: string | null) => void;
  setName: (name: string) => void;
  setInstagramHandle: (handle: string) => void;
  setFunFact: (fact: string) => void;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

// Local/UI only for now — no backend, resets on app restart. A future round
// wires this up to real accounts and persists it server-side.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [funFact, setFunFact] = useState('');

  const value = useMemo<ProfileContextValue>(
    () => ({ photoUri, name, instagramHandle, funFact, setPhotoUri, setName, setInstagramHandle, setFunFact }),
    [photoUri, name, instagramHandle, funFact]
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
