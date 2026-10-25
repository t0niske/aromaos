import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { daysBetween, today } from '@/lib/dates';
import { STAGES } from '@/lib/domain';
import { CHANNEL_NAMES, SITE_NAMES, day, kzt } from '@/lib/format';
import { Badge, Empty, PageHeader, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Kanban } from './kanban';

export const metadata: Metadata = { title: 'Лиды и продажи' };

export default function LeadsPage({ searchParams }: PageProps<'/leads'>) {
  return (
    <Suspense fallback={<Skeleton rows={8} />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

const STAGE_TONE: Record<string, 'gray' | 'blue' | 'violet' | 'amber' | 'green' | 'red'> = {
  new: 'blue', qualify: 'gray', survey: 'gray', trial: 'violet', proposal: 'amber', contract: 'amber', won: 'green', lost: 'red',
};

async function Leads({ searchParams }: { searchParams: PageProps<'/leads'>['searchParams'] }) {
  await requireUser('leads');
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'kanban';
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const site = typeof sp.site === 'string' && sp.site in SITE_NAMES ? sp.site : '';
  const db = await getDb();
  const where: SQL[] = [];
  if (q) where.push(or(ilike(t.leads.name, `%${q}%`), ilike(t.leads.companyName, `%${q}%`), ilike(t.leads.phone, `%${q.replace(/\D/g, '') || q}%`))!);
  if (site) where.push(eq(t.leads.sourceSite, site));
  const rows = await db.select({ l: t.leads, owner: t.users.name }).from(t.leads).leftJoin(t.users, eq(t.users.id, t.leads.ownerId))
    .where(where.length ? and(...where) : undefined).orderBy(desc(t.leads.updatedAt));
  const t0 = today();
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(site && { site }), ...(view === 'list' && { view }), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return '/leads' + (s ? '?' + s : '');
  };

  return (
    <>
      <PageHeader title="Лиды и продажи" sub={`${rows.length} в выборке · перетащите карточку, чтобы сменить этап`}
        actions={<Link href="/leads/new" className="btn btn-primary"><Icon name="plus" size={16} />Новый лид</Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative w-full sm:w-72" action="/leads">
          {view === 'list' && <input type="hidden" name="view" value="list" />}
          {site && <input type="hidden" name="site" value={site} />}
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="input pl-9" name="q" defaultValue={q} placeholder="Имя, компания или телефон" aria-label="Поиск лидов" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {['', 'tynys', 'aua', 'vdokh', 'hosh', 'manual'].map(s => (
            <Link key={s} href={qs({ site: s })} className={`btn btn-sm ${site === s ? 'btn-primary' : ''}`}>{s ? SITE_NAMES[s] : 'Все сайты'}</Link>
          ))}
        </div>
        <div className="ml-auto flex gap-1 rounded-[10px] border border-line bg-surface p-0.5">
          <Link href={qs({ view: '' })} className={`btn btn-sm border-0 ${view === 'kanban' ? 'bg-accent-soft' : 'btn-ghost'}`}>Канбан</Link>
          <Link href={qs({ view: 'list' })} className={`btn btn-sm border-0 ${view === 'list' ? 'bg-accent-soft' : 'btn-ghost'}`}>Список</Link>
        </div>
      </div>

      {view === 'kanban' ? (
        <Kanban stages={STAGES} leads={rows.map(({ l, owner }) => ({
          id: l.id, title: l.companyName || l.name, person: l.name, site: l.sourceSite, siteName: SITE_NAMES[l.sourceSite] ?? l.sourceSite,
          area: l.areaM2, mrr: l.expectedMrr ? kzt(l.expectedMrr) : null, owner: owner ?? 'без ответственного',
          age: ageLabel(daysBetween(l.createdAt.toISOString().slice(0, 10), t0)), stage: l.stage,
          trialUntil: l.stage === 'trial' && l.trialUntil ? day(l.trialUntil) : null,
        }))} />
      ) : (
        <div className="card">
          {rows.length ? (
            <div className="tbl-wrap" data-scroll-x><table className="tbl">
              <thead><tr><th>Лид</th><th>Этап</th><th>Источник</th><th>Площадь</th><th>MRR</th><th>Ответственный</th><th>Создан</th></tr></thead>
              <tbody>{rows.map(({ l, owner }) => (
                <tr key={l.id}>
                  <td><Link className="row-link" href={`/leads/${l.id}`}>{l.companyName || l.name}</Link><div className="text-[12.5px] text-ink-3">{l.name}{l.phone ? ` · ${l.phone}` : ''}</div></td>
                  <td><Badge tone={STAGE_TONE[l.stage]}>{STAGES.find(s => s.id === l.stage)?.name}</Badge></td>
                  <td>{SITE_NAMES[l.sourceSite] ?? l.sourceSite}<div className="text-[12.5px] text-ink-3">{CHANNEL_NAMES[l.channel] ?? l.channel}</div></td>
                  <td className="num">{l.areaM2 ? `${l.areaM2} м²` : '—'}</td>
                  <td className="num">{kzt(l.expectedMrr)}</td>
                  <td>{owner ?? '—'}</td>
                  <td className="num text-ink-3">{day(l.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Ничего не нашлось. Измените поиск или фильтр.</Empty>}
        </div>
      )}
    </>
  );
}

function ageLabel(d: number) {
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`;
}
