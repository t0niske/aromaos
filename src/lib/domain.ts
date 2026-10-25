/* Бизнес-процессы AromaOS (автоматизации из спецификации, раздел 19).
   Модуль без 'server-only': им пользуются и приложение, и скрипт наполнения. */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import * as s from '@/db/schema';
import { addDays, addMonths, today } from './dates';

export type LeadInput = {
  name: string; phone?: string | null; email?: string | null; companyName?: string | null;
  industry?: string | null; areaM2?: number | null; message?: string | null;
  sourceSite?: string; channel?: string; lang?: string; utm?: Record<string, string>;
};

export const normPhone = (p?: string | null) => {
  const d = (p || '').replace(/\D/g, '');
  if (!d) return null;
  // казахстанские номера приводим к +7XXXXXXXXXX
  return '+' + (d.length === 11 && d[0] === '8' ? '7' + d.slice(1) : d.length === 10 ? '7' + d : d);
};

export async function audit(db: DB, userId: number | null, action: string, entity: string, entityId: number | null, data: Record<string, unknown> = {}) {
  await db.insert(s.auditLog).values({ userId, action, entity, entityId, data });
}

/* Распределение лидов по менеджерам: тому, у кого меньше открытых лидов */
export async function pickSalesOwner(db: DB): Promise<number | null> {
  const rows = await db.select({
    id: s.users.id,
    open: sql<number>`(select count(*) from leads l where l.owner_id = "users"."id" and l.stage not in ('won','lost'))`.mapWith(Number),
    recent: sql<number>`(select count(*) from leads l where l.owner_id = "users"."id" and l.created_at > now() - interval '30 days')`.mapWith(Number),
  }).from(s.users).where(and(eq(s.users.role, 'sales'), eq(s.users.active, true))).orderBy(asc(s.users.id));
  if (!rows.length) return null;
  return rows.reduce((a, b) => (b.open < a.open || (b.open === a.open && b.recent < a.recent) ? b : a)).id;
}

/* Новый лид: дубль по телефону → комментарий к открытому лиду; иначе лид + ответственный + задача на 15 минут */
export async function intakeLead(db: DB, input: LeadInput, actorId: number | null = null) {
  const phone = normPhone(input.phone);
  if (phone) {
    const [dup] = await db.select().from(s.leads)
      .where(and(eq(s.leads.phone, phone), inArray(s.leads.stage, ['new', 'qualify', 'survey', 'trial', 'proposal', 'contract']))).limit(1);
    if (dup) {
      await db.insert(s.activities).values({ leadId: dup.id, userId: actorId, kind: 'system', text: `Повторная заявка (${input.sourceSite || 'manual'}): ${input.message || 'без комментария'}` });
      await db.update(s.leads).set({ updatedAt: new Date() }).where(eq(s.leads.id, dup.id));
      return { lead: dup, duplicate: true };
    }
  }
  const ownerId = await pickSalesOwner(db);
  const [lead] = await db.insert(s.leads).values({
    name: input.name.trim(), phone, email: input.email || null, companyName: input.companyName || null,
    industry: input.industry || null, areaM2: input.areaM2 || null, message: input.message || null,
    sourceSite: input.sourceSite || 'manual', channel: input.channel || 'form', lang: input.lang || 'ru',
    utm: input.utm || {}, ownerId,
  }).returning();
  await db.insert(s.tasks).values({
    title: `Связаться с ${lead.name} в течение 15 минут`, assigneeId: ownerId, dueDate: today(),
    priority: 'high', leadId: lead.id, createdById: actorId,
  });
  await audit(db, actorId, 'create', 'lead', lead.id, { source: lead.sourceSite });
  return { lead, duplicate: false };
}

export const STAGES: { id: (typeof s.leadStageEnum.enumValues)[number]; name: string }[] = [
  { id: 'new', name: 'Новый' }, { id: 'qualify', name: 'Квалификация' }, { id: 'survey', name: 'Замер' },
  { id: 'trial', name: 'Бесплатный тест' }, { id: 'proposal', name: 'КП' }, { id: 'contract', name: 'Договор' },
  { id: 'won', name: 'Выиграно' }, { id: 'lost', name: 'Проиграно' },
];

export const TRIAL_DAYS = 3;

/* Сделка закрыта (выиграна или проиграна) — задачи продажи по лиду больше не нужны */
async function closeLeadTasks(db: DB, leadId: number) {
  await db.update(s.tasks).set({ status: 'done' }).where(and(eq(s.tasks.leadId, leadId), inArray(s.tasks.status, ['todo', 'doing'])));
}

