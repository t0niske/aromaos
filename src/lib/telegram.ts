import 'server-only';
/* Telegram-бот: один бот на компанию, работает в общей группе и в личных чатах.
   Группа (подключается командой /group от собственника) — общее: заявки, замеры, установки, сводка в 9:00,
   кнопки «Беру». Личка — своё: назначенные заявки, мои задачи и выезды, напоминания.
   Сотрудник привязывает свой Telegram-аккаунт по ссылке t.me/<бот>?start=<код>; в группе бот узнаёт,
   кто нажал кнопку, по аккаунту и проверяет права роли. Токен вводит собственник на странице /telegram. */
import { randomBytes } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { can, type Role } from './access';
import { addDays, today } from './dates';
import { SITE_NAMES } from './format';
import { audit, moveLead, STAGES } from './domain';

type DB = Awaited<ReturnType<typeof getDb>>;
type User = typeof t.users.$inferSelect;
type Lead = typeof t.leads.$inferSelect;
type Button = { text: string; callback_data?: string; url?: string };
type Keyboard = Button[][];

export const appUrl = () => (process.env.APP_URL || 'https://crm.arome-marketing.kz').replace(/\/$/, '');

const SALES: Role[] = ['owner', 'sales_head', 'sales', 'account'];
const SERVICE: Role[] = ['owner', 'service_head', 'tech'];

/* ── Настройки ── */
export async function getSetting(key: string) {
  const db = await getDb();
  const [r] = await db.select().from(t.settings).where(eq(t.settings.key, key));
  return r?.value ?? null;
}
export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.insert(t.settings).values({ key, value }).onConflictDoUpdate({ target: t.settings.key, set: { value, updatedAt: new Date() } });
}

/* ── Bot API ── */
export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>, token?: string): Promise<T | null> {
  const tk = token ?? (await getSetting('tg_token'));
  if (!tk) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${tk}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json() as { ok: boolean; result?: T; description?: string };
    if (!j.ok) console.error('telegram', method, j.description);
    return j.ok ? (j.result as T) : null;
  } catch (e) { console.error('telegram', method, e); return null; }
}

const markup = (keyboard?: Keyboard) => (keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {});
export const send = (chatId: string, text: string, keyboard?: Keyboard) =>
  tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...markup(keyboard) });
const edit = (chatId: string, messageId: number, text: string, keyboard?: Keyboard) =>
  tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...markup(keyboard) });

