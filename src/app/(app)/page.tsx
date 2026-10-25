import Link from 'next/link';
import { Suspense } from 'react';
import { and, asc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { addDays, monthStart, today } from '@/lib/dates';
import { STAGES } from '@/lib/domain';
import { DEVICE_STATUS, SITE_NAMES, VISIT_TYPE, day, kzt, plural } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Skeleton, Stat } from '@/components/ui';

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <Dashboard />
    </Suspense>
  );
}

const count = sql<number>`count(*)`.mapWith(Number);

async function Dashboard() {
  const user = await requireUser('dashboard');
  const db = await getDb();
  const t0 = today(), m0 = monthStart(t0);
  const live = inArray(t.subscriptions.status, ['active', 'renewing']);

  const [[mrr], [newMrr], [objectsLive], [leadsMonth], [won], [lost], [pipeline], [visitsToday], [overdue], [renewals], stages, sources, devs, upcoming, myTasks] = await Promise.all([
    db.select({ v: sql<number>`coalesce(sum(${t.subscriptions.priceMonth}),0)`.mapWith(Number) }).from(t.subscriptions).where(live),
    db.select({ v: sql<number>`coalesce(sum(${t.subscriptions.priceMonth}),0)`.mapWith(Number), n: count }).from(t.subscriptions).where(and(live, gte(t.subscriptions.startDate, m0))),
    db.select({ v: sql<number>`count(distinct ${t.subscriptions.objectId})`.mapWith(Number) }).from(t.subscriptions).where(live),
    db.select({ v: count }).from(t.leads).where(gte(t.leads.createdAt, new Date(m0 + 'T00:00:00+05:00'))),
    db.select({ v: count }).from(t.leads).where(eq(t.leads.stage, 'won')),
    db.select({ v: count }).from(t.leads).where(eq(t.leads.stage, 'lost')),
    db.select({ v: sql<number>`coalesce(sum(${t.leads.expectedMrr}),0)`.mapWith(Number), n: count }).from(t.leads).where(inArray(t.leads.stage, ['trial', 'proposal', 'contract'])),
    db.select({ v: count }).from(t.visits).where(and(eq(t.visits.plannedDate, t0), eq(t.visits.status, 'planned'))),
    db.select({ v: count }).from(t.visits).where(and(lt(t.visits.plannedDate, t0), eq(t.visits.status, 'planned'))),
    db.select({ v: count, sum: sql<number>`coalesce(sum(${t.subscriptions.priceMonth}),0)`.mapWith(Number) }).from(t.subscriptions).where(and(live, lte(t.subscriptions.endDate, addDays(t0, 30)))),
    db.select({ stage: t.leads.stage, n: count }).from(t.leads).groupBy(t.leads.stage),
    db.select({ site: t.leads.sourceSite, n: count, won: sql<number>`count(*) filter (where ${t.leads.stage} = 'won')`.mapWith(Number) }).from(t.leads).groupBy(t.leads.sourceSite),
    db.select({ status: t.devices.status, n: count }).from(t.devices).groupBy(t.devices.status),
    db.select({ v: t.visits, obj: t.objects.name, objId: t.objects.id }).from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId))
      .where(and(eq(t.visits.status, 'planned'), gte(t.visits.plannedDate, t0), lte(t.visits.plannedDate, addDays(t0, 7)))).orderBy(asc(t.visits.plannedDate)).limit(6),
    db.select().from(t.tasks).where(and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done'), lte(t.tasks.dueDate, t0))).orderBy(asc(t.tasks.dueDate)).limit(6),
  ]);

  const conv = won.v + lost.v ? Math.round((won.v / (won.v + lost.v)) * 100) : 0;
  const stageN = (id: string) => stages.find(x => x.stage === id)?.n ?? 0;
  const funnel = STAGES.filter(s => s.id !== 'lost');
  const maxStage = Math.max(1, ...funnel.map(s => stageN(s.id)));
  const totalSrc = Math.max(1, sources.reduce((a, b) => a + b.n, 0));

  return (
    <>
      <PageHeader title={`Добрый день, ${user.name.split(' ')[0]}`} sub="Главные цифры бизнеса на сегодня" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR — выручка в месяц" value={kzt(mrr.v)} hint={newMrr.n ? `+${kzt(newMrr.v)} за месяц · ${newMrr.n} ${plural(newMrr.n, 'подписка', 'подписки', 'подписок')}` : 'новых подписок в этом месяце нет'} tone={newMrr.n ? 'up' : undefined} />
        <Stat label="ARR — в год" value={kzt(mrr.v * 12)} hint={`${objectsLive.v} ${plural(objectsLive.v, 'активный объект', 'активных объекта', 'активных объектов')}`} />
        <Stat label="Сделки в работе" value={kzt(pipeline.v)} hint={`${pipeline.n} на тесте, КП или договоре · MRR`} />
        <Stat label="Конверсия лид → клиент" value={`${conv}%`} hint={`${leadsMonth.v} ${plural(leadsMonth.v, 'лид', 'лида', 'лидов')} за месяц`} tone={conv >= 15 ? 'up' : 'warn'} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Визиты сегодня" value={visitsToday.v} hint={overdue.v ? `${overdue.v} просрочено` : 'просрочек нет'} tone={overdue.v ? 'warn' : 'up'} />
        <Stat label="Продления в 30 дней" value={renewals.v} hint={renewals.v ? `${kzt(renewals.sum)} MRR под риском` : 'всё спокойно'} tone={renewals.v ? 'warn' : undefined} />
        <Stat label="Аппаратов у клиентов" value={devs.find(d => d.status === 'client')?.n ?? 0} hint={`${devs.find(d => d.status === 'stock')?.n ?? 0} на складе`} />
        <Stat label="Мои задачи на сегодня" value={myTasks.length} hint={myTasks.some(x => x.dueDate! < t0) ? 'есть просроченные' : 'по плану'} tone={myTasks.some(x => x.dueDate! < t0) ? 'warn' : undefined} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <Card title="Воронка продаж" action={<Link href="/leads" className="link text-[13px]">Открыть</Link>} className="xl:col-span-2">
          <div className="grid gap-2.5">
            {funnel.map(s => (
              <div key={s.id} className="grid grid-cols-[120px_1fr_36px] items-center gap-3 sm:grid-cols-[150px_1fr_40px]">
                <span className="truncate text-ink-2">{s.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(stageN(s.id) / maxStage) * 100}%`, opacity: s.id === 'won' ? 1 : 0.55 }} />
                </span>
                <span className="num text-right font-medium">{stageN(s.id)}</span>
              </div>
            ))}
            <p className="mt-1 text-[12.5px] text-ink-3">Проиграно: {stageN('lost')} · причины видны в карточках лидов</p>
          </div>
        </Card>

        <Card title="Откуда лиды">
          <div className="grid gap-3">
            {['tynys', 'aua', 'vdokh', 'hosh', 'manual'].map(site => {
              const r = sources.find(x => x.site === site);
              return (
                <div key={site}>
                  <div className="mb-1 flex justify-between"><span>{SITE_NAMES[site]}</span><span className="num text-ink-3">{r?.n ?? 0} · {r?.won ?? 0} выиграно</span></div>
                  <span className="block h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${((r?.n ?? 0) / totalSrc) * 100}%` }} /></span>
                </div>
              );
            })}
            <p className="text-[12.5px] text-ink-3">Сайты пока не подключены — лиды вносятся вручную или через API.</p>
          </div>
        </Card>

        <Card title="Ближайшие визиты" action={<Link href="/visits" className="link text-[13px]">Все</Link>} pad={false} className="xl:col-span-2">
          {upcoming.length ? (
            <div className="tbl-wrap" data-scroll-x><table className="tbl">
              <tbody>{upcoming.map(({ v, obj, objId }) => (
                <tr key={v.id}>
                  <td className="num w-24 text-ink-2">{v.plannedDate === t0 ? 'Сегодня' : day(v.plannedDate)}</td>
                  <td><Link className="row-link" href={`/objects/${objId}`}>{obj}</Link></td>
                  <td className="text-ink-2">{VISIT_TYPE[v.type]}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>На неделю визитов нет</Empty>}
        </Card>

        <Card title="Оборудование">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DEVICE_STATUS).map(([k, [label, tone]]) => (
              <div key={k} className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2">
                <Badge tone={tone}>{label}</Badge><span className="num font-semibold">{devs.find(d => d.status === k)?.n ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Мои задачи" action={<Link href="/tasks" className="link text-[13px]">Все</Link>} pad={false} className="xl:col-span-3">
          {myTasks.length ? (
            <ul>{myTasks.map(x => (
              <li key={x.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <span className="min-w-0 truncate">{x.title}</span>
                <span className="shrink-0">{x.dueDate! < t0 ? <Badge tone="red">просрочено · {day(x.dueDate)}</Badge> : <Badge tone="blue">сегодня</Badge>}</span>
              </li>
            ))}</ul>
          ) : <Empty>На сегодня задач нет</Empty>}
        </Card>
      </div>
    </>
  );
}