export async function moveLead(db: DB, leadId: number, stage: (typeof s.leadStageEnum.enumValues)[number], actorId: number | null, lostReason?: string) {
  const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, leadId));
  if (!lead || lead.stage === stage) return lead;
  const patch: Partial<typeof s.leads.$inferInsert> = { stage, updatedAt: new Date() };
  if (stage === 'lost') {
    patch.lostReason = lostReason || lead.lostReason || 'не указана';
    await closeLeadTasks(db, leadId);
  }
  if (stage === 'trial') {
    patch.trialUntil = addDays(today(), TRIAL_DAYS);
    await db.insert(s.tasks).values({
      title: `Тест у ${lead.companyName || lead.name}: позвонить за день до конца`, assigneeId: lead.ownerId,
      dueDate: addDays(today(), TRIAL_DAYS - 1), priority: 'high', leadId, createdById: actorId,
    });
  }
  await db.update(s.leads).set(patch).where(eq(s.leads.id, leadId));
  const from = STAGES.find(x => x.id === lead.stage)?.name, to = STAGES.find(x => x.id === stage)?.name;
  await db.insert(s.activities).values({ leadId, userId: actorId, kind: 'stage', text: `${from} → ${to}${stage === 'lost' ? ` (${patch.lostReason})` : ''}` });
  await audit(db, actorId, 'stage', 'lead', leadId, { from: lead.stage, to: stage });
  return { ...lead, ...patch };
}

/* Подписка: цена в месяц из тарифа и скидки, срок, график визитов */
export async function createSubscription(db: DB, o: {
  objectId: number; tariffId: number; startDate?: string; discountPct?: number;
  status?: (typeof s.subStatusEnum.enumValues)[number]; withInstall?: boolean; employeeId?: number | null;
}) {
  const [t] = await db.select().from(s.tariffs).where(eq(s.tariffs.id, o.tariffId));
  if (!t) throw new Error('Тариф не найден');
  const start = o.startDate || today();
  const discount = o.discountPct || 0;
  const [sub] = await db.insert(s.subscriptions).values({
    objectId: o.objectId, tariffId: t.id, periodMonths: t.periodMonths,
    priceMonth: Math.round((t.priceTotal / t.periodMonths) * (100 - discount) / 100),
    startDate: start, endDate: addMonths(start, t.periodMonths), status: o.status || 'active',
    visitsPerMonth: t.visitsPerMonth, discountPct: discount,
  }).returning();
  await scheduleVisits(db, sub, { withInstall: o.withInstall ?? true, employeeId: o.employeeId ?? null });
  return sub;
}

export async function scheduleVisits(db: DB, sub: typeof s.subscriptions.$inferSelect, o: { withInstall: boolean; employeeId: number | null }) {
  const rows: (typeof s.visits.$inferInsert)[] = [];
  if (o.withInstall) rows.push({ objectId: sub.objectId, subscriptionId: sub.id, type: 'install', plannedDate: sub.startDate, employeeId: o.employeeId });
  const step = Math.max(1, Math.round(30 / sub.visitsPerMonth));
  for (let d = addDays(sub.startDate, step); d < sub.endDate; d = addDays(d, step))
    rows.push({ objectId: sub.objectId, subscriptionId: sub.id, type: 'service', plannedDate: d, employeeId: o.employeeId });
  if (rows.length) await db.insert(s.visits).values(rows);
}

