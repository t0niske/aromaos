/* «Вход» в браузерной версии — подменяет src/lib/auth.ts с тем же интерфейсом. Входа нет: выбранная роль
   (номер пользователя) хранится в localStorage, по умолчанию — собственник. Вся база и так лежит в браузере посетителя. */
import { eq } from 'drizzle-orm';
import { getDb, t } from './db';
import { can, homeFor, type Role, type Section } from '@/lib/access';
import { redirect } from '../shims/next-navigation';

const KEY = 'aromaos-demo-user';
let memory: string | null = null;
const read = () => { try { return localStorage.getItem(KEY); } catch { return memory; } };
const write = (v: string | null) => {
  memory = v;
  try { if (v == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* приватный режим */ }
};

export type CurrentUser = { id: number; name: string; email: string; role: Role };

// входа в демо нет: пока роль не выбрана — собственник
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const uid = Number(read());
  const db = await getDb();
  const cols = { id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, active: t.users.active };
  const [u] = uid ? await db.select(cols).from(t.users).where(eq(t.users.id, uid)) : [];
  const user = u?.active ? u : (await db.select(cols).from(t.users).where(eq(t.users.role, 'owner')).limit(1))[0];
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}

export async function requireUser(section?: Section): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  if (section && !can(u.role, section)) redirect(homeFor(u.role));
  return u;
}

export async function setSessionCookie(uid: number) { write(String(uid)); }
export async function clearSessionCookie() { write(null); }
export const sealSession = (uid: number) => String(uid);
export const SESSION_COOKIE = KEY;
