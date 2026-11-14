/* Приём данных счётчика сайта (docs/web-visits.md): view / event / ping / leave → web_visits, web_pages, web_events.
   Ошибки в данных молча пропускаем — счётчику нечего с ними делать. */
import { and, count, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import * as s from '@/db/schema';
import { classifyVisit, webDevice, webSource } from './web-detect';

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid', 'fbclid'];
const EVENT_NAMES = new Set(['tel', 'wa', 'form_open', 'form_view', 'form_start', 'form_error', 'lead', 'scroll', 'out', 'file', 'scent', 'model', 'faq', 'osi', 'space']);

export type Meta = { site: string; ip: string | null; userAgent: string | null };
type Msg = Record<string, unknown>;

async function visitBySid(db: DB, sid: string) {
  const [v] = await db.select().from(s.webVisits).where(eq(s.webVisits.sid, sid)).limit(1);
  return v ?? null;
}
async function pageOf(db: DB, visitId: number, pid: string) {
  const [p] = await db.select().from(s.webPages).where(and(eq(s.webPages.visitId, visitId), eq(s.webPages.pid, pid))).limit(1);
  return p ?? null;
}

async function onView(db: DB, m: Msg, meta: Meta, vid: string, sid: string, pid: string) {
  const path = str(m.path, 300) || '/';
  const title = str(m.title, 200) || null;
  let visit = await visitBySid(db, sid);
  if (!visit) {
    const utmIn = (m.utm && typeof m.utm === 'object' ? m.utm : {}) as Record<string, unknown>;
    const utm = Object.fromEntries(UTM_KEYS.map(k => [k, str(utmIn[k], 200)]).filter(([, v]) => v));
    const ref = str(m.ref, 300);
    const screen = /^\d{2,5}x\d{2,5}$/.test(str(m.screen, 20)) ? str(m.screen, 20) : null;
    const touch = m.touch === true, webdriver = m.wd === true;
    const [{ n }] = await db.select({ n: count() }).from(s.webVisits).where(and(eq(s.webVisits.vid, vid), eq(s.webVisits.site, meta.site)));
    const first = classifyVisit({ userAgent: meta.userAgent, webdriver, activeSeconds: 0, eventsCount: 0, hasLeave: false, lastPingAt: null }, 0, false);
    [visit] = await db.insert(s.webVisits).values({
      site: meta.site, sid, vid, number: n + 1, source: webSource(utm, ref), referrer: ref || null, utm, landing: path,
      ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) ?? null, ...webDevice(meta.userAgent, touch, screen),
      screen, lang: str(m.lang, 20) || null, tz: str(m.tz, 50) || null, touch, webdriver, ym: str(m.ym, 30) || null,
      kind: first.kind, reasons: first.reasons.join('; ') || null,
    }).onConflictDoNothing().returning();
    visit ??= (await visitBySid(db, sid))!; // два первых запроса пришли одновременно
  } else if (!visit.ym && str(m.ym, 30)) {
    await db.update(s.webVisits).set({ ym: str(m.ym, 30) }).where(eq(s.webVisits.id, visit.id));
  }
  if (!(await pageOf(db, visit.id, pid))) {
    await db.insert(s.webPages).values({ visitId: visit.id, pid, path, title });
    await db.update(s.webVisits).set({ pages: sql`${s.webVisits.pages} + 1`, lastAt: new Date() }).where(eq(s.webVisits.id, visit.id));
  }
}

async function onEvent(db: DB, m: Msg, sid: string, pid: string) {
  const name = str(m.name, 20);
  if (!EVENT_NAMES.has(name)) return;
  const visit = await visitBySid(db, sid);
  if (!visit) return;
  const page = await pageOf(db, visit.id, pid);
  const data = str(m.data, 200) || null;
  await db.insert(s.webEvents).values({ visitId: visit.id, pageId: page?.id ?? null, name, data });
  const set: Partial<typeof s.webVisits.$inferInsert> = { lastAt: new Date() };
  if (name === 'tel') set.hasTel = true;
  if (name === 'wa') set.hasWa = true;
  if (name === 'form_open' || name === 'form_start') set.hasForm = true;
  if (name === 'lead' && data && /^\d{1,9}$/.test(data) && !visit.leadId) {
    const [lead] = await db.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.id, +data)).limit(1);
    if (lead) set.leadId = lead.id;
  }
  await db.update(s.webVisits).set({ ...set, eventsCount: sql`${s.webVisits.eventsCount} + 1` }).where(eq(s.webVisits.id, visit.id));
}

