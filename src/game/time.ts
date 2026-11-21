import { DAY } from './constants';

// All boundaries use the local timezone via Date's local constructors, so DST shifts are handled by the platform.
export function dayStart(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(dayStartTs: number, n: number): number {
  const d = new Date(dayStartTs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Monday = 0 ... Sunday = 6 */
export function weekdayIndex(t: number): number {
  return (new Date(t).getDay() + 6) % 7;
}

export function weekStartOf(t: number): number {
  return addDays(dayStart(t), -weekdayIndex(t));
}

export function weekEndOf(t: number): number {
  return addDays(weekStartOf(t), 7);
}

export function dayIndexAbs(t: number): number {
  return Math.round(dayStart(t) / DAY);
}

export function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtGameTime(t: number): string {
  return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