/* Токен от собственника: проверяем у Telegram, ставим вебхук с секретом, запоминаем имя бота */
export async function connectBot(token: string) {
  const me = await tgCall<{ username: string }>('getMe', {}, token);
  if (!me) return { error: 'Telegram не принял токен — проверьте, что скопировали его целиком' };
  const secret = randomBytes(24).toString('hex');
  const ok = await tgCall('setWebhook', { url: `${appUrl()}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query'] }, token);
  if (!ok) return { error: 'Не удалось подключить вебхук: система должна открываться по https' };
  await tgCall('setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) }, token);
  await setSetting('tg_token', token);
  await setSetting('tg_secret', secret);
  await setSetting('tg_username', me.username);
  return { username: me.username };
}

/* Ссылка привязки для сотрудника (код живёт до использования) */
export async function linkFor(userId: number) {
  const username = await getSetting('tg_username');
  if (!username) return null;
  const code = randomBytes(12).toString('hex');
  const db = await getDb();
  await db.update(t.users).set({ telegramLinkCode: code }).where(eq(t.users.id, userId));
  return `https://t.me/${username}?start=${code}`;
}

/* ── Кому писать ── */
async function people(db: DB, roles: Role[]) {
  return db.select().from(t.users).where(and(eq(t.users.active, true), isNotNull(t.users.telegramChatId), inArray(t.users.role, roles)));
}
/* Общее сообщение: в группу, а если группы нет — лично людям этих ролей */
async function broadcast(db: DB, roles: Role[], text: string, keyboard?: Keyboard) {
  const group = await getSetting('tg_group');
  if (group) return void (await send(group, text, keyboard));
  for (const u of await people(db, roles)) await send(u.telegramChatId!, text, keyboard);
}
async function dm(db: DB, userId: number | null, text: string, keyboard?: Keyboard) {
  if (!userId) return;
  const [u] = await db.select().from(t.users).where(and(eq(t.users.id, userId), eq(t.users.active, true)));
  if (u?.telegramChatId) await send(u.telegramChatId, text, keyboard);
}
const nameOf = async (db: DB, id: number | null) => (id ? (await db.select({ n: t.users.name }).from(t.users).where(eq(t.users.id, id)))[0]?.n ?? null : null);

/* ── Тексты ── */
const esc = (s: string | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stageName = (s: string) => STAGES.find(x => x.id === s)?.name ?? s;
const dm2 = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const VISIT_NAMES: Record<string, string> = { install: 'Установка', service: 'Обслуживание', scent_change: 'Смена аромата', repair: 'Ремонт', uninstall: 'Демонтаж', complaint: 'Жалоба' };

function leadText(l: Lead, owner: string | null, title = 'Заявка') {
  return [
    `<b>${title} #${l.id}</b> · ${esc(SITE_NAMES[l.sourceSite] ?? l.sourceSite)} · ${esc(stageName(l.stage))}`,
    `${esc(l.name)}${l.phone ? ` · ${esc(l.phone)}` : ''}`,
    l.industry && `Пространство: ${esc(l.industry)}`,
    l.message && esc(l.message),
    `Ответственный: ${owner ? esc(owner) : '—'}`,
  ].filter(Boolean).join('\n');
}
const leadKeyboard = (l: Lead): Keyboard => [
  ...(l.stage === 'new' ? [[{ text: '✋ Беру в работу', callback_data: `take:${l.id}` }]] : []),
  ...(['new', 'qualify'].includes(l.stage) ? [[{ text: '📏 Замер', callback_data: `survey:${l.id}` }, { text: '🧪 Тест 3 дня', callback_data: `trial:${l.id}` }]] : []),
  ...(['new', 'qualify', 'survey', 'trial', 'proposal'].includes(l.stage) ? [[{ text: '✖ Отказ', callback_data: `lost:${l.id}` }]] : []),
  [{ text: 'Открыть в CRM', url: `${appUrl()}/leads/${l.id}` }],
];
async function leadCard(db: DB, id: number, title?: string) {
  const [l] = await db.select().from(t.leads).where(eq(t.leads.id, id));
  return l ? { l, text: leadText(l, await nameOf(db, l.ownerId), title), kb: leadKeyboard(l) } : null;
}

async function visitCard(db: DB, id: number) {
  const [r] = await db.select({ v: t.visits, obj: t.objects.name, addr: t.objects.address }).from(t.visits)
    .innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).where(eq(t.visits.id, id));
  if (!r) return null;
  const who = await nameOf(db, r.v.employeeId);
  const text = [`🔧 <b>${VISIT_NAMES[r.v.type] ?? r.v.type}</b> · ${dm2(r.v.plannedDate)}`, `${esc(r.obj)}${r.addr ? `, ${esc(r.addr)}` : ''}`, `Едет: ${who ? esc(who) : '— пока никто'}`].join('\n');
  const kb: Keyboard = [...(!r.v.employeeId && r.v.status === 'planned' ? [[{ text: '🙋 Беру', callback_data: `vtake:${id}` }]] : []), [{ text: 'Открыть в CRM', url: `${appUrl()}/visits/${id}` }]];
  return { v: r.v, text, kb };
}

async function taskCard(db: DB, id: number) {
  const [x] = await db.select().from(t.tasks).where(eq(t.tasks.id, id));
  if (!x) return null;
  const who = await nameOf(db, x.assigneeId);
  const text = [`📏 <b>${esc(x.title)}</b>${x.dueDate ? ` · до ${dm2(x.dueDate)}` : ''}`, x.description && esc(x.description), `Едет: ${who ? esc(who) : '— пока никто'}`].filter(Boolean).join('\n');
  const kb: Keyboard = [...(!x.assigneeId && x.status !== 'done' ? [[{ text: '🙋 Беру', callback_data: `ttake:${id}` }]] : []), ...(x.leadId ? [[{ text: 'Заявка в CRM', url: `${appUrl()}/leads/${x.leadId}` }]] : [])];
  return { x, text, kb };
}

/* ── События системы → Telegram ── */

/* Новая заявка с сайта: в группу (или лично продажам) + ответственному в личку */
export async function notifyNewLead(leadId: number, duplicate: boolean) {
  const db = await getDb();
  const c = await leadCard(db, leadId, duplicate ? 'Повторная заявка' : 'Новая заявка');
  if (!c) return;
  await broadcast(db, SALES, c.text, c.kb);
  if (!duplicate && (await getSetting('tg_group'))) await dm(db, c.l.ownerId, `Вам назначена заявка — позвоните в течение 15 минут.\n\n${c.text}`, c.kb);
}

/* Ответственного сменили в CRM */
export async function notifyAssigned(leadId: number, userId: number) {
  const db = await getDb();
  const c = await leadCard(db, leadId);
  if (c) await dm(db, userId, `Вам назначена заявка.\n\n${c.text}`, c.kb);
}

/* Заявку перевели на «Замер»: задача выездной команде без исполнителя + сообщение с «Беру» */
export async function startSurvey(db: DB, leadId: number, actorId: number | null) {
  const [l] = await db.select().from(t.leads).where(eq(t.leads.id, leadId));
  if (!l) return;
  const [open] = await db.select({ id: t.tasks.id }).from(t.tasks).where(and(eq(t.tasks.leadId, leadId), sql`${t.tasks.title} like 'Замер:%'`, ne(t.tasks.status, 'done')));
  if (open) return;
  const [x] = await db.insert(t.tasks).values({
    title: `Замер: ${l.companyName || l.name}`, description: [l.phone, l.industry, l.areaM2 && `${l.areaM2} м²`, l.message].filter(Boolean).join(' · ') || null,
    dueDate: addDays(today(), 1), priority: 'high', leadId, createdById: actorId,
  }).returning();
  const c = await taskCard(db, x.id);
  if (c) await broadcast(db, SERVICE, c.text, c.kb);
}

/* Сделка выиграна: установка в группу с «Беру» */
export async function notifyWon(objectId: number) {
  const db = await getDb();
  const [obj] = await db.select({ name: t.objects.name }).from(t.objects).where(eq(t.objects.id, objectId));
  const [v] = await db.select({ id: t.visits.id }).from(t.visits).where(and(eq(t.visits.objectId, objectId), eq(t.visits.type, 'install'), eq(t.visits.status, 'planned')));
  await broadcast(db, [...SALES, ...SERVICE], `🎉 <b>Новый клиент: ${esc(obj?.name)}</b>`);
  if (v) { const c = await visitCard(db, v.id); if (c) await broadcast(db, SERVICE, c.text, c.kb); }
}

/* ── Расписание: /api/telegram/cron?kind=morning (9:00) и kind=tick (каждые 5 минут) ── */
export async function runCron(kind: 'morning' | 'tick') {
  const db = await getDb();
  if (kind === 'tick') {
    // заявка ждёт 15 минут, а её никто не взял — напоминание (окно 15–20 минут, чтобы не повторять)
    const waiting = await db.select().from(t.leads).where(and(eq(t.leads.stage, 'new'),
      lte(t.leads.createdAt, sql`now() - interval '15 minutes'`), gte(t.leads.createdAt, sql`now() - interval '20 minutes'`)));
    for (const l of waiting) {
      const c = await leadCard(db, l.id, '⏰ Ждёт 15 минут: заявка');
      if (c) await broadcast(db, SALES, c.text, c.kb);
    }
    return { waiting: waiting.length };
  }
  const group = await getSetting('tg_group');
  if (group) await send(group, await teamSummary(db), [[{ text: 'Открыть CRM', url: appUrl() }]]);
  const all = await db.select().from(t.users).where(and(eq(t.users.active, true), isNotNull(t.users.telegramChatId)));
  for (const u of all) {
    const text = await personalSummary(db, u, !group && u.role === 'owner');
    if (text) await send(u.telegramChatId!, text);
  }
  return { sent: all.length };
}

async function teamSummary(db: DB) {
  const d = today(), c = sql<number>`count(*)::int`;
  const one = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;
  const yesterday = await one(db.select({ c }).from(t.leads).where(sql`(${t.leads.createdAt} at time zone 'Asia/Almaty')::date = ${addDays(d, -1)}`));
  const fresh = await one(db.select({ c }).from(t.leads).where(eq(t.leads.stage, 'new')));
  const trials = await one(db.select({ c }).from(t.leads).where(and(eq(t.leads.stage, 'trial'), lte(t.leads.trialUntil, addDays(d, 1)))));
  const renew = await one(db.select({ c }).from(t.subscriptions).where(and(inArray(t.subscriptions.status, ['active', 'renewing']), lte(t.subscriptions.endDate, addDays(d, 7)))));
  const visits = await db.select({ type: t.visits.type, obj: t.objects.name, who: t.users.name }).from(t.visits)
    .innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).leftJoin(t.users, eq(t.users.id, t.visits.employeeId))
    .where(and(eq(t.visits.plannedDate, d), eq(t.visits.status, 'planned'))).orderBy(asc(t.users.name));
  const surveys = await db.select({ title: t.tasks.title, who: t.users.name }).from(t.tasks).leftJoin(t.users, eq(t.users.id, t.tasks.assigneeId))
    .where(and(sql`${t.tasks.title} like 'Замер:%'`, ne(t.tasks.status, 'done'), lte(t.tasks.dueDate, d)));
  return [
    `☀️ <b>Доброе утро! Сводка на ${dm2(d)}</b>`,
    `Заявок вчера: ${yesterday} · ждут ответственного: ${fresh}`,
    trials ? `Тесты заканчиваются: ${trials}` : '',
    renew ? `Подписки на продление за 7 дней: ${renew}` : '',
    visits.length || surveys.length ? `\n<b>Выезды сегодня</b>\n` + [
      ...visits.map(v => `• ${VISIT_NAMES[v.type] ?? v.type}: ${esc(v.obj)} — ${v.who ? esc(v.who) : 'никто не взял'}`),
      ...surveys.map(s => `• ${esc(s.title)} — ${s.who ? esc(s.who) : 'никто не взял'}`),
    ].join('\n') : 'Выездов сегодня нет',
  ].filter(Boolean).join('\n');
}

async function personalSummary(db: DB, u: User, withTeam: boolean) {
  const d = today(), role = u.role as Role;
  const tasks = await db.select().from(t.tasks).where(and(eq(t.tasks.assigneeId, u.id), ne(t.tasks.status, 'done'), lte(t.tasks.dueDate, d))).orderBy(asc(t.tasks.dueDate)).limit(10);
  const visits = can(role, 'visits') && SERVICE.includes(role)
    ? await db.select({ type: t.visits.type, obj: t.objects.name, addr: t.objects.address }).from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId))
      .where(and(eq(t.visits.plannedDate, d), eq(t.visits.status, 'planned'), eq(t.visits.employeeId, u.id)))
    : [];
  const trials = SALES.includes(role)
    ? await db.select({ id: t.leads.id, name: t.leads.name, company: t.leads.companyName }).from(t.leads)
      .where(and(eq(t.leads.stage, 'trial'), eq(t.leads.ownerId, u.id), lte(t.leads.trialUntil, addDays(d, 1))))
    : [];
  if (!tasks.length && !visits.length && !trials.length && !withTeam) return null;
  return [
    `<b>${esc(u.name)}, ваш день ${dm2(d)}</b>`,
    visits.length ? '\n<b>Мои выезды</b>\n' + visits.map(v => `• ${VISIT_NAMES[v.type] ?? v.type}: ${esc(v.obj)}${v.addr ? `, ${esc(v.addr)}` : ''}`).join('\n') : '',
    trials.length ? '\n<b>Тест заканчивается — позвонить</b>\n' + trials.map(l => `• #${l.id} ${esc(l.company || l.name)}`).join('\n') : '',
    tasks.length ? '\n<b>Задачи</b>\n' + tasks.map(x => `• ${esc(x.title)}${x.dueDate && x.dueDate < d ? ' — <b>просрочено</b>' : ''}`).join('\n') : '',
    withTeam ? '\n' + (await teamSummary(db)) : '',
  ].filter(Boolean).join('\n');
}

