/* Приём заявок с сайтов: POST /api/public/leads
   Сайт шлёт форму на свой же адрес (/api/lead), nginx на сервере пересылает сюда и добавляет X-Site-Key —
   в коде сайтов адреса системы нет. Ключи — в .env на сервере: LEAD_KEYS=vdokh:<ключ>,tynys:<ключ>…
   Тело JSON: { name?, phone, space?, page?, message?, website? } — website — ловушка для ботов, у людей пустая. */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { intakeLead } from '@/lib/domain';

const Body = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(10).max(32),
  space: z.string().trim().max(120).optional(),
  page: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().max(500).optional(),
});

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

// простое ограничение частоты: 5 заявок в минуту с одного адреса
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(x => now - x < 60_000);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

export async function POST(req: NextRequest) {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  const site = siteFor(req.headers.get('x-site-key'));
  if (!site) return fail(401, 'Неверный ключ сайта');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limited(ip)) return fail(429, 'Слишком много заявок, попробуйте через минуту');

  let raw: unknown;
  try { raw = await req.json(); } catch { return fail(400, 'Не удалось прочитать заявку'); }
  const p = Body.safeParse(raw);
  if (!p.success) return fail(422, 'Проверьте телефон');
  if (p.data.website) return NextResponse.json({ ok: true }); // бот заполнил ловушку — ничего не создаём

  const message = [p.data.message, p.data.space && `Пространство: ${p.data.space}`, p.data.page && `Страница: ${p.data.page}`].filter(Boolean).join('\n');
  const db = await getDb();
  const { lead, duplicate } = await intakeLead(db, {
    name: p.data.name || 'Без имени', phone: p.data.phone, industry: p.data.space, message, channel: 'form', sourceSite: site,
  });
  return NextResponse.json({ ok: true, id: lead.id, duplicate }, { status: 201 });
}
