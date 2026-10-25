import { Suspense } from 'react';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { NAV, ROLE_NAMES, can } from '@/lib/access';
import { today } from '@/lib/dates';
import { Shell } from '@/components/sidebar';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/logo';
import { logout } from '../login/actions';

/* Оболочка: меню зависит от роли (читает сессию) — поэтому оно за Suspense,
   а каркас страницы отдаётся сразу */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="app-frame lg:pl-[260px]">
      <Suspense fallback={<ShellSkeleton />}>
        <RoleShell />
      </Suspense>
      <main className="mx-auto w-full max-w-[1440px] px-4 pt-5 pb-8 sm:px-6 lg:pt-6">{children}</main>
    </div>
  );
}

async function RoleShell() {
  const user = await requireUser();
  const db = await getDb();
  const t0 = today();
  const [{ tasks }] = await db.select({ tasks: sql<number>`count(*)`.mapWith(Number) }).from(t.tasks)
    .where(and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done'), lt(t.tasks.dueDate, t0)));
  const [{ visits }] = await db.select({ visits: sql<number>`count(*)`.mapWith(Number) }).from(t.visits)
    .where(and(eq(t.visits.status, 'planned'), lt(t.visits.plannedDate, t0), ...(user.role === 'tech' ? [eq(t.visits.employeeId, user.id)] : [])));
  const items = NAV.filter(n => can(user.role, n.section)).map(n => ({
    href: n.href, label: n.label, icon: n.icon, group: n.group,
    count: n.section === 'tasks' ? tasks : n.section === 'visits' ? visits : undefined,
  }));
  const shellUser = { name: user.name, role: ROLE_NAMES[user.role], initials: user.name.split(' ').map(w => w[0]).slice(0, 2).join('') };
  const logoutForm = (
    <form action={logout}>
      <button className="btn btn-sm w-full border-transparent bg-[var(--t-red-bg)] text-[var(--t-red)] hover:bg-[var(--t-red)] hover:text-white">
        <Icon name="logout" size={16} /> Выйти
      </button>
    </form>
  );
  const search = (['leads', 'clients', 'objects'] as const).some(s => can(user.role, s));
  return <Shell items={items} user={shellUser} overdue={tasks} logout={logoutForm} search={search} />;
}

function ShellSkeleton() {
  return (
    <>
      <aside className="nav-panel fixed inset-y-0 left-0 hidden w-[260px] px-5 py-4 lg:block">
        <div className="mb-6"><Logo tone="dark" /></div>
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="mb-4 h-5 animate-pulse rounded bg-white/5" />)}
      </aside>
      <div className="topbar-wrap">
        <div className="card topbar"><span className="h-5 w-48 animate-pulse rounded bg-line" /></div>
      </div>
    </>
  );
}
