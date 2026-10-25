/* Роли демо-версии: входа нет — по ссылке сразу собственник, сменить роль можно в плашке «Демо».
   «#/login?as=tech» открывает систему под нужной ролью (например, из презентации). */
import { eq } from 'drizzle-orm';
import { homeFor, type Role } from '@/lib/access';
import { audit } from '@/lib/domain';
import { getDb, t } from './runtime/db';
import { setSessionCookie } from './runtime/auth';

export const ROLES = [
  { as: 'owner', email: 'owner@aromaos.local', title: 'Собственник', text: 'дашборд, продажи, сервис, настройки' },
  { as: 'sales', email: 'sales@aromaos.local', title: 'Менеджер продаж', text: 'лиды, клиенты, подписки' },
  { as: 'service', email: 'service@aromaos.local', title: 'Руководитель сервиса', text: 'объекты, визиты, оборудование' },
  { as: 'tech', email: 'tech@aromaos.local', title: 'Техник', text: 'свои визиты — удобно с телефона' },
] as const;

/* переключиться на роль; возвращает адрес её стартовой страницы */
export async function signInAs(key: string | null) {
  const r = ROLES.find(x => x.as === key) ?? ROLES[0];
  const db = await getDb();
  const [u] = await db.select().from(t.users).where(eq(t.users.email, r.email));
  if (!u) return '/';
  await setSessionCookie(u.id);
  await audit(db, u.id, 'login', 'user', u.id);
  return homeFor(u.role as Role);
}
