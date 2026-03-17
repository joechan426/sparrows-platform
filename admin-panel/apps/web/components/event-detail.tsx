"use client";

import { useState } from "react";
import Link from "next/link";
import type { CalendarEvent, Member } from "@/lib/api";
import { apiRegisterForEvent } from "@/lib/api";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString(undefined, { timeStyle: "short" });
}

function isSpecial(event: CalendarEvent): boolean {
  const t = (event.eventType ?? "").toUpperCase();
  const title = (event.title ?? "").toLowerCase();
  return t === "SPECIAL" || t === "SPECIAL_EVENT" || title.includes("cup");
}

type Props = {
  event: CalendarEvent;
  member: Member | null;
  onClose: () => void;
  onRegistered: () => void;
};

export function EventDetail({ event, member, onClose, onRegistered }: Props) {
  const [preferredName, setPreferredName] = useState(member?.preferredName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const special = isSpecial(event);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!preferredName.trim()) {
      setError("Preferred name is required.");
      return;
    }
    if (special && !teamName.trim()) {
      setError("Team name is required for this event.");
      return;
    }
    setLoading(true);
    try {
      await apiRegisterForEvent(
        event.id,
        preferredName.trim(),
        email.trim(),
        special ? teamName.trim() || null : null
      );
      setSuccess(true);
      setTimeout(() => onRegistered(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content event-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{event.title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="event-detail-dl">
          <dt>Date & time</dt>
          <dd>{formatDate(event.startAt)} · {formatTime(event.startAt)}</dd>
          <dt>Location</dt>
          <dd>{event.location || "—"}</dd>
          <dt>Description</dt>
          <dd>{event.description || "—"}</dd>
          <dt>Sport</dt>
          <dd>{event.sportType || "—"}</dd>
          <dt>Registration</dt>
          <dd>{event.registrationOpen ? "Open" : "Closed"}</dd>
        </dl>

        {!member && (
          <div className="event-detail-guest-message">
            <p>You need to log in or create an account to register for this event.</p>
            <p>
              <Link href="/profile" className="event-detail-guest-link">Log in</Link>
              {" or "}
              <Link href="/profile" className="event-detail-guest-link">create an account</Link>
              {" to continue."}
            </p>
          </div>
        )}

        {member && event.registrationOpen && (
          <>
            <h3 className="event-detail-form-title">Register</h3>
            {success ? (
              <p className="form-success">You are registered. Status: PENDING.</p>
            ) : (
              <form onSubmit={handleRegister} className="auth-form">
                <div className="field">
                  <label>Preferred name *</label>
                  <input
                    type="text"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {special && (
                  <div className="field">
                    <label>Team name *</label>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      required
                    />
                  </div>
                )}
                {error && <p className="form-error">{error}</p>}
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Registering…" : "Register"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
