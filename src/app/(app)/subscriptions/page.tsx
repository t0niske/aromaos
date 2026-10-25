import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { daysBetween, today } from '@/lib/dates';
import { SUB_STATUS, dayYear, kzt } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Skeleton, Stat, Tabs } from '@/components/ui';

export const metadata: Metadata = { title: 'Подписки' };

export default function SubscriptionsPage({ searchParams }: PageProps<'/subscriptions'>) {
  return <Suspense fallback={<Skeleton />}><Subs searchParams={searchParams} /></Suspense>;
}

const TABS = { live: ['active', 'renewing'], renewing: ['renewing'], paused: ['paused', 'trial'], cancelled: ['cancelled'] } as const;
type Tab = keyof typeof TABS;

async function Subs({ searchParams }: { searchParams: PageProps<'/subscriptions'>['searchParams'] }) {
  await requireUser('subscriptions');
  const raw = String((await searchParams).tab ?? 'live');
  const tab: Tab = raw in TABS ? (raw as Tab) : 'live';
  const db = await getDb();
  const t0 = today();
  const [rows, counts, byModel, reasons] = await Promise.all([
    db.select({ s: t.subscriptions, obj: t.objects, company: t.companies.name, tariff: t.tariffs.name })
      .from(t.subscriptions).innerJoin(t.objects, eq(t.objects.id, t.subscriptions.objectId))
      .innerJoin(t.companies, eq(t.companies.id, t.objects.companyId)).innerJoin(t.tariffs, eq(t.tariffs.id, t.subscriptions.tariffId))
      .where(inArray(t.subscriptions.status, [...TABS[tab]])).orderBy(asc(t.subscriptions.endDate)),
    db.select({ status: t.subscriptions.status, n: sql<number>`count(*)`.mapWith(Number) }).from(t.subscriptions).groupBy(t.subscriptions.status),
    db.select({ model: t.deviceModels.name, mrr: sql<number>`sum(${t.subscriptions.priceMonth})`.mapWith(Number), n: sql<number>`count(*)`.mapWith(Number) })
      .from(t.subscriptions).innerJoin(t.tariffs, eq(t.tariffs.id, t.subscriptions.tariffId)).innerJoin(t.deviceModels, eq(t.deviceModels.id, t.tariffs.modelId))
      .where(inArray(t.subscriptions.status, ['active', 'renewing'])).groupBy(t.deviceModels.name),
    db.select({ reason: t.subscriptions.cancelReason, n: sql<number>`count(*)`.mapWith(Number) }).from(t.subscriptions).where(eq(t.subscriptions.status, 'cancelled')).groupBy(t.subscriptions.cancelReason),
  ]);
  const n = (st: readonly string[]) => counts.filter(c => st.includes(c.status)).reduce((a, c) => a + c.n, 0);
  const mrr = byModel.reduce((a, m) => a + m.mrr, 0);
  const avg = n(TABS.live) ? Math.round(mrr / n(TABS.live)) : 0;

  return (
    <>
      <PageHeader title="Подписки" sub="Тариф, срок, продления и паузы по каждому объекту" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR" value={kzt(mrr)} hint={`средний чек ${kzt(avg)}`} />
        {byModel.map(m => <Stat key={m.model} label={m.model} value={kzt(m.mrr)} hint={`${m.n} подписок`} />)}
        <Stat label="Расторгнуто" value={n(TABS.cancelled)} hint={reasons.length ? reasons.map(r => `${r.reason}: ${r.n}`).join(' · ') : 'пока ни одной'} tone={n(TABS.cancelled) ? 'warn' : 'up'} />
      </div>

      <Tabs active={`/subscriptions?tab=${tab}`} items={[
        { href: '/subscriptions?tab=live', label: 'Действующие', count: n(TABS.live) },
        { href: '/subscriptions?tab=renewing', label: 'На продлении', count: n(TABS.renewing) },
        { href: '/subscriptions?tab=paused', label: 'Пауза и тест', count: n(TABS.paused) },
        { href: '/subscriptions?tab=cancelled', label: 'Расторгнутые', count: n(TABS.cancelled) },
      ]} />

      <Card pad={false}>
        {rows.length ? (
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Объект</th><th>Тариф</th><th>₸ / мес</th><th>Период</th><th>Осталось</th><th>Статус</th></tr></thead>
            <tbody>{rows.map(({ s, obj, company, tariff }) => {
              const left = daysBetween(t0, s.endDate);
              return (
                <tr key={s.id}>
                  <td><Link className="row-link" href={`/objects/${obj.id}`}>{obj.name}</Link><div className="text-[12.5px] text-ink-3">{company}</div></td>
                  <td>{tariff}{s.discountPct ? <div className="text-[12.5px] text-ink-3">скидка {s.discountPct}%</div> : null}</td>
                  <td className="num font-medium">{kzt(s.priceMonth)}</td>
                  <td className="num text-ink-2">{dayYear(s.startDate)} — {dayYear(s.endDate)}</td>
                  <td className="num">{s.status === 'cancelled' ? <span className="text-ink-3">{s.cancelReason}</span> : left < 0 ? <Badge tone="red">истекла</Badge> : left <= 30 ? <Badge tone="amber">{left} дн.</Badge> : `${left} дн.`}</td>
                  <td><Badge tone={SUB_STATUS[s.status][1]}>{SUB_STATUS[s.status][0]}</Badge></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty>В этом статусе подписок нет</Empty>}
      </Card>
      <p className="mt-3 text-[12.5px] text-ink-3">Продлить, поставить на паузу или расторгнуть — в карточке объекта. За 30 дней до конца подписка сама переходит в «На продлении» и ставит задачу менеджеру (Настройки → «Проверить продления»).</p>
    </>
  );
}
