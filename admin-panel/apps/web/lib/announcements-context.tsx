"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiAnnouncements, apiUnreadAnnouncementsCount } from "./api";
import { useAuth } from "./auth-context";

const STORAGE_SEEN_AT = "sparrows_web_announcements_seen_at";
const POLL_MS = 30000;

type AnnouncementsContextValue = {
  unreadCount: number;
  markAllSeen: () => void;
  seenAtISO: string;
};

const AnnouncementsContext = createContext<AnnouncementsContextValue | null>(null);

function nowISO(): string {
  return new Date().toISOString();
}

export function AnnouncementsProvider({ children }: { children: React.ReactNode }) {
  const { member } = useAuth();
  const [seenAtISO, setSeenAtISO] = useState<string>(() => {
    if (typeof window === "undefined") return nowISO();
    return localStorage.getItem(STORAGE_SEEN_AT) ?? nowISO();
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastAnnouncedId, setLastAnnouncedId] = useState<string | null>(null);

  const markAllSeen = useCallback(() => {
    const next = nowISO();
    setSeenAtISO(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_SEEN_AT, next);
    }
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!member?.id) {
      setUnreadCount(0);
      return;
    }

    const refresh = async () => {
      try {
        const unread = await apiUnreadAnnouncementsCount(seenAtISO);
        setUnreadCount(unread);
        const latest = await apiAnnouncements(0, 1);
        const latestItem = latest.items[0];
        if (latestItem && unread > 0 && latestItem.id !== lastAnnouncedId && typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            const n = new Notification("New announcement", { body: latestItem.message, tag: "sparrows-announcement" });
            n.onclick = () => {
              window.focus();
              window.location.href = "/announcements";
            };
            setLastAnnouncedId(latestItem.id);
          }
        }
      } catch {
        // keep silent for background polling
      }
    };

    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, POLL_MS);

    return () => window.clearInterval(id);
  }, [member?.id, seenAtISO, lastAnnouncedId]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const value = useMemo<AnnouncementsContextValue>(() => ({
    unreadCount,
    markAllSeen,
    seenAtISO,
  }), [unreadCount, markAllSeen, seenAtISO]);

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>;
}

export function useAnnouncements(): AnnouncementsContextValue {
  const ctx = useContext(AnnouncementsContext);
  if (!ctx) throw new Error("useAnnouncements must be used within AnnouncementsProvider");
  return ctx;
}
