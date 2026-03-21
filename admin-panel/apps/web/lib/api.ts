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
  /** Present when loaded from API; count of APPROVED registrations */
  approvedCount?: number;
};

export type MemberRegistration = {
  id: string;
  status: string;
  teamName: string | null;
  createdAt: string;
  event: CalendarEvent | null;
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
  teamName?: string | null
): Promise<void> {
  const body: Record<string, string | undefined> = {
    preferredName: preferredName.trim(),
    email: email.trim() || undefined,
  };
  if (teamName != null && String(teamName).trim()) body.teamName = String(teamName).trim();
  const res = await fetch(`${base()}/api/calendar-events/${eventId}/registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Registration failed");
}