/* ── Команды ── */
export const COMMANDS: [string, string][] = [
  ['today', 'Сводка на сегодня'],
  ['leads', 'Открытые заявки'],
  ['tasks', 'Мои задачи'],
  ['visits', 'Выезды на сегодня'],
  ['help', 'Что умеет бот'],
];
const HELP = 'Я бот системы Aromé.\n\n' + COMMANDS.map(([c, d]) => `/${c} — ${d.toLowerCase()}`).join('\n') +
  '\n\nВ общей группе — заявки, замеры и установки с кнопками «Беру», сводка в 9:00. В личке — ваши заявки, задачи и выезды.';

type From = { id: number };
type Update = {
  message?: { chat: { id: number; type: string }; from?: From; text?: string };
  callback_query?: { id: string; from: From; data?: string; message?: { chat: { id: number; type: string }; message_id: number } };
};

export async function handleUpdate(u: Update) {
  const db = await getDb();
  const chat = u.message?.chat ?? u.callback_query?.message?.chat;
  const from = u.message?.from ?? u.callback_query?.from;
  if (!chat || !from) return;
  const chatId = String(chat.id), fromId = String(from.id), inGroup = chat.type !== 'private';
  const text = u.message?.text?.trim() ?? '';
  const cmd = text.split(/[\s@]/)[0];

  // привязка: /start <код> — только в личке
  const start = !inGroup && text.match(/^\/start\s+([0-9a-f]{24})$/);
  if (start) {
    const [user] = await db.select().from(t.users).where(and(eq(t.users.telegramLinkCode, start[1]), eq(t.users.active, true)));
    if (!user) return send(chatId, 'Ссылка устарела. Откройте в CRM «Telegram» и нажмите «Подключить» ещё раз.');
    await db.update(t.users).set({ telegramChatId: null }).where(eq(t.users.telegramChatId, fromId)); // один аккаунт — один сотрудник
    await db.update(t.users).set({ telegramChatId: fromId, telegramLinkCode: null }).where(eq(t.users.id, user.id));
    await audit(db, user.id, 'telegram', 'user', user.id);
    return send(chatId, `Готово, ${esc(user.name)}! Telegram подключён.\n\n${HELP}`);
  }

  const [me] = await db.select().from(t.users).where(and(eq(t.users.telegramChatId, fromId), eq(t.users.active, true)));
  if (!me) {
    if (u.callback_query) return tgCall('answerCallbackQuery', { callback_query_id: u.callback_query.id, text: 'Подключите Telegram в CRM: меню профиля → Telegram', show_alert: true });
    if (inGroup && !cmd.startsWith('/')) return; // в группе молчим на всё, кроме команд
    return send(chatId, `Этот Telegram не подключён к системе. Войдите в CRM: ${appUrl()}/telegram — и нажмите «Подключить Telegram».`);
  }
  const role = me.role as Role;

  if (u.callback_query) return onButton(db, me, role, u.callback_query);

  if (cmd === '/group') {
    if (!inGroup) return send(chatId, 'Команду /group нужно отправить в общей группе, куда добавлен бот.');
    if (role !== 'owner') return send(chatId, 'Подключить группу может только собственник.');
    await setSetting('tg_group', chatId);
    await audit(db, me.id, 'update', 'setting', null, { key: 'tg_group' });
    return send(chatId, 'Группа подключена. Сюда будут приходить заявки, замеры, установки и сводка в 9:00.');
  }

  // в группе — только общее; личное отправляем в личку
  if (inGroup) {
    if (cmd === '/today') return send(chatId, await teamSummary(db), [[{ text: 'Открыть CRM', url: appUrl() }]]);
    if (cmd === '/leads') return cmdLeads(db, role, chatId);
    if (cmd === '/tasks' || cmd === '/visits') {
      await (cmd === '/tasks' ? cmdTasks(db, me.id, fromId) : cmdVisits(db, me, role, fromId));
      return send(chatId, `${esc(me.name)}, отправил вам в личку.`);
    }
    if (cmd === '/help') return send(chatId, HELP);
    return;
  }

  if (cmd === '/leads') return cmdLeads(db, role, chatId, me.id);
  if (cmd === '/tasks') return cmdTasks(db, me.id, chatId);
  if (cmd === '/visits') return cmdVisits(db, me, role, chatId);
  if (cmd === '/today' || cmd === '/start') return send(chatId, (await personalSummary(db, me, role === 'owner')) ?? `${esc(me.name)}, на сегодня у вас ничего нет.`);
  return send(chatId, HELP);
}

