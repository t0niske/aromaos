import 'server-only';
/* Telegram-бот: уведомления о заявках и управление из чата.
   Токен вводит собственник в «Настройках» (хранится в settings), там же ставится вебхук
   POST /api/telegram/webhook с секретом. Сотрудник привязывает чат по одноразовой ссылке t.me/<бот>?start=<код>. */
import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { can, type Role } from './access';
import { addDays, today } from './dates';
import { SITE_NAMES } from './format';
import { audit, moveLead, STAGES } from './domain';

type DB = Awaited<ReturnType<typeof getDb>>;
type Button = { text: string; callback_data?: string; url?: string };
type Keyboard = Button[][];

export const appUrl = () => (process.env.APP_URL || 'https://crm.arome-marketing.kz').replace(/\/$/, '');

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

export const send = (chatId: string, text: string, keyboard?: Keyboard) =>
  tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });

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

/* ── Тексты ── */
const esc = (s: string | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stageName = (s: string) => STAGES.find(x => x.id === s)?.name ?? s;

type Lead = typeof t.leads.$inferSelect;
function leadText(l: Lead, owner?: string | null, title = 'Заявка') {
  return [
    `<b>${title} #${l.id}</b> · ${esc(SITE_NAMES[l.sourceSite] ?? l.sourceSite)} · ${esc(stageName(l.stage))}`,
    `${esc(l.name)}${l.phone ? ` · ${esc(l.phone)}` : ''}`,
    l.industry && `Пространство: ${esc(l.industry)}`,
    l.message && esc(l.message),
    owner !== undefined && `Ответственный: ${owner ? esc(owner) : '—'}`,
  ].filter(Boolean).join('\n');
}
const leadKeyboard = (l: Lead): Keyboard => [
  ...(l.stage === 'new' ? [[{ text: '✋ Беру в работу', callback_data: `take:${l.id}` }]] : []),
  ...(['new', 'qualify'].includes(l.stage) ? [[{ text: '🧪 Тест 3 дня', callback_data: `trial:${l.id}` }, { text: '✖ Отказ', callback_data: `lost:${l.id}` }]] : []),
  [{ text: 'Открыть в CRM', url: `${appUrl()}/leads/${l.id}` }],
];

/* ── Уведомления ── */
async function chatsFor(db: DB, roles: Role[]) {
  return db.select({ id: t.users.id, chat: t.users.telegramChatId }).from(t.users)
    .where(and(eq(t.users.active, true), isNotNull(t.users.telegramChatId), inArray(t.users.role, roles)));
}

/* Новая заявка с сайта → собственнику и продажам */
export async function notifyNewLead(leadId: number, duplicate: boolean) {
  const db = await getDb();
  const [l] = await db.select().from(t.leads).where(eq(t.leads.id, leadId));
  if (!l) return;
  const text = leadText(l, undefined, duplicate ? 'Повторная заявка' : 'Новая заявка');
  for (const u of await chatsFor(db, ['owner', 'sales_head', 'sales'])) await send(u.chat!, text, leadKeyboard(l));
}

/* ── Команды ── */
export const COMMANDS: [string, string][] = [
  ['today', 'Сводка на сегодня'],
  ['leads', 'Открытые заявки'],
  ['tasks', 'Мои задачи'],
  ['visits', 'Визиты на сегодня'],
  ['help', 'Что умеет бот'],
];
const HELP = 'Я бот системы Aromé.\n\n' + COMMANDS.map(([c, d]) => `/${c} — ${d.toLowerCase()}`).join('\n') +
  '\n\nНовые заявки с сайта приходят сюда сразу, с кнопками «Беру в работу», «Тест 3 дня» и «Отказ».';

type Update = {
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
};

export async function handleUpdate(u: Update) {
  const db = await getDb();
  const chatId = String(u.message?.chat.id ?? u.callback_query?.message?.chat.id ?? '');
  if (!chatId) return;

  // привязка: /start <код>
  const text = u.message?.text?.trim() ?? '';
  const start = text.match(/^\/start\s+([0-9a-f]{24})$/);
  if (start) {
    const [user] = await db.select().from(t.users).where(and(eq(t.users.telegramLinkCode, start[1]), eq(t.users.active, true)));
    if (!user) return send(chatId, 'Ссылка устарела. Откройте в CRM «Telegram» и нажмите «Подключить» ещё раз.');
    await db.update(t.users).set({ telegramChatId: null }).where(eq(t.users.telegramChatId, chatId)); // один чат — один сотрудник
    await db.update(t.users).set({ telegramChatId: chatId, telegramLinkCode: null }).where(eq(t.users.id, user.id));
    await audit(db, user.id, 'telegram', 'user', user.id);
    return send(chatId, `Готово, ${esc(user.name)}! Telegram подключён.\n\n${HELP}`);
  }

  const [me] = await db.select().from(t.users).where(and(eq(t.users.telegramChatId, chatId), eq(t.users.active, true)));
  if (!me) {
    if (u.callback_query) await tgCall('answerCallbackQuery', { callback_query_id: u.callback_query.id });
    return send(chatId, `Этот чат не подключён к системе. Войдите в CRM: ${appUrl()}/telegram — и нажмите «Подключить Telegram».`);
  }
  const role = me.role as Role;

  if (u.callback_query) return onButton(db, me, role, chatId, u.callback_query);

  const cmd = text.split(/[\s@]/)[0];
  if (cmd === '/leads') return cmdLeads(db, role, chatId);
  if (cmd === '/tasks') return cmdTasks(db, me.id, chatId);
  if (cmd === '/visits') return cmdVisits(db, me.id, role, chatId);
  if (cmd === '/today' || cmd === '/start') return cmdToday(db, me, role, chatId);
  return send(chatId, HELP);
}

async function cmdLeads(db: DB, role: Role, chatId: string) {
  if (!can(role, 'leads')) return send(chatId, 'Заявки вам недоступны.');
  const rows = await db.select().from(t.leads).where(inArray(t.leads.stage, ['new', 'qualify', 'trial'])).orderBy(asc(t.leads.id)).limit(10);
  if (!rows.length) return send(chatId, 'Открытых заявок нет.');
  for (const l of rows) await send(chatId, leadText(l), leadKeyboard(l));
}

async function cmdTasks(db: DB, userId: number, chatId: string) {
  const rows = await db.select().from(t.tasks)
    .where(and(eq(t.tasks.assigneeId, userId), ne(t.tasks.status, 'done'), or(lte(t.tasks.dueDate, today()), sql`${t.tasks.dueDate} is null`)))
    .orderBy(asc(t.tasks.dueDate)).limit(15);
  if (!rows.length) return send(chatId, 'На сегодня задач нет.');
  for (const x of rows) {
    const late = x.dueDate && x.dueDate < today() ? ' · <b>просрочено</b>' : '';
    await send(chatId, `☐ ${esc(x.title)}${x.dueDate ? ` · до ${x.dueDate.slice(8, 10)}.${x.dueDate.slice(5, 7)}` : ''}${late}`,
      [[{ text: '✓ Готово', callback_data: `done:${x.id}` }]]);
  }
}

async function cmdVisits(db: DB, userId: number, role: Role, chatId: string) {
  if (!can(role, 'visits')) return send(chatId, 'Визиты вам недоступны.');
  const rows = await db.select({ v: t.visits, obj: t.objects.name, addr: t.objects.address, who: t.users.name })
    .from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).leftJoin(t.users, eq(t.users.id, t.visits.employeeId))
    .where(and(eq(t.visits.plannedDate, today()), eq(t.visits.status, 'planned'), role === 'tech' ? eq(t.visits.employeeId, userId) : undefined));
  if (!rows.length) return send(chatId, 'На сегодня визитов нет.');
  return send(chatId, '<b>Визиты на сегодня</b>\n' + rows.map(r => `• ${esc(r.obj)}${r.addr ? `, ${esc(r.addr)}` : ''}${role !== 'tech' && r.who ? ` — ${esc(r.who)}` : ''}`).join('\n'),
    [[{ text: 'Открыть визиты', url: `${appUrl()}/visits` }]]);
}

