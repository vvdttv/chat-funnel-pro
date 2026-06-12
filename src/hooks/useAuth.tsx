import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  user_id: string;
  organization_id: string;
  username: string;
  display_name: string | null;
}

export type AppRole = 'admin' | 'corretor';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  roles: AppRole[];
  isAdmin: boolean;
  loading: boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  roles: [],
  isAdmin: false,
  loading: true,
  signInWithUsername: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: rolesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    setProfile(prof as UserProfile | null);
    setRoles(((rolesData as { role: AppRole }[] | null) || []).map(r => r.role));
  };

  useEffect(() => {
    // 1. Listener PRIMEIRO (síncrono); 2. depois getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer para evitar deadlock
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadProfile(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithUsername = async (username: string, password: string) => {
    const clean = username.trim().toLowerCase();
    const email = clean.includes('@') ? clean : `${clean}@app.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        isAdmin: roles.includes('admin') || profile?.role === 'superadmin',
        loading,
        signInWithUsername,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
