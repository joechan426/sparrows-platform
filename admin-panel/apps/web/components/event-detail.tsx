"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CalendarEvent, Member } from "@/lib/api";
import { apiCalendarEvent, apiCreateEventCheckout, apiRegisterForEvent } from "@/lib/api";
import { approvedRegistrationHint } from "@/lib/calendar-registration-hint";

const SYDNEY_TIME_ZONE = "Australia/Sydney";
function formatDate(d: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}
function formatTime(d: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
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
  onRegistered: (eventId: string) => void;
  /** Read-only details only (no login / register / payment UI). */
  infoOnly?: boolean;
};

export function EventDetail({ event, member, onClose, onRegistered, infoOnly = false }: Props) {
  const [eventData, setEventData] = useState<CalendarEvent>(event);
  const joinHint = approvedRegistrationHint(eventData);
  const [preferredName, setPreferredName] = useState(member?.preferredName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoadingProvider, setCheckoutLoadingProvider] = useState<"stripe" | "paypal" | null>(null);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setEventData(event);
    setPaymentMethodsLoading(Boolean(event.isPaid && (event.priceCents ?? 0) > 0));
    let cancelled = false;
    (async () => {
      try {
        const detail = await apiCalendarEvent(event.id);
        if (!cancelled) setEventData(detail);
      } catch {
        // keep existing event snapshot
      } finally {
        if (!cancelled) setPaymentMethodsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event]);

  const special = isSpecial(eventData);
  const requiresPayment = Boolean(eventData.isPaid && (eventData.priceCents ?? 0) > 0);

  async function handleCheckout(provider: "stripe" | "paypal") {
    setError("");
    if (!preferredName.trim()) {
      setError("Preferred name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required for paid events.");
      return;
    }
    if (special && !teamName.trim()) {
      setError("Team name is required for this event.");
      return;
    }
    setCheckoutLoadingProvider(provider);
    try {
      const result = await apiCreateEventCheckout({
        eventId: eventData.id,
        provider,
        preferredName: preferredName.trim(),
        email: email.trim(),
        teamName: special ? teamName.trim() || null : null,
      });
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout.");
    } finally {
      setCheckoutLoadingProvider(null);
    }
  }

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
        eventData.id,
        preferredName.trim(),
        email.trim(),
        special ? teamName.trim() || null : null
      );
      setSuccess(true);
      // Optimistically update the UI (Pending pill) immediately.
      onRegistered(eventData.id);
      // Keep the success message visible for a short moment, then close.
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline) {
        // Background Sync should queue the request and retry when online.
        // Even if fetch throws, we can still optimistically reflect "Pending".
        setSuccess(true);
        setError("");
        onRegistered(eventData.id);
        setTimeout(() => onClose(), 1500);
      } else {
        setError(err instanceof Error ? err.message : "Registration failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content event-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{eventData.title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="event-detail-dl">
          <dt>Date & time</dt>
          <dd>{formatDate(eventData.startAt)} · {formatTime(eventData.startAt)}</dd>
          <dt>Location</dt>
          <dd>{eventData.location || "—"}</dd>
          <dt>Description</dt>
          <dd>{eventData.description || "—"}</dd>
          <dt>Sport</dt>
          <dd>{eventData.sportType || "—"}</dd>
          <dt>Registration</dt>
          <dd>
            {eventData.registrationOpen ? "Open" : "Closed"}
            {joinHint ? (
              <>
                {" · "}
                <span className="event-detail-join-hint">{joinHint}</span>
              </>
            ) : null}
          </dd>
        </dl>

        {!infoOnly && !member && (
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

        {!infoOnly && member && eventData.registrationOpen && (
          <>
            <h3 className="event-detail-form-title">Register</h3>
            {success ? (
              <p className="form-success">You are registered. Status: PENDING.</p>
            ) : (
              <form onSubmit={requiresPayment ? (e) => e.preventDefault() : handleRegister} className="auth-form">
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
                {requiresPayment && (
                  <div className="field">
                    <label>Payment method</label>
                    {paymentMethodsLoading ? (
                      <p>Loading payment method...</p>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {eventData.stripeCheckoutAvailable && (
                            <button
                              type="button"
                              className="btn-checkout-stripe"
                              disabled={checkoutLoadingProvider !== null}
                              onClick={() => void handleCheckout("stripe")}
                            >
                              {checkoutLoadingProvider === "stripe" ? "Opening Stripe…" : "Pay with Stripe"}
                            </button>
                          )}
                          {eventData.paypalCheckoutAvailable && (
                            <button
                              type="button"
                              className="btn-checkout-paypal"
                              disabled={checkoutLoadingProvider !== null}
                              onClick={() => void handleCheckout("paypal")}
                            >
                              {checkoutLoadingProvider === "paypal" ? "Opening PayPal…" : "Pay with PayPal"}
                            </button>
                          )}
                        </div>
                        {!eventData.stripeCheckoutAvailable && !eventData.paypalCheckoutAvailable && (
                          <p className="form-error">No payment method is currently available for this event.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {error && <p className="form-error">{error}</p>}
                {!requiresPayment && (
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Registering…" : "Register"}
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
