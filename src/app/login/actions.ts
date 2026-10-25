'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth';
import { homeFor } from '@/lib/access';
import { verifyPassword } from '@/lib/password';
import { audit } from '@/lib/domain';

export type LoginState = { error?: string; email?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  if (!email || !password) return { error: 'Введите почту и пароль', email };
  const db = await getDb();
  const [u] = await db.select().from(t.users).where(eq(t.users.email, email));
  if (!u || !u.active || !verifyPassword(password, u.passwordHash)) return { error: 'Неверная почта или пароль', email };
  await setSessionCookie(u.id);
  await audit(db, u.id, 'login', 'user', u.id);
  redirect(homeFor(u.role));
}

export async function logout() {
  await clearSessionCookie();
  redirect('/login');
}
