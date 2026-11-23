// Timezone-aware calendar helpers (IANA zones via Intl). Pure and deterministic: the trusted server uses these with the
// classroom's timezone, so day and week boundaries never depend on the server's or the browser's local zone.
// Daylight-saving: boundaries are computed from calendar dates, never by adding 24h or 7x24h, so a week that contains a
// clock change is 167 or 169 hours long and still ends at Monday 12:00 AM local time.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz).format(0);
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(t: number, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(t))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** UTC offset (ms) of the zone at instant t: local wall-clock minus UTC. */
function offsetAt(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(t / 1000) * 1000;
}

/** The instant at which the zone's wall clock reads the given local time. A time that does not exist (spring-forward gap) resolves forward. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, tz: string): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let t = wall - offsetAt(wall, tz);
  t = wall - offsetAt(t, tz);
  // One more pass settles instants right next to a transition.
  t = wall - offsetAt(t, tz);
  return t;
}

/** Midnight (start of the local calendar day) for the calendar date y-m-d. Month/day may overflow; Date.UTC normalizes them. */
function midnightOfDate(y: number, m: number, d: number, tz: string): number {
  const n = new Date(Date.UTC(y, m - 1, d));
  return zonedToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 0, 0, 0, tz);
}

/** Monday = 0 ... Sunday = 6, in the zone. */
export function weekdayIndexZ(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

export function dayStartZ(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return midnightOfDate(p.year, p.month, p.day, tz);
}

/** Monday 12:00 AM local on or before t. */
export function weekStartZ(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return midnightOfDate(p.year, p.month, p.day - weekdayIndexZ(t, tz), tz);
}

/** The following Monday 12:00 AM local. */
export function weekEndZ(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return midnightOfDate(p.year, p.month, p.day - weekdayIndexZ(t, tz) + 7, tz);
}

/** Start of the local day `n` calendar days after the day containing t. */
export function addDaysZ(t: number, n: number, tz: string): number {
  const p = zonedParts(t, tz);
  return midnightOfDate(p.year, p.month, p.day + n, tz);
}
