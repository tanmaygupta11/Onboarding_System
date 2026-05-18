import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to session changes. IMPORTANT: do NOT call any supabase client
  // methods (getSession, signOut, etc.) from inside onAuthStateChange — that
  // deadlocks because the internal auth lock is still held when the callback
  // runs. Only synchronous state updates in here.
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data.session);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load profile whenever the session identity changes. Runs outside the
  // supabase auth lock, so it's safe to call supabase.auth.getSession /
  // supabase.auth.signOut from here.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setProfile(me);
      } catch {
        if (cancelled) return;
        await supabase.auth.signOut();
        setProfile(null);
        setSession(null);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function homeRouteForRole(role) {
  if (role === 'PROGRAM_MANAGER') return '/pm-dashboard/clients';
  if (role === 'PAYROLL_LEAD') return '/dashboard';
  if (role === 'PAYROLL_HEAD') return '/admin-dashboard';
  return '/login';
}
