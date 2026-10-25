/* Приём заявок с сайтов: POST /api/public/leads
   Заголовок X-Site-Key — ключ сайта (Настройки → «Приём заявок»). Тело — JSON или форма:
   { name, phone, email?, company?, industry?, area?, message?, lang?, channel?, utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, website? }
   website — скрытое поле-ловушка для ботов, у людей пустое. Сайты пока не подключены. */
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, t } from '@/db';
import { intakeLead } from '@/lib/domain';

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  company: z.string().trim().max(160).optional(),
  industry: z.string().trim().max(80).optional(),
  area: z.coerce.number().int().min(0).max(100_000).optional(),
  message: z.string().trim().max(2000).optional(),
  lang: z.enum(['ru', 'kk', 'en']).optional(),
  channel: z.string().trim().max(32).optional(),
  website: z.string().max(500).optional(), // ловушка: у людей пустая
}).passthrough();

// простое ограничение частоты: 10 заявок в минуту с одного адреса
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(x => now - x < 60_000);
  list.push(now); hits.set(ip, list);
  return list.length > 10;
}

async function allowedOrigins() {
  const db = await getDb();
  const keys = await db.select({ o: t.apiKeys.allowedOrigins }).from(t.apiKeys).where(eq(t.apiKeys.active, true));
  return new Set(keys.flatMap(k => k.o));
}

function cors(origin: string | null, ok: boolean): Record<string, string> {
  return ok && origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Site-Key', Vary: 'Origin' } : {};
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ok = !!origin && (await allowedOrigins()).has(origin);
  return new NextResponse(null, { status: ok ? 204 : 403, headers: cors(origin, ok) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const fail = (status: number, error: string, h: Record<string, string> = {}) => NextResponse.json({ ok: false, error }, { status, headers: h });

  const key = req.headers.get('x-site-key');
  if (!key) return fail(401, 'Нет ключа сайта');
  const db = await getDb();
  const [k] = await db.select().from(t.apiKeys)
    .where(and(eq(t.apiKeys.keyHash, createHash('sha256').update(key).digest('hex')), eq(t.apiKeys.active, true)));
  if (!k) return fail(401, 'Неверный ключ сайта');
  if (origin && !k.allowedOrigins.includes(origin)) return fail(403, 'Домен не разрешён');
  const h = cors(origin, true);
  if (limited(ip)) return fail(429, 'Слишком много заявок, попробуйте через минуту', h);

  let raw: unknown;
  try {
    raw = (req.headers.get('content-type') ?? '').includes('application/json') ? await req.json() : Object.fromEntries(await req.formData());
  } catch { return fail(400, 'Не удалось прочитать заявку', h); }
  const p = Body.safeParse(raw);
  if (!p.success) return fail(422, 'Проверьте имя и телефон', h);
  if (!p.data.phone && !p.data.email) return fail(422, 'Нужен телефон или почта', h);
  // бот заполнил ловушку — отвечаем «успехом», но ничего не создаём
  if (p.data.website) return NextResponse.json({ ok: true }, { headers: h });

  const rawUtm = raw as Record<string, unknown>;
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    .filter(x => typeof rawUtm[x] === 'string' && rawUtm[x]).map(x => [x, String(rawUtm[x]).slice(0, 120)]));
  const { lead, duplicate } = await intakeLead(db, {
    name: p.data.name, phone: p.data.phone, email: p.data.email || null, companyName: p.data.company, industry: p.data.industry,
    areaM2: p.data.area, message: p.data.message, lang: p.data.lang, channel: p.data.channel || 'form', sourceSite: k.site, utm,
  });
  await db.update(t.apiKeys).set({ lastUsedAt: new Date() }).where(eq(t.apiKeys.id, k.id));
  return NextResponse.json({ ok: true, id: lead.id, duplicate }, { status: 201, headers: h });
}
