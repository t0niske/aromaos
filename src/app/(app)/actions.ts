'use server';
/* Серверные действия разделов: клиенты, объекты, подписки, визиты, оборудование, задачи, настройки */
import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { addDays, addMonths, today } from '@/lib/dates';
import { audit, completeVisit, createSubscription, renewalSweep } from '@/lib/domain';
import { hashPassword } from '@/lib/password';

type FormState = { error?: string; ok?: string };
const optStr = z.preprocess(v => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().nullable());
const optInt = z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().nonnegative().nullable());
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажите дату');
const parse = <T extends z.ZodTypeAny>(schema: T, form: FormData) => schema.safeParse(Object.fromEntries(form));

/* ── Клиенты ── */
export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('clients');
  const p = parse(z.object({
    name: z.string().trim().min(2, 'Название'), legalForm: z.string().default('ТОО'), bin: optStr, industry: optStr, phone: optStr, email: optStr,
    contactName: optStr, isChain: z.string().optional(),
  }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.bin && !/^\d{12}$/.test(p.data.bin)) return { error: 'БИН/ИИН — 12 цифр' };
  const db = await getDb();
  const [c] = await db.insert(t.companies).values({ ...p.data, isChain: !!p.data.isChain, ownerId: user.id }).returning();
  if (p.data.contactName) await db.insert(t.contacts).values({ companyId: c.id, name: p.data.contactName, phone: p.data.phone, email: p.data.email, isDecisionMaker: true });
  await audit(db, user.id, 'create', 'company', c.id);
  redirect(`/clients/${c.id}`);
}

export async function updateCompany(id: number, form: FormData) {
  const user = await requireUser('clients');
  const p = z.object({ name: z.string().trim().min(2), legalForm: z.string(), bin: optStr, industry: optStr, phone: optStr, email: optStr, notes: optStr, vatPayer: z.string().optional(), isGov: z.string().optional() }).parse(Object.fromEntries(form));
  const db = await getDb();
  await db.update(t.companies).set({ ...p, vatPayer: !!p.vatPayer, isGov: !!p.isGov }).where(eq(t.companies.id, id));
  await audit(db, user.id, 'update', 'company', id);
  refresh();
}

export async function addContact(companyId: number, form: FormData) {
  await requireUser('clients');
  const p = z.object({ name: z.string().trim().min(2), position: optStr, phone: optStr, email: optStr, isDecisionMaker: z.string().optional() }).parse(Object.fromEntries(form));
  await (await getDb()).insert(t.contacts).values({ companyId, ...p, isDecisionMaker: !!p.isDecisionMaker });
  refresh();
}

