"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiAnnouncements, type Announcement } from "@/lib/api";
import { useAnnouncements } from "@/lib/announcements-context";

const PAGE_SIZE = 10;
const SYDNEY = "Australia/Sydney";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const { member, loading: authLoading } = useAuth();
  const { markAllSeen } = useAnnouncements();
  const [items, setItems] = useState<Announcement[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  useEffect(() => {
    if (!authLoading && !member) router.push("/login");
  }, [authLoading, member, router]);

  const load = async (append: boolean) => {
    const start = append ? offset : 0;
    const end = start + PAGE_SIZE;
    if (!append) setLoading(true);
    setError("");
    try {
      const data = await apiAnnouncements(start, end);
      setTotal(data.total);
      setOffset(start + data.items.length);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!member?.id) return;
    void load(false);
  }, [member?.id]);

  const canLoadMore = useMemo(() => items.length < total, [items.length, total]);

  if (authLoading || !member) {
    return <div className="page-loading"><p>Loading…</p></div>;
  }

  return (
    <div className="page-content">
      <h1 className="page-title">Announcements</h1>
      <p className="profile-muted" style={{ marginBottom: "1rem" }}>
        Latest updates from Sparrows staff.
      </p>
      {loading ? (
        <p className="profile-muted">Loading announcements…</p>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : items.length === 0 ? (
        <p className="profile-muted">No announcements yet.</p>
      ) : (
        <ul className="event-list">
          {items.map((a) => (
            <li key={a.id} className="card-event event-list-item" style={{ padding: "12px", marginBottom: "8px" }}>
              <div className="event-list-title">{a.message}</div>
              <div className="event-list-meta" style={{ marginTop: "6px" }}>
                {formatDateTime(a.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
        <button type="button" className="btn-secondary" disabled={!canLoadMore || loading} onClick={() => void load(true)}>
          {canLoadMore ? "Load More" : "No more records"}
        </button>
      </div>
    </div>
  );
}
