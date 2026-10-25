import { Suspense } from 'react';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { NAV, ROLE_NAMES, can } from '@/lib/access';
import { today } from '@/lib/dates';
import { Sidebar } from '@/components/sidebar';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/logo';
import { logout } from '../login/actions';

/* Оболочка: меню зависит от роли (читает сессию) — поэтому оно за Suspense,
   а каркас страницы отдаётся сразу */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="lg:pl-[248px]">
      <Suspense fallback={<NavSkeleton />}>
        <RoleNav />
      </Suspense>
      <main className="mx-auto w-full max-w-[1360px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
}

async function RoleNav() {
  const user = await requireUser();
  const db = await getDb();
  const t0 = today();
  const [{ tasks }] = await db.select({ tasks: sql<number>`count(*)`.mapWith(Number) }).from(t.tasks)
    .where(and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done'), lt(t.tasks.dueDate, t0)));
  const [{ visits }] = await db.select({ visits: sql<number>`count(*)`.mapWith(Number) }).from(t.visits)
    .where(and(eq(t.visits.status, 'planned'), lt(t.visits.plannedDate, t0), ...(user.role === 'tech' ? [eq(t.visits.employeeId, user.id)] : [])));
  const items = NAV.filter(n => can(user.role, n.section)).map(n => ({
    href: n.href, label: n.label, icon: n.icon,
    count: n.section === 'tasks' ? tasks : n.section === 'visits' ? visits : undefined,
  }));
  const userBox = (
    <div className="flex items-center gap-2.5 px-1.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
        {user.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-medium">{user.name}</span>
        <span className="block truncate text-[12px] text-ink-3">{ROLE_NAMES[user.role]}</span>
      </span>
      <form action={logout}>
        <button className="btn btn-ghost size-8 p-0 text-ink-3" aria-label="Выйти" title="Выйти"><Icon name="logout" /></button>
      </form>
    </div>
  );
  return <Sidebar items={items} user={userBox} />;
}

function NavSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-line px-4 lg:hidden"><Logo /></header>
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line bg-surface px-3 py-4 lg:block">
        <div className="mb-5 px-2"><Logo /></div>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="mx-2 mb-3 h-5 animate-pulse rounded bg-line" />)}
      </aside>
    </>
  );
}
