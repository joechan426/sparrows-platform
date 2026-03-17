"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiMemberRegistrations } from "@/lib/api";
import type { MemberRegistration } from "@/lib/api";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString(undefined, { timeStyle: "short" });
}

function statusClass(s: string): string {
  const u = s.toUpperCase();
  if (u === "APPROVED") return "pill-approved";
  if (u === "REJECTED") return "pill-rejected";
  if (u === "WAITING_LIST") return "pill-waiting";
  return "pill-pending";
}
function statusText(s: string): string {
  return s.toUpperCase() === "WAITING_LIST" ? "Waiting list" : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function ScheduledPage() {
  const router = useRouter();
  const { member, loading: authLoading } = useAuth();
  const [registrations, setRegistrations] = useState<MemberRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !member) router.push("/login");
  }, [authLoading, member, router]);

  useEffect(() => {
    if (!member?.id) return;
    apiMemberRegistrations(member.id)
      .then(setRegistrations)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [member?.id]);

  const now = new Date();
  const upcoming = registrations
    .filter((r) => r.event && new Date(r.event.endAt) >= now)
    .sort((a, b) => (a.event?.startAt ? new Date(a.event.startAt).getTime() : 0) - (b.event?.startAt ? new Date(b.event.startAt).getTime() : 0));

  if (authLoading || !member) {
    return (
      <div className="page-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (loading) return <div className="page-loading">Loading your events…</div>;
  if (error) return <div className="page-content page-error">{error}</div>;

  return (
    <div className="page-content">
      <h1 className="page-title">My Scheduled Events</h1>
      <p className="profile-muted" style={{ marginBottom: "1rem" }}>
        Your current and upcoming event registrations.
      </p>
      {upcoming.length === 0 ? (
        <p className="profile-muted">No upcoming events.</p>
      ) : (
        <ul className="event-list">
          {upcoming.map((reg) => (
            <li key={reg.id} className="card-event event-list-item" style={{ padding: "12px", marginBottom: "8px" }}>
              <div className="event-list-title">{reg.event?.title ?? "Event"}</div>
              <div className="event-list-meta">
                {reg.event?.startAt && formatDate(reg.event.startAt)} · {reg.event?.startAt && formatTime(reg.event.startAt)}
              </div>
              {reg.event?.location && (
                <div className="event-list-meta">Location: {reg.event.location}</div>
              )}
              <div style={{ marginTop: "8px" }}>
                <span className={`pill ${statusClass(reg.status)}`}>{statusText(reg.status)}</span>
              </div>
              {reg.teamName && (
                <div className="event-list-meta" style={{ marginTop: "4px" }}>Team: {reg.teamName}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
