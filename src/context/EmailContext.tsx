import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

export type EmailMode = 'test' | 'live';

type EmailContextValue = {
  // True until the first fetch of email_settings resolves — callers avoid
  // showing a mode that hasn't actually been confirmed from the database
  // yet. Defaults to 'test' below in the meantime, the same "safe
  // direction to be wrong in" convention the Founding 50 switch already
  // established, since migration_033.sql itself defaults this column to
  // 'test' for the identical reason.
  loading: boolean;
  mode: EmailMode;
  // Admin-only write. The confirmation dialog for TEST -> LIVE lives in
  // the admin screen itself (showAlert, same convention as every other
  // destructive/high-stakes toggle in this app) -- this just performs the
  // actual write once that's been confirmed.
  setMode: (next: EmailMode) => Promise<{ error: string | null }>;
};

const EmailContext = createContext<EmailContextValue | undefined>(undefined);

export function EmailProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<EmailMode>('test');

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('email_settings')
      .select('mode')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data && (data.mode === 'test' || data.mode === 'live')) {
          setModeState(data.mode);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const value = useMemo<EmailContextValue>(
    () => ({
      loading,
      mode,
      setMode: async (next) => {
        const { error } = await supabase.from('email_settings').update({ mode: next }).eq('id', 1);
        if (error) {
          return {
            error: isBackendUnavailableError(error)
              ? "Can't save the email mode right now — the backend isn't reachable."
              : error.message,
          };
        }
        setModeState(next);
        return { error: null };
      },
    }),
    [loading, mode]
  );

  return <EmailContext.Provider value={value}>{children}</EmailContext.Provider>;
}

export function useEmail() {
  const ctx = useContext(EmailContext);
  if (!ctx) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return ctx;
}
