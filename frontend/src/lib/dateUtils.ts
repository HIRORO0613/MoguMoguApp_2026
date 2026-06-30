/** YYYY-MM-DD in Asia/Tokyo */
export function tokyoDateKey(date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatDateFull(isoString: string): string {
  return new Date(isoString).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateRangeDays(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: tokyoDateKey(start), end: tokyoDateKey(end) };
}

export function dateRange30Days(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const end = endDate ?? tokyoDateKey();
  const start = startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return tokyoDateKey(d);
  })();
  return { start, end };
}

/** Group items by Tokyo date key, sorted newest first */
export function groupByDate<T extends { timestamp: string }>(
  items: T[]
): { dateKey: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = tokyoDateKey(new Date(item.timestamp));
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([dateKey, its]) => ({ dateKey, items: its }));
}
