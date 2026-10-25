import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { SUB_STATUS, day, kzt } from '@/lib/format';
import { Badge, Empty, PageHeader, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Объекты' };

export default function ObjectsPage({ searchParams }: PageProps<'/objects'>) {
  return <Suspense fallback={<Skeleton />}><Objects searchParams={searchParams} /></Suspense>;
}

async function Objects({ searchParams }: { searchParams: PageProps<'/objects'>['searchParams'] }) {
  await requireUser('objects');
  const q = String((await searchParams).q ?? '').trim();
  const db = await getDb();
  const rows = await db.select({
    o: t.objects, company: t.companies.name,
    sub: sql<{ status: string; price: number; end: string } | null>`(select json_build_object('status', s.status, 'price', s.price_month, 'end', s.end_date) from subscriptions s where s.object_id = "objects"."id" and s.status <> 'cancelled' order by s.start_date desc limit 1)`,
    next: sql<string | null>`(select min(v.planned_date)::text from visits v where v.object_id = "objects"."id" and v.status = 'planned')`,
    devices: sql<number>`(select count(*) from devices d where d.object_id = "objects"."id")`.mapWith(Number),
  }).from(t.objects).innerJoin(t.companies, eq(t.companies.id, t.objects.companyId))
    .where(q ? or(ilike(t.objects.name, `%${q}%`), ilike(t.objects.address, `%${q}%`), ilike(t.companies.name, `%${q}%`)) : undefined)
    .orderBy(asc(t.objects.name));

  return (
    <>
      <PageHeader title="Объекты" sub={`${rows.length} точек, где стоят диффузоры`} />
      <form className="relative mb-4 w-full sm:w-80" action="/objects">
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input className="input pl-9" name="q" defaultValue={q} placeholder="Объект, адрес или клиент" aria-label="Поиск объектов" />
      </form>
      <div className="card">
        {rows.length ? (
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Объект</th><th>Клиент</th><th>Площадь</th><th>Подписка</th><th>Аппараты</th><th>Следующий визит</th></tr></thead>
            <tbody>{rows.map(({ o, company, sub, next, devices }) => (
              <tr key={o.id}>
                <td><Link className="row-link" href={`/objects/${o.id}`}>{o.name}</Link><div className="text-[12.5px] text-ink-3">{o.address ?? '—'}</div></td>
                <td><Link className="hover:text-accent" href={`/clients/${o.companyId}`}>{company}</Link></td>
                <td className="num">{o.areaM2 ? `${o.areaM2} м²` : '—'}</td>
                <td>{sub ? <><Badge tone={SUB_STATUS[sub.status][1]}>{SUB_STATUS[sub.status][0]}</Badge> <span className="num ml-1 text-ink-2">{kzt(sub.price)}</span></> : <Badge>нет</Badge>}</td>
                <td className="num">{devices}</td>
                <td className="num">{day(next)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Объектов не найдено</Empty>}
      </div>
    </>
  );
}
