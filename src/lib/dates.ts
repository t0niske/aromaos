/* Даты в формате 'YYYY-MM-DD' по времени Астаны (UTC+5) — так их хранит база (тип date). */
const TZ_OFFSET_MIN = 5 * 60;

export function today(): string {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function addMonths(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z');
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

export function monthStart(d = today()): string {
  return d.slice(0, 8) + '01';
}