async function cmdLeads(db: DB, role: Role, chatId: string, mineOf?: number) {
  if (!can(role, 'leads')) return send(chatId, 'Заявки вам недоступны.');
  const open = inArray(t.leads.stage, ['new', 'qualify', 'survey', 'trial', 'proposal']);
  // в личке у менеджера — его заявки и ничьи; у собственника и в группе — все открытые
  const scope = mineOf && role !== 'owner' ? or(eq(t.leads.ownerId, mineOf), isNull(t.leads.ownerId)) : undefined;
  const rows = await db.select({ id: t.leads.id }).from(t.leads).where(and(open, scope)).orderBy(asc(t.leads.id)).limit(10);
  if (!rows.length) return send(chatId, 'Открытых заявок нет.');
  for (const r of rows) { const c = await leadCard(db, r.id); if (c) await send(chatId, c.text, c.kb); }
}

async function cmdTasks(db: DB, userId: number, chatId: string) {
  const rows = await db.select().from(t.tasks)
    .where(and(eq(t.tasks.assigneeId, userId), ne(t.tasks.status, 'done'), or(lte(t.tasks.dueDate, today()), isNull(t.tasks.dueDate))))
    .orderBy(asc(t.tasks.dueDate)).limit(15);
  if (!rows.length) return send(chatId, 'На сегодня задач нет.');
  for (const x of rows) {
    const late = x.dueDate && x.dueDate < today() ? ' · <b>просрочено</b>' : '';
    await send(chatId, `☐ ${esc(x.title)}${x.dueDate ? ` · до ${dm2(x.dueDate)}` : ''}${late}`, [[{ text: '✓ Готово', callback_data: `done:${x.id}` }]]);
  }
}