async function cmdToday(db: DB, me: typeof t.users.$inferSelect, role: Role, chatId: string) {
  const d = today();
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;
  const c = sql<number>`count(*)::int`;
  const lines = [`<b>Сводка на ${d.slice(8, 10)}.${d.slice(5, 7)}</b>, ${esc(me.name)}`];
  const todayLeads = sql`(${t.leads.createdAt} at time zone 'Asia/Almaty')::date = ${d}`;
  if (can(role, 'leads')) {
    const fresh = await n(db.select({ c }).from(t.leads).where(eq(t.leads.stage, 'new')));
    const created = await n(db.select({ c }).from(t.leads).where(todayLeads));
    lines.push('Новых заявок: ' + fresh, 'Заявок за сегодня: ' + created);
  }
  const mine = await n(db.select({ c }).from(t.tasks).where(and(eq(t.tasks.assigneeId, me.id), ne(t.tasks.status, 'done'), lte(t.tasks.dueDate, d))));
  lines.push('Мои задачи на сегодня: ' + mine);
  if (can(role, 'visits')) {
    const v = await n(db.select({ c }).from(t.visits).where(and(eq(t.visits.plannedDate, d), eq(t.visits.status, 'planned'))));
    lines.push('Визитов сегодня: ' + v);
  }
  if (can(role, 'subscriptions')) {
    const ending = await n(db.select({ c }).from(t.subscriptions).where(and(inArray(t.subscriptions.status, ['active', 'renewing']), lte(t.subscriptions.endDate, addDays(d, 7)))));
    lines.push('Подписок кончается за 7 дней: ' + ending);
  }
  return send(chatId, lines.join('\n'), [[{ text: 'Открыть CRM', url: appUrl() }]]);
}

