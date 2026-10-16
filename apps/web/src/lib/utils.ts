import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's class merger: conditional classes + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact relative time ("3m ago") without pulling in a formatting library. */
export function relativeTime(input: string | Date, now: Date = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const seconds = Math.round(Math.abs(diffMs) / 1000);

  const units: Array<[number, string]> = [
    [60, 's'],
    [3600, 'm'],
    [86400, 'h'],
    [604800, 'd'],
    [2592000, 'w'],
  ];

  let value = seconds;
  let label = 's';
  for (let i = 0; i < units.length; i += 1) {
    const [limit, unitLabel] = units[i]!;
    if (seconds < limit) {
      label = unitLabel;
      value = i === 0 ? seconds : Math.round(seconds / units[i - 1]![0]);
      break;
    }
    label = unitLabel;
    value = Math.round(seconds / limit);
  }

  if (seconds < 5) return 'just now';
  return future ? `in ${value}${label}` : `${value}${label} ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—';
}
