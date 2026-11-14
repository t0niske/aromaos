/* Приём данных счётчика заходов: POST /api/public/visits
   Сайт шлёт на свой адрес /api/visit (navigator.sendBeacon, text/plain), nginx на домене сайта пересылает сюда
   с X-Site-Key (как заявки) и X-Site-Host — домен сайта, чтобы отбросить запросы с чужих страниц.
   Ответ всегда 204 без тела. Не больше 8 КБ на запрос и 120 запросов в минуту с одного адреса. */
import { timingSafeEqual } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { getDb } from '@/db';
import { collect } from '@/lib/web-collect';

function siteFor(key: string | null) {
  if (!key) return null;
  for (const pair of (process.env.LEAD_KEYS || '').split(',')) {
    const [site, k] = pair.split(':');
    if (!site || !k) continue;
    const a = Buffer.from(key), b = Buffer.from(k);
    if (a.length === b.length && timingSafeEqual(a, b)) return site.trim();
  }
  return null;
}

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(x => now - x < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => now - x < 60_000)) hits.delete(k);
  return list.length > 120;
}

const hostOf = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

export async function POST(req: NextRequest) {
  const done = new Response(null, { status: 204 });
  const site = siteFor(req.headers.get('x-site-key'));
  if (!site) return done;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  if (limited(ip || 'local')) return done;
  // чужая страница (Origin/Referer не с домена сайта) — отбрасываем
  const siteHost = (req.headers.get('x-site-host') || '').replace(/^www\./, '');
  const from = hostOf(req.headers.get('origin')) || hostOf(req.headers.get('referer'));
  if (siteHost && from && from !== siteHost) return done;

  const text = await req.text().catch(() => '');
  if (!text || text.length > 8192) return done;
  let body: unknown;
  try { body = JSON.parse(text); } catch { return done; }
  const db = await getDb();
  await collect(db, body, { site, ip, userAgent: req.headers.get('user-agent') });
  return done;
}
