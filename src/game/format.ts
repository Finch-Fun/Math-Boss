export function fmtNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return Math.round(n).toLocaleString('en-US');
}

export function fmtDps(n: number): string {
  if (n >= 1e4) return fmtNum(n);
  return n.toFixed(n < 10 ? 2 : 1);
}

export const fmtPct = (fraction: number): string => `${Math.round(fraction * 100)}%`;
