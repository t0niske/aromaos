'use server';
import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { audit, intakeLead, moveLead, winLead } from '@/lib/domain';
import { notifyAssigned, notifyWon, startSurvey } from '@/lib/telegram';

// Telegram — дополнение: его сбой не должен ломать действие в CRM
const quiet = (p: Promise<unknown>) => p.catch(e => console.error('telegram', e));

const stage = z.enum(t.leadStageEnum.enumValues);
const optInt = z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().nonnegative().nullable());
const optStr = z.preprocess(v => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().nullable());

export type FormState = { error?: string };

export async function createLead(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('leads');
  const p = z.object({
    name: z.string().trim().min(2, 'Укажите имя'), phone: optStr, email: optStr, companyName: optStr,
    industry: optStr, areaM2: optInt, message: optStr, sourceSite: z.string().default('manual'), channel: z.string().default('phone'),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await getDb();
  const { lead, duplicate } = await intakeLead(db, p.data, user.id);
  redirect(`/leads/${lead.id}${duplicate ? '?dup=1' : ''}`);
}

export async function moveLeadAction(id: number, to: string, reason?: string) {
  const user = await requireUser('leads');
  const st = stage.parse(to);
  if (st === 'won') return; // выигрыш — только через форму с тарифом в карточке лида
  const db = await getDb();
  await moveLead(db, id, st, user.id, reason);
  if (st === 'survey') await quiet(startSurvey(db, id, user.id)); // замер → выезд для сервисной команды с кнопкой «Беру»
  refresh();
}

export async function updateLead(id: number, form: FormData) {
  const user = await requireUser('leads');
  const p = z.object({
    name: z.string().trim().min(2), phone: optStr, email: optStr, companyName: optStr, industry: optStr,
    areaM2: optInt, expectedMrr: optInt, ownerId: optInt,
  }).parse(Object.fromEntries(form));
  const db = await getDb();
  const [before] = await db.select({ ownerId: t.leads.ownerId }).from(t.leads).where(eq(t.leads.id, id));
  await db.update(t.leads).set({ ...p, updatedAt: new Date() }).where(eq(t.leads.id, id));
  await audit(db, user.id, 'update', 'lead', id);
  if (p.ownerId && p.ownerId !== before?.ownerId && p.ownerId !== user.id) await quiet(notifyAssigned(id, p.ownerId));
  refresh();
}

export async function addNote(id: number, form: FormData) {
  const user = await requireUser('leads');
  const text = String(form.get('text') || '').trim();
  const kind = z.enum(['note', 'call', 'whatsapp', 'meeting']).catch('note').parse(form.get('kind'));
  if (!text) return;
  await (await getDb()).insert(t.activities).values({ leadId: id, userId: user.id, kind, text });
  refresh();
}

export async function winLeadAction(id: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('leads');
  const p = z.object({
    tariffId: z.coerce.number().int().positive('Выберите тариф'), objectName: optStr, address: optStr,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата начала'), discountPct: z.coerce.number().int().min(0).max(50).default(0),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await winLead(await getDb(), id, { ...p.data, objectName: p.data.objectName ?? undefined, address: p.data.address ?? undefined }, user.id);
  await quiet(notifyWon(r.objectId));
  redirect(`/clients/${r.companyId}?won=1`);
}
