import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { aliasedTable, and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { PRIORITY, day } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import { TaskToggle } from './task-toggle';

export const metadata: Metadata = { title: 'Задачи' };

export default function TasksPage({ searchParams }: PageProps<'/tasks'>) {
  return <Suspense fallback={<Skeleton />}><Tasks searchParams={searchParams} /></Suspense>;
}

async function Tasks({ searchParams }: { searchParams: PageProps<'/tasks'>['searchParams'] }) {
  const user = await requireUser('tasks');
  const tab = String((await searchParams).tab ?? 'my');
  const db = await getDb();
  const t0 = today();
  const assignee = aliasedTable(t.users, 'assignee');
  const scope = tab === 'all' ? ne(t.tasks.status, 'done') : tab === 'done' ? eq(t.tasks.status, 'done') : and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done'));
  const rows = await db.select({ x: t.tasks, who: assignee.name, lead: t.leads.companyName, leadName: t.leads.name, obj: t.objects.name })
    .from(t.tasks).leftJoin(assignee, eq(assignee.id, t.tasks.assigneeId)).leftJoin(t.leads, eq(t.leads.id, t.tasks.leadId)).leftJoin(t.objects, eq(t.objects.id, t.tasks.objectId))
    .where(scope).orderBy(tab === 'done' ? desc(t.tasks.createdAt) : asc(t.tasks.dueDate), desc(t.tasks.priority)).limit(300);
  const [{ my }] = await db.select({ my: sql<number>`count(*)`.mapWith(Number) }).from(t.tasks).where(and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done')));

  const groups = tab === 'done' ? [['Выполнено', rows] as const] : ([
    ['Просрочено', rows.filter(r => r.x.dueDate && r.x.dueDate < t0)],
    ['Сегодня', rows.filter(r => r.x.dueDate === t0)],
    ['Позже', rows.filter(r => !r.x.dueDate || r.x.dueDate > t0)],
  ] as const);

  return (
    <>
      <PageHeader title="Задачи" sub="Звонки, договоры, продления, закупки — всё с ответственным и сроком"
        actions={<Link href="/tasks/new" className="btn btn-primary"><Icon name="plus" size={16} />Задача</Link>} />
      <Tabs active={`/tasks?tab=${['all', 'done'].includes(tab) ? tab : 'my'}`} items={[
        { href: '/tasks?tab=my', label: 'Мои', count: my }, { href: '/tasks?tab=all', label: 'Все открытые' }, { href: '/tasks?tab=done', label: 'Выполненные' },
      ]} />
      {rows.length ? (
        <div className="grid gap-4">
          {groups.filter(([, items]) => items.length).map(([title, items]) => (
            <Card key={title} title={<>{title} <span className="num font-normal text-ink-3">{items.length}</span></>} pad={false}>
              <ul>{items.map(({ x, who, lead, leadName, obj }) => (
                <li key={x.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                  <TaskToggle id={x.id} status={x.status} />
                  <div className="min-w-0 flex-1">
                    <div className={x.status === 'done' ? 'text-ink-3 line-through' : 'font-medium'}>{x.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">
                      {tab !== 'my' && <span>{who ?? 'без исполнителя'}</span>}
                      {x.leadId && <Link className="hover:text-accent" href={`/leads/${x.leadId}`}>лид: {lead || leadName}</Link>}
                      {x.objectId && <Link className="hover:text-accent" href={`/objects/${x.objectId}`}>объект: {obj}</Link>}
                      {x.status === 'doing' && <span className="text-[var(--t-blue)]">в работе</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`num text-[13px] ${x.dueDate && x.dueDate < t0 && x.status !== 'done' ? 'font-medium text-[var(--t-red)]' : 'text-ink-2'}`}>{day(x.dueDate)}</span>
                    {x.priority !== 'normal' && <Badge tone={PRIORITY[x.priority][1]}>{PRIORITY[x.priority][0]}</Badge>}
                  </div>
                </li>
              ))}</ul>
            </Card>
          ))}
        </div>
      ) : <Card><Empty>{tab === 'my' ? 'Все ваши задачи выполнены' : 'Задач нет'}</Empty></Card>}
    </>
  );
}
