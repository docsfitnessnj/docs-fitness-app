import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export type AuthResult = { error: string | null; needsEmailConfirmation?: boolean };

type AuthContextValue = {
  // Undefined until the very first session check finishes — lets the app
  // shell hold a blank/splash frame for a moment instead of flashing the
  // signed-out onboarding flow before a real, persisted session is found.
  authReady: boolean;
  session: Session | null;
  user: User | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account already exists for that email — try signing in instead.';
  }
  if (m.includes('invalid login credentials')) {
    return "That email and password don't match our records.";
  }
  if (m.includes('password') && (m.includes('least') || m.includes('short') || m.includes('weak'))) {
    return 'Choose a longer password (at least 6 characters).';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return "Can't reach the server right now — check your connection and try again.";
  }
  return message;
}

// Wraps Supabase Auth (email + password only this round — no Apple/Google).
// This is the one source of truth for "is someone really signed in" —
// MembershipContext reads `session` from here for its own `signedUp` flag
// instead of tracking that itself, and every Supabase-backed context below
// it in the tree waits for `authReady` before doing anything.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // No reachable backend yet (offline, or setup.sql not run) — treat
        // as signed out rather than hanging on a blank screen forever.
        setAuthReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      session,
      user: session?.user ?? null,
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error: friendlyAuthError(error.message) };
        // With email confirmation on, Supabase returns a user but no
        // session until the link is clicked — tell the caller so it can
        // show a calm "check your email" message instead of assuming
        // they're in.
        if (!data.session) return { error: null, needsEmailConfirmation: true };
        return { error: null };
      },
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: friendlyAuthError(error.message) };
        return { error: null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      sendPasswordReset: async (email) => {
        const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) return { error: friendlyAuthError(error.message) };
        return { error: null };
      },
    }),
    [authReady, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
