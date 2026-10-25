import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { and, asc, desc, eq, gte, lt, lte, sql, type SQL } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { addDays, today } from '@/lib/dates';
import { VISIT_STATUS, VISIT_TYPE, day } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Skeleton, Tabs } from '@/components/ui';

export const metadata: Metadata = { title: 'Визиты' };

export default function VisitsPage({ searchParams }: PageProps<'/visits'>) {
  return <Suspense fallback={<Skeleton />}><Visits searchParams={searchParams} /></Suspense>;
}

const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

async function Visits({ searchParams }: { searchParams: PageProps<'/visits'>['searchParams'] }) {
  const user = await requireUser('visits');
  const tab = String((await searchParams).tab ?? 'week');
  const db = await getDb();
  const t0 = today();
  const mine = user.role === 'tech' ? [eq(t.visits.employeeId, user.id)] : [];
  const planned = eq(t.visits.status, 'planned');
  const filters: Record<string, SQL[]> = {
    today: [planned, eq(t.visits.plannedDate, t0)],
    week: [planned, gte(t.visits.plannedDate, t0), lte(t.visits.plannedDate, addDays(t0, 7))],
    overdue: [planned, lt(t.visits.plannedDate, t0)],
    done: [eq(t.visits.status, 'done')],
  };
  const where = filters[tab] ?? filters.week;
  const rows = await db.select({ v: t.visits, obj: t.objects, company: t.companies.name, who: t.users.name })
    .from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).innerJoin(t.companies, eq(t.companies.id, t.objects.companyId))
    .leftJoin(t.users, eq(t.users.id, t.visits.employeeId))
    .where(and(...where, ...mine)).orderBy(tab === 'done' ? desc(t.visits.plannedDate) : asc(t.visits.plannedDate)).limit(200);
  const cnt = async (w: SQL[]) => (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(t.visits).where(and(...w, ...mine)))[0].n;
  const [nToday, nWeek, nOver] = await Promise.all([cnt(filters.today), cnt(filters.week), cnt(filters.overdue)]);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.v.plannedDate, [...(groups.get(r.v.plannedDate) ?? []), r]);

  return (
    <>
      <PageHeader title={user.role === 'tech' ? 'Мои визиты' : 'Визиты'} sub="Установки, заправки, смены аромата и выезды по жалобам" />
      <Tabs active={`/visits?tab=${tab in filters ? tab : 'week'}`} items={[
        { href: '/visits?tab=today', label: 'Сегодня', count: nToday },
        { href: '/visits?tab=week', label: 'Неделя', count: nWeek },
        { href: '/visits?tab=overdue', label: 'Просрочено', count: nOver },
        { href: '/visits?tab=done', label: 'Выполнено' },
      ]} />
      {rows.length ? (
        <div className="grid gap-4">
          {[...groups].map(([date, items]) => (
            <Card key={date} title={<>{date === t0 ? 'Сегодня' : date === addDays(t0, 1) ? 'Завтра' : day(date)} <span className="font-normal text-ink-3">· {WEEKDAY[new Date(date + 'T00:00:00Z').getUTCDay()]}</span></>} pad={false}>
              <ul>{items.map(({ v, obj, company, who }) => (
                <li key={v.id} className="border-b border-line last:border-0">
                  <Link href={`/visits/${v.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{obj.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-3">{company !== obj.name && `${company} · `}{obj.address ?? 'адрес не указан'}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink-2">
                        <span>{VISIT_TYPE[v.type]}</span>
                        {user.role !== 'tech' && <span className="text-ink-3">{who ?? 'без техника'}</span>}
                        {v.rating && <span className="num">★ {v.rating}</span>}
                      </span>
                    </span>
                    <span className="shrink-0">{v.status === 'planned' && v.plannedDate < t0 ? <Badge tone="red">Просрочен</Badge> : <Badge tone={VISIT_STATUS[v.status][1]}>{VISIT_STATUS[v.status][0]}</Badge>}</span>
                  </Link>
                </li>
              ))}</ul>
            </Card>
          ))}
        </div>
      ) : <Card><Empty>{tab === 'overdue' ? 'Просроченных визитов нет' : 'Визитов нет'}</Empty></Card>}
    </>
  );
}
