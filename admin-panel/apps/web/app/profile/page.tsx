"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiChangePassword, apiUpdateMember } from "@/lib/api";
import type { MemberRegistration } from "@/lib/api";
import { useNavRefresh } from "@/lib/nav-refresh-context";
import { useAnnouncements } from "@/lib/announcements-context";
import { ContactUsBlock } from "@/components/contact-us-block";

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

export default function ProfilePage() {
  const router = useRouter();
  const { member, setMember, loading: authLoading } = useAuth();
  const {
    registrations,
    registrationsUpdatedAt,
    ensureRegistrationsLoaded,
    refreshRegistrationsInBackground,
  } = useNavRefresh();
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [openAccount, setOpenAccount] = useState(true);
  const [openScheduled, setOpenScheduled] = useState(true);
  const [editingPreferredName, setEditingPreferredName] = useState(false);
  const [preferredNameDraft, setPreferredNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const { unreadCount } = useAnnouncements();

  useEffect(() => {
    if (!member?.id) return;
    ensureRegistrationsLoaded(member.id).catch(() => {});
  }, [member?.id]);

  // Keep event registration status in sync with admin-panel changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!member?.id) return;

    const memberId = member.id;
    const REFRESH_MS = 15000;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      refreshRegistrationsInBackground(memberId);
    };

    maybeRefresh();

    const intervalId = window.setInterval(maybeRefresh, REFRESH_MS);
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [member?.id, refreshRegistrationsInBackground]);

  const now = new Date();
  const upcoming = (registrations ?? [])
    .filter((r) => r.event && new Date(r.event.endAt) >= now)
    .sort((a, b) => (a.event?.startAt ? new Date(a.event.startAt).getTime() : 0) - (b.event?.startAt ? new Date(b.event.startAt).getTime() : 0));

  async function handleSavePreferredName(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    const next = preferredNameDraft.trim();
    if (!next) {
      setNameError("Name is required.");
      return;
    }
    setNameError("");
    setNameSaving(true);
    try {
      const updated = await apiUpdateMember(member.id, { preferredName: next });
      setMember(updated);
      setEditingPreferredName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    setPasswordSaving(true);
    try {
      await apiChangePassword(member.id, currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Change password failed.");
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!member && authLoading) {
    return (
      <div className="profile-page">
        <header className="profile-header">
          <span className="profile-logo">Sparrows</span>
          <h1 className="profile-title">My Profile</h1>
        </header>
        <div className="section-divider" />
        <p className="profile-muted" style={{ padding: "0 1rem 1rem" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="profile-page">
        <header className="profile-header">
          <span className="profile-logo">Sparrows</span>
          <h1 className="profile-title">My Profile</h1>
        </header>
        <div className="section-divider" />
        <section className="profile-guest-section">
          <p className="profile-guest-text">Log in or create an account to manage your profile and event registrations.</p>
          <div className="profile-guest-buttons">
            <Link href="/login" className="btn-primary profile-guest-btn">Log in</Link>
            <Link href="/register" className="btn-secondary profile-guest-btn">Create account</Link>
          </div>
          <p className="profile-forgot-wrap">
            <a
              href="https://ig.me/m/sparrowsvolleyball"
              target="_blank"
              rel="noopener noreferrer"
              className="profile-forgot-link"
            >
              Forgot your password? Tell us
            </a>
          </p>
          <div className="section-divider" />
          <ContactUsBlock />
          <div className="section-divider" />
          <a
            href="https://sparrowsvolleyball.com.au/news"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-sparrows-news"
          >
            Click here to check Sparrows News
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <span className="profile-logo">Sparrows</span>
        <h1 className="profile-title">
          {member.preferredName ? `Hello ${member.preferredName}` : "My Profile"}
        </h1>
      </header>
      <div className="section-divider" />

      {/* My account */}
          <section className="disclosure-section">
        <button
          type="button"
          className="disclosure-head"
          onClick={() => setOpenAccount(!openAccount)}
          aria-expanded={openAccount}
        >
          <span className="disclosure-title">My account</span>
          <span className="disclosure-chevron">{openAccount ? "▼" : "▶"}</span>
        </button>
        {openAccount && (
          <div className="disclosure-body">
            <div className="profile-readonly-fields">
              <div className="profile-field-row">
                <span className="profile-label">Name</span>
                {!editingPreferredName ? (
                  <div className="profile-name-with-action">
                    <span className="profile-value">{member.preferredName ?? "—"}</span>
                    <button
                      type="button"
                      className="btn-edit-preferred-name"
                      onClick={() => {
                        setPreferredNameDraft(member.preferredName ?? "");
                        setNameError("");
                        setEditingPreferredName(true);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <form className="profile-edit-name-form" onSubmit={handleSavePreferredName}>
                    <input
                      type="text"
                      className="profile-edit-name-input"
                      value={preferredNameDraft}
                      onChange={(e) => setPreferredNameDraft(e.target.value)}
                      autoComplete="name"
                      aria-label="Preferred name"
                    />
                    {nameError && <p className="form-error profile-edit-name-error">{nameError}</p>}
                    <div className="profile-edit-name-actions">
                      <button type="submit" className="btn-primary profile-edit-name-save" disabled={nameSaving}>
                        {nameSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary profile-edit-name-cancel"
                        disabled={nameSaving}
                        onClick={() => {
                          setEditingPreferredName(false);
                          setNameError("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
              <div className="profile-field-row">
                <span className="profile-label">Email</span>
                <span className="profile-value">{member.email ?? "—"}</span>
              </div>
            </div>
            <div className="profile-buttons-row">
              <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)}>
                Change password
              </button>
              <button type="button" className="btn-danger" onClick={() => { setMember(null); router.push("/calendar"); }}>
                Log out
              </button>
            </div>
            {showPassword && (
              <form onSubmit={handleChangePassword} className="auth-form change-password-form">
                <div className="field">
                  <label>Current password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                </div>
                <div className="field">
                  <label>New password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
                </div>
                <div className="field">
                  <label>Confirm new password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                {passwordError && <p className="form-error">{passwordError}</p>}
                {passwordSuccess && <p className="form-success">Password updated.</p>}
                <button type="submit" className="btn-primary" disabled={passwordSaving}>
                  {passwordSaving ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      <div className="section-divider" />

      {/* My Next Sparrows Events */}
      <section className="disclosure-section">
        <button
          type="button"
          className="disclosure-head"
          onClick={() => setOpenScheduled(!openScheduled)}
          aria-expanded={openScheduled}
        >
          <span className="disclosure-title">My Next Sparrows Events</span>
          <span className="disclosure-chevron">{openScheduled ? "▼" : "▶"}</span>
        </button>
        {openScheduled && (
          <div className="disclosure-body">
            {registrations === null ? (
              <p className="profile-muted">Loading...</p>
            ) : upcoming.length === 0 ? (
              <p className="profile-muted">No upcoming events.</p>
            ) : (
              <ul className="event-list">
                {upcoming.map((reg) => (
                  <li key={reg.id} className="event-list-item">
                    <div className="event-list-title">{reg.event?.title ?? "Event"}</div>
                    <div className="event-list-meta">
                      {reg.event?.startAt && formatDate(reg.event.startAt)} · {reg.event?.startAt && formatTime(reg.event.startAt)}
                    </div>
                    {reg.event?.location && <div className="event-list-meta">Location: {reg.event.location}</div>}
                    <span className={`pill ${statusClass(reg.status)}`}>{statusText(reg.status)}</span>
                    {reg.teamName && <div className="event-list-meta">Team: {reg.teamName}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="section-divider" />

      <Link href="/history" className="profile-link-row">
        <span className="disclosure-title">My Sparrows History</span>
        <span className="chevron-right">›</span>
      </Link>

      <div className="section-divider" />

      <Link href="/announcements" className="profile-link-row">
        <span className="disclosure-title">Announcements</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {unreadCount > 0 && <span className="profile-unread-badge">{unreadCount}</span>}
          <span className="chevron-right">›</span>
        </span>
      </Link>

      <div className="section-divider" />

      <ContactUsBlock />

      <div className="section-divider" />

      {/* Sparrows News — single button */}
      <a
        href="https://sparrowsvolleyball.com.au/news"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-sparrows-news"
      >
        Click here to check Sparrows News
      </a>
    </div>
  );
}
