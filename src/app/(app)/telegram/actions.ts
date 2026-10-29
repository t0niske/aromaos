'use server';
import { refresh } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/domain';
import { connectBot, linkFor } from '@/lib/telegram';

type State = { error?: string; ok?: string };

/* Собственник: токен от @BotFather */
export async function saveBotToken(_: State, form: FormData): Promise<State> {
  const user = await requireUser('settings');
  const token = String(form.get('token') || '').trim();
  if (!/^\d{6,}:[\w-]{30,}$/.test(token)) return { error: 'Это не похоже на токен: он выглядит как 123456789:AA…' };
  const r = await connectBot(token);
  if ('error' in r) return { error: r.error };
  await audit(await getDb(), user.id, 'update', 'setting', null, { key: 'tg_token', bot: r.username });
  refresh();
  return { ok: `Бот @${r.username} подключён` };
}

/* Любой сотрудник: одноразовая ссылка привязки своего чата */
export async function makeLink(): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  const url = await linkFor(user.id);
  return url ? { url } : { error: 'Бот ещё не подключён — это делает собственник' };
}

export async function unlinkTelegram() {
  const user = await requireUser();
  await (await getDb()).update(t.users).set({ telegramChatId: null, telegramLinkCode: null }).where(eq(t.users.id, user.id));
  refresh();
}
