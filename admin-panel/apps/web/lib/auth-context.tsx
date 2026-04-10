"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import type { Member } from "./api";
import { apiGetMember } from "./api";

const STORAGE_KEY = "sparrows_web_member";

type AuthContextValue = {
  member: Member | null;
  loading: boolean;
  setMember: (m: Member | null) => void;
  logout: () => void;
  refreshMember: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): Member | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Member;
    if (parsed?.id && typeof parsed.preferredName === "string" && typeof parsed.email === "string") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveStored(m: Member | null) {
  if (typeof window === "undefined") return;
  if (m) localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  else localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMemberState] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const setMember = useCallback((m: Member | null) => {
    setMemberState(m);
    saveStored(m);
  }, []);

  const refreshMember = useCallback(async () => {
    const current = loadStored();
    if (!current?.id) {
      setMemberState(null);
      setLoading(false);
      return;
    }
    try {
      const updated = await apiGetMember(current.id);
      setMemberState(updated);
      saveStored(updated);
    } catch {
      setMemberState(current);
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore session from localStorage before first paint to avoid a flash of logged-out UI on Profile.
  useLayoutEffect(() => {
    const stored = loadStored();
    if (stored) {
      setMemberState(stored);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = loadStored();
    if (!stored?.id) return;
    apiGetMember(stored.id)
      .then((updated) => {
        setMemberState(updated);
        saveStored(updated);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    setMemberState(null);
    saveStored(null);
  }, []);

  const value: AuthContextValue = {
    member,
    loading,
    setMember,
    logout,
    refreshMember,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