/* Сделка выиграна: клиент, контакт, объект, подписка, установка, аппарат, задачи онбординга */
export async function winLead(db: DB, leadId: number, o: { tariffId: number; objectName?: string; address?: string; startDate?: string; discountPct?: number }, actorId: number | null) {
  const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, leadId));
  if (!lead) throw new Error('Лид не найден');
  let companyId = lead.companyId;
  if (!companyId) {
    const [c] = await db.insert(s.companies).values({
      name: lead.companyName || lead.name, industry: lead.industry, phone: lead.phone, email: lead.email,
      lang: lead.lang, ownerId: lead.ownerId,
    }).returning();
    companyId = c.id;
    await db.insert(s.contacts).values({ companyId, name: lead.name, phone: lead.phone, email: lead.email, isDecisionMaker: true });
  }
  const [obj] = await db.insert(s.objects).values({
    companyId, name: o.objectName || lead.companyName || lead.name, type: lead.industry, address: o.address || null, areaM2: lead.areaM2,
  }).returning();
  const service = await serviceTech(db);
  const sub = await createSubscription(db, { objectId: obj.id, tariffId: o.tariffId, startDate: o.startDate, discountPct: o.discountPct, employeeId: service });
  const [t] = await db.select().from(s.tariffs).where(eq(s.tariffs.id, o.tariffId));
  const [dev] = await db.select().from(s.devices).where(and(eq(s.devices.modelId, t.modelId), eq(s.devices.status, 'stock'))).orderBy(asc(s.devices.id)).limit(1);
  if (dev) {
    await db.update(s.devices).set({ status: 'client', objectId: obj.id }).where(eq(s.devices.id, dev.id));
    await db.insert(s.deviceEvents).values({ deviceId: dev.id, userId: actorId, text: `Выдан на объект: ${obj.name}` });
  }
  await db.update(s.leads).set({ stage: 'won', companyId, expectedMrr: sub.priceMonth, updatedAt: new Date() }).where(eq(s.leads.id, leadId));
  await closeLeadTasks(db, leadId);
  await db.insert(s.activities).values({ leadId, userId: actorId, kind: 'stage', text: `Выиграно: подписка ${sub.priceMonth.toLocaleString('ru-RU')} ₸/мес` });
  const owner = lead.ownerId;
  await db.insert(s.tasks).values([
    { title: 'Подписать договор и выставить первый счёт', assigneeId: owner, dueDate: today(), priority: 'high', companyId, objectId: obj.id, createdById: actorId },
    { title: 'Позвонить через неделю после установки: нравится ли аромат', assigneeId: owner, dueDate: addDays(sub.startDate, 7), companyId, objectId: obj.id, createdById: actorId },
    { title: 'Запросить отзыв в 2ГИС через месяц', assigneeId: owner, dueDate: addDays(sub.startDate, 30), priority: 'low', companyId, objectId: obj.id, createdById: actorId },
  ]);
  await audit(db, actorId, 'win', 'lead', leadId, { companyId, objectId: obj.id, subscriptionId: sub.id });
  return { companyId, objectId: obj.id, subscriptionId: sub.id };
}

export async function serviceTech(db: DB): Promise<number | null> {
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.role, 'tech'), eq(s.users.active, true))).orderBy(asc(s.users.id)).limit(1);
  return u?.id ?? null;
}

/* Визит выполнен: оценка ≤ 3 → задача руководителю сервиса */
export async function completeVisit(db: DB, visitId: number, o: { oilMl?: number | null; rating?: number | null; comment?: string | null; checklist?: Record<string, boolean> }, actorId: number | null) {
  const [v] = await db.update(s.visits).set({
    status: 'done', doneAt: new Date(), oilMl: o.oilMl ?? null, rating: o.rating ?? null, comment: o.comment ?? null, checklist: o.checklist ?? {},
  }).where(eq(s.visits.id, visitId)).returning();
  if (v && v.rating && v.rating <= 3) {
    const [head] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, 'service_head')).limit(1);
    const [obj] = await db.select().from(s.objects).where(eq(s.objects.id, v.objectId));
    await db.insert(s.tasks).values({
      title: `Низкая оценка визита (${v.rating}/5): ${obj?.name} — разобраться`, assigneeId: head?.id ?? null,
      dueDate: addDays(today(), 1), priority: 'high', objectId: v.objectId, companyId: obj?.companyId, createdById: actorId,
    });
  }
  await audit(db, actorId, 'complete', 'visit', visitId, { rating: o.rating });
  return v;
}

/* Подписки, у которых скоро конец — задача на продление (запускать раз в день) */
export async function renewalSweep(db: DB) {
  const horizon = addDays(today(), 30);
  const due = await db.select({ sub: s.subscriptions, obj: s.objects, owner: s.companies.ownerId })
    .from(s.subscriptions).innerJoin(s.objects, eq(s.objects.id, s.subscriptions.objectId))
    .innerJoin(s.companies, eq(s.companies.id, s.objects.companyId))
    .where(and(eq(s.subscriptions.status, 'active'), sql`${s.subscriptions.endDate} <= ${horizon}`,
      // уже продлённые (есть следующая подписка на объект) не трогаем
      sql`not exists (select 1 from subscriptions n where n.object_id = ${s.subscriptions.objectId} and n.id <> ${s.subscriptions.id} and n.start_date >= ${s.subscriptions.endDate})`));
  for (const { sub, obj, owner } of due) {
    await db.update(s.subscriptions).set({ status: 'renewing' }).where(eq(s.subscriptions.id, sub.id));
    await db.insert(s.tasks).values({
      title: `Продление: ${obj.name}, подписка до ${sub.endDate}`, assigneeId: owner, dueDate: today(),
      priority: 'high', objectId: obj.id, companyId: obj.companyId,
    });
  }
  return due.length;
}

