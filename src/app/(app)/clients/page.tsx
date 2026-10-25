import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { kzt } from '@/lib/format';
import { today } from '@/lib/dates';
import { Badge, Empty, PageHeader, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Клиенты' };

export default function ClientsPage({ searchParams }: PageProps<'/clients'>) {
  return <Suspense fallback={<Skeleton />}><Clients searchParams={searchParams} /></Suspense>;
}

async function Clients({ searchParams }: { searchParams: PageProps<'/clients'>['searchParams'] }) {
  await requireUser('clients');
  const q = String((await searchParams).q ?? '').trim();
  const db = await getDb();
  const rows = await db.select({
    c: t.companies, owner: t.users.name,
    objects: sql<number>`(select count(*) from objects o where o.company_id = "companies"."id")`.mapWith(Number),
    mrr: sql<number>`(select coalesce(sum(s.price_month),0) from subscriptions s join objects o on o.id = s.object_id where o.company_id = "companies"."id" and s.status in ('active','renewing') and s.start_date <= ${today()})`.mapWith(Number),
    renewing: sql<number>`(select count(*) from subscriptions s join objects o on o.id = s.object_id where o.company_id = "companies"."id" and s.status = 'renewing')`.mapWith(Number),
  }).from(t.companies).leftJoin(t.users, eq(t.users.id, t.companies.ownerId))
    .where(q ? or(ilike(t.companies.name, `%${q}%`), ilike(t.companies.bin, `%${q}%`)) : undefined).orderBy(desc(t.companies.createdAt));
  const total = rows.reduce((a, r) => a + r.mrr, 0);

  return (
    <>
      <PageHeader title="Клиенты" sub={`${rows.length} компаний · ${kzt(total)} MRR`}
        actions={<Link href="/clients/new" className="btn btn-primary"><Icon name="plus" size={16} />Клиент</Link>} />
      <form className="relative mb-4 w-full sm:w-80" action="/clients">
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input className="input pl-9" name="q" defaultValue={q} placeholder="Название или БИН" aria-label="Поиск клиентов" />
      </form>
      <div className="card">
        {rows.length ? (
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Компания</th><th>Сфера</th><th>Объекты</th><th>MRR</th><th>Ответственный</th><th /></tr></thead>
            <tbody>{rows.map(({ c, owner, objects, mrr, renewing }) => (
              <tr key={c.id}>
                <td><Link className="row-link" href={`/clients/${c.id}`}>{c.name}</Link><div className="text-[12.5px] text-ink-3">{c.legalForm}{c.bin ? ` · БИН ${c.bin}` : ''}</div></td>
                <td>{c.industry ?? '—'}</td>
                <td className="num">{objects}</td>
                <td className="num font-medium">{kzt(mrr)}</td>
                <td>{owner ?? '—'}</td>
                <td className="text-right">{renewing > 0 ? <Badge tone="blue">продление</Badge> : mrr === 0 ? <Badge>без подписки</Badge> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Клиентов не найдено</Empty>}
      </div>
    </>
  );
}
