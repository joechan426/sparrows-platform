export type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

let calendarEventsCache: CacheEntry<unknown> | null = null;
const memberRegistrationsCache = new Map<string, CacheEntry<unknown>>();
const CALENDAR_KEY = "web_cache_calendar_events_v1";
const MEMBER_KEY_PREFIX = "web_cache_member_regs_v1:";

function readSession<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage write errors
  }
}

export function getCalendarEventsCache<T>(): CacheEntry<T> | null {
  if (calendarEventsCache) return calendarEventsCache as CacheEntry<T> | null;
  const fromSession = readSession<T>(CALENDAR_KEY);
  if (fromSession) {
    calendarEventsCache = fromSession as CacheEntry<unknown>;
    return fromSession;
  }
  return null;
}

export function setCalendarEventsCache<T>(value: T): void {
  const entry = { value, updatedAt: Date.now() };
  calendarEventsCache = entry;
  writeSession(CALENDAR_KEY, entry);
}

export function getMemberRegistrationsCache<T>(memberId: string): CacheEntry<T> | null {
  const inMemory = memberRegistrationsCache.get(memberId) as CacheEntry<T> | undefined;
  if (inMemory) return inMemory;
  const fromSession = readSession<T>(`${MEMBER_KEY_PREFIX}${memberId}`);
  if (fromSession) {
    memberRegistrationsCache.set(memberId, fromSession as CacheEntry<unknown>);
    return fromSession;
  }
  return null;
}

export function setMemberRegistrationsCache<T>(memberId: string, value: T): void {
  const entry = { value, updatedAt: Date.now() };
  memberRegistrationsCache.set(memberId, entry);
  writeSession(`${MEMBER_KEY_PREFIX}${memberId}`, entry);
}