async function onButton(db: DB, me: typeof t.users.$inferSelect, role: Role, chatId: string, q: NonNullable<Update['callback_query']>) {
  const [act, idStr] = (q.data ?? '').split(':');
  const id = Number(idStr);
  const answer = (text: string) => tgCall('answerCallbackQuery', { callback_query_id: q.id, text });
  const msgId = q.message?.message_id;

  if (act === 'done') {
    const [x] = await db.select().from(t.tasks).where(eq(t.tasks.id, id));
    if (!x || x.assigneeId !== me.id) return answer('Это не ваша задача');
    await db.update(t.tasks).set({ status: 'done' }).where(eq(t.tasks.id, id));
    await audit(db, me.id, 'update', 'task', id, { status: 'done', via: 'telegram' });
    if (msgId) await tgCall('editMessageText', { chat_id: chatId, message_id: msgId, text: `✓ <s>${esc(x.title)}</s>`, parse_mode: 'HTML' });
    return answer('Задача закрыта');
  }

  if (!can(role, 'leads')) return answer('Нет доступа к заявкам');
  const [l] = await db.select().from(t.leads).where(eq(t.leads.id, id));
  if (!l) return answer('Заявка не найдена');
  if (act === 'take') {
    if (l.stage !== 'new' && l.ownerId && l.ownerId !== me.id) return answer('Уже взяли в работу');
    await db.update(t.leads).set({ ownerId: me.id, updatedAt: new Date() }).where(eq(t.leads.id, id));
    await db.update(t.tasks).set({ assigneeId: me.id }).where(and(eq(t.tasks.leadId, id), ne(t.tasks.status, 'done')));
    await moveLead(db, id, 'qualify', me.id);
  } else if (act === 'trial') {
    if (!l.ownerId) await db.update(t.leads).set({ ownerId: me.id }).where(eq(t.leads.id, id));
    await moveLead(db, id, 'trial', me.id);
  } else if (act === 'lost') {
    await moveLead(db, id, 'lost', me.id, 'отказ (из Telegram)');
  } else return answer('Неизвестная кнопка');

  const [now] = await db.select().from(t.leads).where(eq(t.leads.id, id));
  const [owner] = now.ownerId ? await db.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, now.ownerId)) : [];
  if (msgId) await tgCall('editMessageText', { chat_id: chatId, message_id: msgId, text: leadText(now, owner?.name ?? null), parse_mode: 'HTML', reply_markup: { inline_keyboard: leadKeyboard(now) } });
  return answer(`Этап: ${stageName(now.stage)}`);
}
