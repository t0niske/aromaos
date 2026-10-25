import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/access';
import { STAGES } from '@/lib/domain';
import { SITE_NAMES } from '@/lib/format';
import { Badge, Empty, PageHeader, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Поиск' };

/* Общий поиск из верхней панели: лиды, клиенты, объекты — только по разделам, доступным роли */
export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return <Suspense fallback={<Skeleton />}><Search searchParams={searchParams} /></Suspense>;
}

const LIMIT = 20;

async function Search({ searchParams }: { searchParams: PageProps<'/search'>['searchParams'] }) {
  const user = await requireUser();
  const q = String((await searchParams).q ?? '').trim().slice(0, 80);
  if (!q) return (
    <>
      <PageHeader title="Поиск" />
      <div className="card"><Empty>Введите имя, компанию, телефон, БИН или адрес в строке поиска сверху</Empty></div>
    </>
  );

  const db = await getDb();
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  const digits = q.replace(/\D/g, '');
  const [leads, clients, objects] = await Promise.all([
    can(user.role, 'leads') ? db.select().from(t.leads)
      .where(or(ilike(t.leads.name, like), ilike(t.leads.companyName, like), ilike(t.leads.email, like),
        ...(digits.length >= 4 ? [sql`regexp_replace(coalesce(${t.leads.phone}, ''), '\\D', '', 'g') like ${'%' + digits + '%'}`] : [])))
      .orderBy(desc(t.leads.createdAt)).limit(LIMIT) : [],
    can(user.role, 'clients') ? db.select().from(t.companies)
      .where(or(ilike(t.companies.name, like), ilike(t.companies.bin, like), ilike(t.companies.industry, like)))
      .orderBy(desc(t.companies.createdAt)).limit(LIMIT) : [],
    can(user.role, 'objects') ? db.select({ o: t.objects, company: t.companies.name }).from(t.objects).innerJoin(t.companies, eq(t.companies.id, t.objects.companyId))
      .where(or(ilike(t.objects.name, like), ilike(t.objects.address, like), ilike(t.objects.type, like)))
      .orderBy(desc(t.objects.createdAt)).limit(LIMIT) : [],
  ]);
  const total = leads.length + clients.length + objects.length;

  return (
    <>
      <PageHeader title={`Поиск: «${q}»`} sub={total ? `Найдено: ${total}` : 'Ничего не найдено'} />
      {!total && <div className="card"><Empty>По запросу «{q}» ничего нет. Попробуйте часть названия или номера телефона.</Empty></div>}
      <div className="grid gap-5 xl:grid-cols-3">
        {leads.length > 0 && (
          <Group title="Лиды" icon="funnel" tone="violet" n={leads.length}>
            {leads.map(l => (
              <Row key={l.id} href={`/leads/${l.id}`} title={l.companyName || l.name} sub={[l.companyName ? l.name : null, l.phone, SITE_NAMES[l.sourceSite]].filter(Boolean).join(' · ')}
                end={<Badge tone={l.stage === 'won' ? 'green' : l.stage === 'lost' ? 'red' : 'violet'}>{STAGES.find(s => s.id === l.stage)?.name}</Badge>} />
            ))}
          </Group>
        )}
        {clients.length > 0 && (
          <Group title="Клиенты" icon="building" tone="green" n={clients.length}>
            {clients.map(c => <Row key={c.id} href={`/clients/${c.id}`} title={c.name} sub={[c.legalForm, c.bin && `БИН ${c.bin}`, c.industry].filter(Boolean).join(' · ')} />)}
          </Group>
        )}
        {objects.length > 0 && (
          <Group title="Объекты" icon="pin" tone="blue" n={objects.length}>
            {objects.map(({ o, company }) => <Row key={o.id} href={`/objects/${o.id}`} title={o.name} sub={[company, o.address].filter(Boolean).join(' · ')} />)}
          </Group>
        )}
      </div>
    </>
  );
}

function Group({ title, icon, tone, n, children }: { title: string; icon: string; tone: string; n: number; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-h"><span className="flex items-center gap-3"><span className={`ichip ichip-sq ichip-${tone}`}><Icon name={icon} size={20} /></span>{title}</span><span className="num text-ink-3">{n}</span></div>
      <ul className="card-b grid grid-cols-1 gap-1 pt-3">{children}</ul>
    </section>
  );
}

function Row({ href, title, sub, end }: { href: string; title: string; sub?: string; end?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-3 flex items-center gap-3 rounded-[6px] px-3 py-2 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{title}</span>
          {sub && <span className="block truncate text-[13px] text-ink-3">{sub}</span>}
        </span>
        {end}
      </Link>
    </li>
  );
}
