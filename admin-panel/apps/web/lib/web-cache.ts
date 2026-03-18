export type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

let calendarEventsCache: CacheEntry<unknown> | null = null;
const memberRegistrationsCache = new Map<string, CacheEntry<unknown>>();

export function getCalendarEventsCache<T>(): CacheEntry<T> | null {
  return calendarEventsCache as CacheEntry<T> | null;
}

export function setCalendarEventsCache<T>(value: T): void {
  calendarEventsCache = { value, updatedAt: Date.now() };
}

export function getMemberRegistrationsCache<T>(memberId: string): CacheEntry<T> | null {
  return (memberRegistrationsCache.get(memberId) as CacheEntry<T> | undefined) ?? null;
}

export function setMemberRegistrationsCache<T>(memberId: string, value: T): void {
  memberRegistrationsCache.set(memberId, { value, updatedAt: Date.now() });
}