async function onPing(db: DB, sid: string) {
  const now = new Date();
  await db.update(s.webVisits).set({ lastPingAt: now, lastAt: now }).where(eq(s.webVisits.sid, sid));
}

async function onLeave(db: DB, m: Msg, sid: string, pid: string) {
  const visit = await visitBySid(db, sid);
  if (!visit) return;
  const page = await pageOf(db, visit.id, pid);
  const active = Math.max(0, Math.min(6 * 3600, Math.round(Number(m.active) || 0)));
  const scroll = Math.max(0, Math.min(100, Math.round(Number(m.scroll) || 0)));
  if (page) {
    await db.update(s.webPages).set({ activeSeconds: Math.max(page.activeSeconds, active), scroll: Math.max(page.scroll, scroll) }).where(eq(s.webPages.id, page.id));
  }
  await db.update(s.webVisits).set({
    hasLeave: true, lastAt: new Date(),
    activeSeconds: sql`(select coalesce(sum(${s.webPages.activeSeconds}), 0) from ${s.webPages} where ${s.webPages.visitId} = ${visit.id})`,
  }).where(eq(s.webVisits.id, visit.id));
}

/* Пачка сообщений от счётчика */
export async function collect(db: DB, body: unknown, meta: Meta) {
  const list = (Array.isArray(body) ? body : [body]).slice(0, 50);
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Msg;
    const vid = str(m.vid, 40), sid = str(m.sid, 40), pid = str(m.pid, 40);
    if (!ID.test(vid) || !ID.test(sid) || !ID.test(pid)) continue;
    try {
      if (m.t === 'view') await onView(db, m, meta, vid, sid, pid);
      else if (m.t === 'event') await onEvent(db, m, sid, pid);
      else if (m.t === 'ping') await onPing(db, sid);
      else if (m.t === 'leave') await onLeave(db, m, sid, pid);
    } catch (e) { console.error('web collect', e); }
  }
  await maintain(db).catch(e => console.error('web maintain', e));
}

/* Раз в 10 минут: окончательно классифицируем законченные заходы и удаляем старые без заявки (90 дней) */
const g = globalThis as unknown as { __webMaintainAt?: number };
async function maintain(db: DB) {
  if (Date.now() - (g.__webMaintainAt ?? 0) < 10 * 60_000) return;
  g.__webMaintainAt = Date.now();
  const done = await db.select().from(s.webVisits)
    .where(and(eq(s.webVisits.checked, false), lt(s.webVisits.lastAt, new Date(Date.now() - 30 * 60_000)))).limit(500);
  for (const v of done) {
    const [{ n }] = await db.select({ n: count() }).from(s.webPages)
      .where(and(eq(s.webPages.visitId, v.id), lt(s.webPages.openedAt, new Date(v.startedAt.getTime() + 5 * 60_000))));
    const c = classifyVisit(v, n, true);
    await db.update(s.webVisits).set({ kind: c.kind, reasons: c.reasons.join('; ') || null, checked: true }).where(eq(s.webVisits.id, v.id));
  }
  await db.delete(s.webVisits).where(and(isNull(s.webVisits.leadId), lt(s.webVisits.startedAt, new Date(Date.now() - 90 * 864e5))));
}

/* Связь заявки с заходом: заявка пришла с ar_vid / ar_sid — помечаем заход и запоминаем посетителя у заявки */
export async function linkLeadToVisit(db: DB, leadId: number, vid?: string, sid?: string) {
  if (vid && ID.test(vid)) {
    await db.update(s.leads).set({ visitorId: vid }).where(and(eq(s.leads.id, leadId), isNull(s.leads.visitorId)));
  }
  if (sid && ID.test(sid)) {
    await db.update(s.webVisits).set({ leadId }).where(and(eq(s.webVisits.sid, sid), isNull(s.webVisits.leadId)));
  } else if (vid && ID.test(vid)) {
    // без sid — последний заход посетителя за последний час
    const [v] = await db.select({ id: s.webVisits.id }).from(s.webVisits)
      .where(and(eq(s.webVisits.vid, vid), isNull(s.webVisits.leadId), gte(s.webVisits.lastAt, new Date(Date.now() - 3600_000))))
      .orderBy(sql`${s.webVisits.lastAt} desc`).limit(1);
    if (v) await db.update(s.webVisits).set({ leadId }).where(eq(s.webVisits.id, v.id));
  }
}
