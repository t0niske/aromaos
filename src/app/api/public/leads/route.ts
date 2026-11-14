/* Приём заявок с сайтов: POST /api/public/leads
   Сайт шлёт форму на свой же адрес (/api/lead), nginx на сервере пересылает сюда и добавляет X-Site-Key —
   в коде сайтов адреса системы нет. Ключи — в .env на сервере: LEAD_KEYS=vdokh:<ключ>,tynys:<ключ>…
   Тело JSON: { name?, phone, space?, page?, message?, src?, website? } — website — ловушка для ботов, у людей пустая;
   src — откуда пришёл человек ({ ref, landing, utm }), см. lib/lead-source; visitor_id / visit_id — заход на сайт (lib/web-collect). */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { intakeLead } from '@/lib/domain';
import { describeSource } from '@/lib/lead-source';
import { linkLeadToVisit } from '@/lib/web-collect';
import { notifyNewLead } from '@/lib/telegram';

const Body = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(10).max(32),
  space: z.string().trim().max(120).optional(),
  page: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  src: z.object({
    ref: z.string().max(300).optional(),
    landing: z.string().max(300).optional(),
    utm: z.record(z.string(), z.string().max(200)).optional(),
  }).optional().catch(undefined), // кривой src не должен ронять заявку
  website: z.string().max(500).optional(),
  visitor_id: z.string().max(40).optional().catch(undefined), // счётчик заходов: cookie ar_vid / ar_sid — «Путь клиента» в карточке
  visit_id: z.string().max(40).optional().catch(undefined),
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
    name: p.data.name || 'Без имени', phone: p.data.phone, industry: p.data.space, message, channel: 'form', sourceSite: site, utm: describeSource(p.data.src),
  });
  await linkLeadToVisit(db, lead.id, p.data.visitor_id, p.data.visit_id).catch(e => console.error('lead visit link', e));
  await notifyNewLead(lead.id, duplicate).catch(e => console.error('telegram notify', e)); // заявка уже сохранена — бот не должен её ронять
  return NextResponse.json({ ok: true, id: lead.id, duplicate }, { status: 201 });
}
