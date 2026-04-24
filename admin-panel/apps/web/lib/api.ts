/**
 * API client for Sparrows web client. Uses relative /api when same origin.
 * For Netlify: set NEXT_PUBLIC_API_URL if API is on a different origin.
 */

function getBase(): string {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  return "";
}

const base = () => getBase();

export type Member = {
  id: string;
  preferredName: string;
  email: string;
  creditCents?: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  description: string | null;
  location: string | null;
  sportType: string;
  eventType: string;
  registrationOpen: boolean;
  capacity: number | null;
  isPaid?: boolean;
  priceCents?: number | null;
  priceDollars?: number | null;
  currency?: string;
  stripeCheckoutAvailable?: boolean;
  paypalCheckoutAvailable?: boolean;
  /** Present when loaded from API; count of APPROVED registrations */
  approvedCount?: number;
  /** Count of WAITING_LIST registrations */
  waitlistedCount?: number;
  /** Count of PENDING registrations */
  pendingCount?: number;
  payableAfterCreditCents?: number;
};

export type MemberRegistration = {
  id: string;
  status: string;
  teamName: string | null;
  createdAt: string;
  event: CalendarEvent | null;
};

export type Announcement = {
  id: string;
  message: string;
  createdAt: string;
  createdByAdminId?: string | null;
  createdByUserName?: string | null;
};

export async function apiLogin(email: string, password: string): Promise<Member> {
  const res = await fetch(`${base()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Login failed");
  return data as Member;
}

export async function apiRegister(
  preferredName: string,
  email: string,
  password: string
): Promise<Member> {
  const res = await fetch(`${base()}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      preferredName: preferredName.trim(),
      email: email.trim().toLowerCase(),
      password,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Registration failed");
  return data as Member;
}

export async function apiChangePassword(
  memberId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${base()}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memberId,
      currentPassword,
      newPassword,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Change password failed");
}

export async function apiDeleteAccount(memberId: string): Promise<void> {
  const res = await fetch(`${base()}/api/auth/delete-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Account deletion failed");
}

export async function apiGetMember(id: string): Promise<Member> {
  const res = await fetch(`${base()}/api/members/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Failed to load member");
  return data as Member;
}

export async function apiUpdateMember(
  id: string,
  updates: { preferredName?: string; email?: string }
): Promise<Member> {
  const res = await fetch(`${base()}/api/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Update failed");
  return data as Member;
}

export async function apiMemberRegistrations(memberId: string): Promise<MemberRegistration[]> {
  const res = await fetch(`${base()}/api/members/${memberId}/registrations`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Failed to load registrations");
  return Array.isArray(data) ? data : [];
}

export async function apiCalendarEvents(): Promise<CalendarEvent[]> {
  const res = await fetch(`${base()}/api/calendar-events?_start=0&_end=500`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Failed to load events");
  return Array.isArray(data) ? data : [];
}

export async function apiCalendarEvent(id: string): Promise<CalendarEvent> {
  const res = await fetch(`${base()}/api/calendar-events/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Event not found");
  return data as CalendarEvent;
}

export async function apiRegisterForEvent(
  eventId: string,
  preferredName: string,
  email: string,
  teamName?: string | null,
  useCredit?: boolean,
): Promise<void> {
  const body: Record<string, string | boolean | undefined> = {
    preferredName: preferredName.trim(),
    email: email.trim() || undefined,
  };
  if (teamName != null && String(teamName).trim()) body.teamName = String(teamName).trim();
  if (useCredit === true) body.useCredit = true;
  const res = await fetch(`${base()}/api/calendar-events/${eventId}/registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Registration failed");
}

export async function apiCreateEventCheckout(params: {
  eventId: string;
  provider: "stripe" | "paypal";
  preferredName: string;
  email: string;
  teamName?: string | null;
  useCredit?: boolean;
}): Promise<{ url?: string; directRegistered?: boolean; registrationId?: string }> {
  const body: Record<string, string | boolean> = {
    provider: params.provider,
    preferredName: params.preferredName.trim(),
    email: params.email.trim(),
  };
  if (params.teamName != null && String(params.teamName).trim()) body.teamName = String(params.teamName).trim();
  if (params.useCredit === true) body.useCredit = true;

  const res = await fetch(`${base()}/api/calendar-events/${params.eventId}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Checkout failed");
  if (data?.directRegistered) return { directRegistered: true, registrationId: data?.registrationId };
  if (!data?.url || typeof data.url !== "string") throw new Error("Checkout URL is missing");
  return { url: data.url as string };
}

export async function apiAnnouncements(start: number, end: number): Promise<{ items: Announcement[]; total: number }> {
  const res = await fetch(`${base()}/api/announcements?_start=${Math.max(0, start)}&_end=${Math.max(0, end)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Failed to load announcements");
  const items = Array.isArray(data) ? (data as Announcement[]) : [];
  const totalHeader = Number(res.headers.get("X-Total-Count") ?? String(items.length));
  return { items, total: Number.isFinite(totalHeader) ? totalHeader : items.length };
}

export async function apiUnreadAnnouncementsCount(sinceISO: string): Promise<number> {
  const res = await fetch(`${base()}/api/announcements/unread-count?since=${encodeURIComponent(sinceISO)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Failed to load unread announcement count");
  return Number(data?.count ?? 0);
}
