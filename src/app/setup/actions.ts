'use server';
/* Первый запуск рабочей базы: пока нет ни одного пользователя, по коду SETUP_CODE (из .env на сервере)
   создаётся собственник и заполняются справочники. После этого страница закрыта навсегда. */
import { timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { seedCatalog } from '@/db/catalog-seed';
import { setSessionCookie } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { audit } from '@/lib/domain';

export type SetupState = { error?: string; name?: string; email?: string };

const count = async (table: string) => {
  const db = await getDb();
  return db.execute(sql.raw(`select count(*)::int as c from ${table}`)).then(r => (r.rows[0] as { c: number }).c);
};
export const hasUsers = async () => (await count('users')) > 0;

function codeOk(code: string) {
  const want = process.env.SETUP_CODE;
  if (!want || want.length < 12) return false;
  const a = Buffer.from(code), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setup(_: SetupState, form: FormData): Promise<SetupState> {
  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const back = { name, email };
  if (await hasUsers()) redirect('/login');
  if (!codeOk(String(form.get('code') || '').trim())) return { ...back, error: 'Неверный код запуска' };
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { ...back, error: 'Укажите имя и почту' };
  if (password.length < 10) return { ...back, error: 'Пароль — не короче 10 символов' };
  if (password !== String(form.get('password2') || '')) return { ...back, error: 'Пароли не совпадают' };

  const db = await getDb();
  if ((await count('device_models')) === 0) await seedCatalog(db);
  const [u] = await db.insert(t.users).values({ name, email, role: 'owner', passwordHash: hashPassword(password) }).returning();
  await audit(db, u.id, 'setup', 'user', u.id);
  await setSessionCookie(u.id);
  redirect('/');
}
