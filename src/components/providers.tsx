"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isConfigured } from "@/lib/supabase/client";

const AuthContext = createContext<{
  user: User | null; loading: boolean; isAdmin: boolean; adminLoading: boolean; adminError: string;
}>({ user: null, loading: true, isAdmin: false, adminLoading: false, adminError: "" });
export const useAuth = () => useContext(AuthContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [adminAccess, setAdminAccess] = useState<{ userId: string; allowed: boolean; error: string } | null>(null);
  useEffect(() => {
    if (!isConfigured) return;
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) { setUser(data.user); setLoading(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null); setLoading(false);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user || !isConfigured) { setAdminAccess(null); return; }
    let active = true;
    createClient().rpc("is_admin").then(({ data, error }) => {
      if (active) setAdminAccess({ userId: user.id, allowed: !error && data === true, error: error?.message ?? "" });
    });
    return () => { active = false; };
  }, [user]);
  const access = adminAccess?.userId === user?.id ? adminAccess : null;
  return <AuthContext.Provider value={{
    user, loading, isAdmin: access?.allowed ?? false,
    adminLoading: Boolean(user && !access), adminError: access?.error ?? ""
  }}>{children}</AuthContext.Provider>;
}
