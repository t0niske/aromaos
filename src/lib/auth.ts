import 'server-only';
/* Сессия: cookie «aos_session» = base64url(JSON {uid, exp}) + '.' + HMAC-SHA256 (SESSION_SECRET).
   Проверка подписи и срока + пользователь должен существовать и быть активным. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { can, homeFor, type Role, type Section } from './access';

const COOKIE = 'aos_session';
const TTL_DAYS = 14;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET не задан (см. README)');
  return s;
}
const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export function sealSession(uid: number) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TTL_DAYS * 86_400_000 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function unseal(token?: string): number | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof uid === 'number' && exp > Date.now() ? uid : null;
  } catch { return null; }
}

export async function setSessionCookie(uid: number) {
  (await cookies()).set(COOKIE, sealSession(uid), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL_DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export type CurrentUser = { id: number; name: string; email: string; role: Role };

/* Текущий пользователь (один раз на запрос). Читает cookie — вызывать внутри <Suspense>. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection(); // дальше время и сессия — только на запросе, не при пререндере
  const uid = unseal((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  const db = await getDb();
  const [u] = await db.select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, active: t.users.active })
    .from(t.users).where(eq(t.users.id, uid));
  return u && u.active ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
});

/* Для страниц и действий: нет входа → /login, нет прав на раздел → на стартовую страницу роли */
export async function requireUser(section?: Section): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  if (section && !can(u.role, section)) redirect(homeFor(u.role));
  return u;
}

export const SESSION_COOKIE = COOKIE;