async function cmdVisits(db: DB, me: User, role: Role, chatId: string) {
  if (!can(role, 'visits')) return send(chatId, 'Выезды вам недоступны.');
  const rows = await db.select({ id: t.visits.id }).from(t.visits)
    .where(and(eq(t.visits.plannedDate, today()), eq(t.visits.status, 'planned'), role === 'tech' ? or(eq(t.visits.employeeId, me.id), isNull(t.visits.employeeId)) : undefined));
  if (!rows.length) return send(chatId, 'На сегодня выездов нет.');
  for (const r of rows) { const c = await visitCard(db, r.id); if (c) await send(chatId, c.text, c.kb); }
}

async function onButton(db: DB, me: User, role: Role, q: NonNullable<Update['callback_query']>) {
  const [act, idStr] = (q.data ?? '').split(':');
  const id = Number(idStr);
  const answer = (text: string, alert = false) => tgCall('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert });
  const chatId = String(q.message?.chat.id ?? ''), msgId = q.message?.message_id;

  if (act === 'done') {
    const [x] = await db.select().from(t.tasks).where(eq(t.tasks.id, id));
    if (!x || x.assigneeId !== me.id) return answer('Это не ваша задача', true);
    await db.update(t.tasks).set({ status: 'done' }).where(eq(t.tasks.id, id));
    await audit(db, me.id, 'update', 'task', id, { status: 'done', via: 'telegram' });
    if (msgId) await edit(chatId, msgId, `✓ <s>${esc(x.title)}</s>`);
    return answer('Задача закрыта');
  }

  if (act === 'vtake' || act === 'ttake') {
    if (!SERVICE.includes(role)) return answer('Выезды берёт сервисная команда', true);
    if (act === 'vtake') {
      const [v] = await db.select().from(t.visits).where(eq(t.visits.id, id));
      if (!v) return answer('Выезд не найден');
      if (v.employeeId && v.employeeId !== me.id) return answer('Уже взяли', true);
      await db.update(t.visits).set({ employeeId: me.id }).where(eq(t.visits.id, id));
      await audit(db, me.id, 'update', 'visit', id, { employee: me.id, via: 'telegram' });
      const c = await visitCard(db, id);
      if (c && msgId) await edit(chatId, msgId, c.text, c.kb);
    } else {
      const [x] = await db.select().from(t.tasks).where(eq(t.tasks.id, id));
      if (!x) return answer('Задача не найдена');
      if (x.assigneeId && x.assigneeId !== me.id) return answer('Уже взяли', true);
      await db.update(t.tasks).set({ assigneeId: me.id, status: 'doing' }).where(eq(t.tasks.id, id));
      await audit(db, me.id, 'update', 'task', id, { assignee: me.id, via: 'telegram' });
      const c = await taskCard(db, id);
      if (c && msgId) await edit(chatId, msgId, c.text, c.kb);
    }
    return answer('Записал на вас');
  }

  if (!SALES.includes(role) || !can(role, 'leads')) return answer('Заявки ведут продажи', true);
  const [l] = await db.select().from(t.leads).where(eq(t.leads.id, id));
  if (!l) return answer('Заявка не найдена');
  if (act === 'take') {
    if (l.stage !== 'new') return answer('Заявку уже взяли', true);
    await db.update(t.leads).set({ ownerId: me.id, updatedAt: new Date() }).where(eq(t.leads.id, id));
    await db.update(t.tasks).set({ assigneeId: me.id }).where(and(eq(t.tasks.leadId, id), ne(t.tasks.status, 'done'), sql`${t.tasks.title} not like 'Замер:%'`));
    await moveLead(db, id, 'qualify', me.id);
  } else if (act === 'survey' || act === 'trial') {
    if (!l.ownerId) await db.update(t.leads).set({ ownerId: me.id }).where(eq(t.leads.id, id));
    await moveLead(db, id, act, me.id);
    if (act === 'survey') await startSurvey(db, id, me.id);
  } else if (act === 'lost') {
    await moveLead(db, id, 'lost', me.id, 'отказ (из Telegram)');
  } else return answer('Неизвестная кнопка');

  const c = await leadCard(db, id);
  if (c && msgId) await edit(chatId, msgId, c.text, c.kb);
  return answer(`${me.name} → ${stageName(c?.l.stage ?? '')}`);
}