/* ── Объекты ── */
export async function createObject(companyId: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('objects');
  const p = parse(z.object({ name: z.string().trim().min(2, 'Название объекта'), type: optStr, address: optStr, areaM2: optInt, schedule: optStr }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const [o] = await db.insert(t.objects).values({ companyId, ...p.data }).returning();
  await audit(db, user.id, 'create', 'object', o.id);
  redirect(`/objects/${o.id}`);
}

export async function updateObject(id: number, form: FormData) {
  const user = await requireUser('objects');
  const p = z.object({ name: z.string().trim().min(2), type: optStr, address: optStr, areaM2: optInt, ceilingM: z.preprocess(v => (v ? Number(v) : null), z.number().nullable()), schedule: optStr, accessNotes: optStr }).parse(Object.fromEntries(form));
  const db = await getDb();
  await db.update(t.objects).set(p).where(eq(t.objects.id, id));
  await audit(db, user.id, 'update', 'object', id);
  refresh();
}

export async function addZone(objectId: number, form: FormData) {
  await requireUser('objects');
  const p = z.object({ name: z.string().trim().min(1), scentId: optInt }).parse(Object.fromEntries(form));
  await (await getDb()).insert(t.zones).values({ objectId, ...p });
  refresh();
}

export async function setZoneScent(zoneId: number, form: FormData) {
  const user = await requireUser('objects');
  const scentId = optInt.parse(form.get('scentId'));
  const db = await getDb();
  await db.update(t.zones).set({ scentId }).where(eq(t.zones.id, zoneId));
  await audit(db, user.id, 'scent', 'zone', zoneId, { scentId });
  refresh();
}

/* ── Подписки ── */
export async function addSubscription(objectId: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('subscriptions');
  const p = parse(z.object({ tariffId: z.coerce.number().int().positive('Тариф'), startDate: ymd, discountPct: z.coerce.number().int().min(0).max(50).default(0), status: z.enum(['active', 'trial']).default('active') }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const sub = await createSubscription(db, { objectId, ...p.data });
  await audit(db, user.id, 'create', 'subscription', sub.id);
  refresh();
  return { ok: 'Подписка оформлена, визиты запланированы' };
}

export async function setSubscriptionStatus(id: number, status: 'active' | 'paused' | 'cancelled', reason?: string) {
  const user = await requireUser('subscriptions');
  const db = await getDb();
  const [sub] = await db.select().from(t.subscriptions).where(eq(t.subscriptions.id, id));
  if (!sub) return;
  const patch: Partial<typeof t.subscriptions.$inferInsert> = { status };
  if (status === 'paused') patch.pausedUntil = addDays(new Date().toISOString().slice(0, 10), 30);
  if (status === 'active' && sub.status === 'paused') { patch.pausedUntil = null; patch.endDate = addMonths(sub.endDate, 1); }
  if (status === 'cancelled') {
    patch.cancelReason = reason || 'не указана';
    // дата окончания = дата расторжения: по ней считается отток на дашборде
    if (sub.endDate > today()) patch.endDate = today();
    // будущие визиты отменяем, аппарат — забрать
    await db.update(t.visits).set({ status: 'cancelled' }).where(and(eq(t.visits.subscriptionId, id), eq(t.visits.status, 'planned')));
    await db.insert(t.visits).values({ objectId: sub.objectId, subscriptionId: id, type: 'uninstall', plannedDate: addDays(new Date().toISOString().slice(0, 10), 3) });
  }
  await db.update(t.subscriptions).set(patch).where(eq(t.subscriptions.id, id));
  await audit(db, user.id, 'status', 'subscription', id, { from: sub.status, to: status, reason });
  refresh();
}

export async function renewSubscription(id: number) {
  const user = await requireUser('subscriptions');
  const db = await getDb();
  const [sub] = await db.select().from(t.subscriptions).where(eq(t.subscriptions.id, id));
  if (!sub) return;
  const next = await createSubscription(db, { objectId: sub.objectId, tariffId: sub.tariffId, startDate: sub.endDate, discountPct: sub.discountPct, withInstall: false });
  await db.update(t.subscriptions).set({ status: 'active', autoRenew: false }).where(eq(t.subscriptions.id, id));
  await audit(db, user.id, 'renew', 'subscription', id, { next: next.id });
  refresh();
}

/* ── Визиты ── */
export async function planVisit(objectId: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('visits');
  const p = parse(z.object({ type: z.enum(t.visitTypeEnum.enumValues), plannedDate: ymd, employeeId: optInt, comment: optStr }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const [v] = await db.insert(t.visits).values({ objectId, ...p.data }).returning();
  await audit(db, user.id, 'create', 'visit', v.id);
  refresh();
  return { ok: 'Визит запланирован' };
}

export async function completeVisitAction(id: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('visits');
  const p = parse(z.object({
    oilMl: optInt, rating: z.preprocess(v => (v ? Number(v) : null), z.number().int().min(1).max(5).nullable()), comment: optStr,
  }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const checklist = Object.fromEntries(['refill', 'settings', 'clean', 'photo', 'signature'].map(k => [k, form.get(k) === 'on']));
  await completeVisit(await getDb(), id, { ...p.data, checklist }, user.id);
  redirect('/visits');
}

export async function setVisitStatus(id: number, status: 'missed' | 'cancelled' | 'planned', date?: string) {
  const user = await requireUser('visits');
  const db = await getDb();
  await db.update(t.visits).set({ status, ...(date ? { plannedDate: date } : {}) }).where(eq(t.visits.id, id));
  await audit(db, user.id, 'status', 'visit', id, { status, date });
  refresh();
}

/* ── Оборудование ── */
export async function addDevice(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('devices');
  const p = parse(z.object({ serial: z.string().trim().min(3, 'Серийный номер'), modelId: z.coerce.number().int().positive(), purchasePrice: optInt, purchaseDate: optStr }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const [dup] = await db.select({ id: t.devices.id }).from(t.devices).where(eq(t.devices.serial, p.data.serial));
  if (dup) return { error: 'Аппарат с таким номером уже есть' };
  const [d] = await db.insert(t.devices).values({ ...p.data, warrantyUntil: p.data.purchaseDate ? addMonths(p.data.purchaseDate, 12) : null }).returning();
  await db.insert(t.deviceEvents).values({ deviceId: d.id, userId: user.id, text: 'Принят на склад' });
  redirect(`/devices/${d.id}`);
}

export async function moveDevice(id: number, form: FormData) {
  const user = await requireUser('devices');
  const p = z.object({ status: z.enum(t.deviceStatusEnum.enumValues), objectId: optInt, note: optStr }).parse(Object.fromEntries(form));
  const db = await getDb();
  const atClient = p.status === 'client' || p.status === 'trial';
  await db.update(t.devices).set({ status: p.status, objectId: atClient ? p.objectId : null, zoneId: null }).where(eq(t.devices.id, id));
  let where = '';
  if (atClient && p.objectId) { const [o] = await db.select({ name: t.objects.name }).from(t.objects).where(eq(t.objects.id, p.objectId)); where = o ? ` → ${o.name}` : ''; }
  const label = { stock: 'На склад', trial: 'На тест', client: 'Клиенту', repair: 'В ремонт', written_off: 'Списан' }[p.status];
  await db.insert(t.deviceEvents).values({ deviceId: id, userId: user.id, text: `${label}${where}${p.note ? ': ' + p.note : ''}` });
  refresh();
}

/* ── Задачи ── */
export async function createTask(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('tasks');
  const p = parse(z.object({
    title: z.string().trim().min(3, 'Что сделать?'), description: optStr, assigneeId: optInt, dueDate: optStr,
    priority: z.enum(['low', 'normal', 'high']).default('normal'), leadId: optInt, companyId: optInt, objectId: optInt,
  }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  await db.insert(t.tasks).values({ ...p.data, assigneeId: p.data.assigneeId ?? user.id, createdById: user.id });
  redirect(p.data.leadId ? `/leads/${p.data.leadId}` : p.data.objectId ? `/objects/${p.data.objectId}` : '/tasks');
}

export async function setTaskStatus(id: number, status: 'todo' | 'doing' | 'done') {
  const user = await requireUser('tasks');
  const db = await getDb();
  await db.update(t.tasks).set({ status }).where(eq(t.tasks.id, id));
  await audit(db, user.id, 'status', 'task', id, { status });
  refresh();
}

/* ── Настройки (только собственник) ── */
export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('settings');
  const p = parse(z.object({ name: z.string().trim().min(2, 'Имя'), email: z.string().trim().toLowerCase().email('Почта'), role: z.enum(t.roleEnum.enumValues), password: z.string().min(10, 'Пароль от 10 символов') }), form);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const [dup] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, p.data.email));
  if (dup) return { error: 'Такая почта уже есть' };
  const [u] = await db.insert(t.users).values({ name: p.data.name, email: p.data.email, role: p.data.role, passwordHash: hashPassword(p.data.password) }).returning();
  await audit(db, user.id, 'create', 'user', u.id, { role: u.role });
  refresh();
  return { ok: `Пользователь ${u.name} создан` };
}

export async function toggleUser(id: number) {
  const user = await requireUser('settings');
  if (id === user.id) return;
  const db = await getDb();
  const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
  if (!u) return;
  await db.update(t.users).set({ active: !u.active }).where(eq(t.users.id, id));
  await audit(db, user.id, u.active ? 'deactivate' : 'activate', 'user', id);
  refresh();
}

export async function updateTariff(id: number, form: FormData) {
  const user = await requireUser('settings');
  const p = z.object({ priceTotal: z.coerce.number().int().positive(), visitsPerMonth: z.coerce.number().int().min(1).max(8) }).parse(Object.fromEntries(form));
  const db = await getDb();
  await db.update(t.tariffs).set(p).where(eq(t.tariffs.id, id));
  await audit(db, user.id, 'update', 'tariff', id, p);
  refresh();
}

export async function runRenewals(): Promise<number> {
  const user = await requireUser('settings');
  const db = await getDb();
  const n = await renewalSweep(db);
  await audit(db, user.id, 'sweep', 'subscription', null, { n });
  refresh();
  return n;
}
