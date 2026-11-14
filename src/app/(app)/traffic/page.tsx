/* Заходы на сайт: сводка за период и список заходов (свой счётчик, без записи экрана). Видят собственник,
   руководитель продаж и маркетолог. Боты по умолчанию скрыты. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { SITE_NAMES, plural } from '@/lib/format';
import { SOURCE_GROUPS, WEB_EVENTS, sourceGroup, type SourceGroup } from '@/lib/web-detect';
import { KIND, cleanPath, dur, onlineSince, when } from '@/lib/web-format';
import { Badge, Card, Empty, PageHeader, Skeleton, Stat, Tabs } from '@/components/ui';

export const metadata: Metadata = { title: 'Заходы на сайт' };

export default function TrafficPage({ searchParams }: PageProps<'/traffic'>) {
  return <Suspense fallback={<Skeleton rows={10} />}><Traffic searchParams={searchParams} /></Suspense>;
}

const PERIODS: Record<string, [string, number]> = { today: ['Сегодня', 1], '7': ['7 дней', 7], '30': ['30 дней', 30], '90': ['90 дней', 90] };
const KINDS: Record<string, string> = { people: 'Люди', suspect: 'Подозрительные', bots: 'Боты', all: 'Все' };
const FLAGS: Record<string, string> = { lead: 'С заявкой', tel: 'Нажали телефон', wa: 'Открыли WhatsApp', form: 'Открывали форму' };

/* начало периода: полночь по Астане (UTC+5) n−1 дней назад */
function since(days: number) {
  const a = new Date(Date.now() + 5 * 3_600_000);
  return new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - 5 * 3_600_000 - (days - 1) * 864e5);
}
const pathExpr = (col: typeof t.webVisits.landing | typeof t.webPages.path) => sql<string>`split_part(${col}, ${sql.raw("'?'")}, 1)`;

async function Traffic({ searchParams }: { searchParams: PageProps<'/traffic'>['searchParams'] }) {
  await requireUser('traffic');
  const sp = await searchParams;
  const p = String(sp.p ?? '7') in PERIODS ? String(sp.p ?? '7') : '7';
  const k = String(sp.k ?? 'people') in KINDS ? String(sp.k ?? 'people') : 'people';
  const f = String(sp.f ?? '') in FLAGS ? String(sp.f) : '';
  const g = String(sp.g ?? '') in SOURCE_GROUPS ? (String(sp.g) as SourceGroup) : null;
  const lim = Math.min(1000, Math.max(100, Number(sp.n) || 100));
  const href = (o: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries({ p, k, f, g: g ?? '', ...o }).filter(([key, v]) => v && !(key === 'p' && v === '7') && !(key === 'k' && v === 'people')) as [string, string][]);
    const s = q.toString();
    return '/traffic' + (s ? '?' + s : '');
  };

  const db = await getDb();
  const w = t.webVisits;
  const from = since(PERIODS[p][1]);
  const kindW = ({ people: ne(w.kind, 'bot'), suspect: eq(w.kind, 'suspect'), bots: eq(w.kind, 'bot') } as Record<string, SQL>)[k];
  const base = and(gte(w.startedAt, from), kindW);

  const sources = await db.select({ source: w.source, n: count(), people: countDistinct(w.vid), leads: countDistinct(w.leadId) })
    .from(w).where(base).groupBy(w.source).orderBy(desc(count()));
  const groupSources = g ? sources.filter(x => sourceGroup(x.source) === g).map(x => x.source) : null;
  const srcW = groupSources ? (groupSources.length ? inArray(w.source, groupSources) : sql`false`) : undefined;
  const flagW = ({ lead: isNotNull(w.leadId), tel: eq(w.hasTel, true), wa: eq(w.hasWa, true), form: eq(w.hasForm, true) } as Record<string, SQL>)[f];
  const where = and(base, srcW, flagW);

  const [[tot], [now], landings, pages, events, days, rows] = await Promise.all([
    db.select({
      visits: count(), people: countDistinct(w.vid), leads: countDistinct(w.leadId),
      tel: sql<number>`count(*) filter (where ${w.hasTel})`.mapWith(Number), wa: sql<number>`count(*) filter (where ${w.hasWa})`.mapWith(Number),
      active: sql<number>`coalesce(avg(${w.activeSeconds}), 0)`.mapWith(Number),
    }).from(w).where(where),
    db.select({ n: countDistinct(w.vid) }).from(w).where(and(ne(w.kind, 'bot'), gte(w.lastPingAt, onlineSince()))),
    db.select({ path: pathExpr(w.landing), n: count(), leads: countDistinct(w.leadId) }).from(w).where(where).groupBy(pathExpr(w.landing)).orderBy(desc(count())).limit(8),
    db.select({ path: pathExpr(t.webPages.path), n: count(), active: sql<number>`coalesce(avg(${t.webPages.activeSeconds}), 0)`.mapWith(Number) })
      .from(t.webPages).innerJoin(w, eq(w.id, t.webPages.visitId)).where(where).groupBy(pathExpr(t.webPages.path)).orderBy(desc(count())).limit(8),
    db.select({ name: t.webEvents.name, n: count(), people: countDistinct(w.vid) }).from(t.webEvents).innerJoin(w, eq(w.id, t.webEvents.visitId))
      .where(and(where, ne(t.webEvents.name, 'scroll'))).groupBy(t.webEvents.name).orderBy(desc(count())),
    db.select({ d: sql<string>`to_char((${w.startedAt} at time zone 'UTC') + interval '5 hours', 'YYYY-MM-DD')`, n: count() })
      .from(w).where(where).groupBy(sql`1`).orderBy(sql`1`),
    db.select().from(w).where(where).orderBy(desc(w.startedAt)).limit(lim),
  ]);

  const groups = new Map<SourceGroup, number>();
  for (const x of sources) groups.set(sourceGroup(x.source), (groups.get(sourceGroup(x.source)) ?? 0) + x.n);
  const totalAll = sources.reduce((a, x) => a + x.n, 0) || 1;
  const maxDay = Math.max(1, ...days.map(x => x.n));
  const chip = (on: boolean, to: string, label: string, color?: string) => (
    <Link key={to + label} href={to} className={`badge h-8 px-3 text-[13px] ${on ? 'badge-violet' : ''}`} aria-current={on ? 'true' : undefined}>
      {color && <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: color }} />}{label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Заходы на сайт" sub="Откуда пришли, что смотрели и что делали на сайте. Свой счётчик: без записи экрана, данные полей формы не собираются" />
      <Tabs active={href({})} items={Object.entries(PERIODS).map(([key, [label]]) => ({ href: href({ p: key, n: null }), label }))} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Сейчас на сайте" value={now.n} hint="за последние 2 минуты" icon="users" color="green" />
        <Stat label="Посетителей" value={tot.people} hint={`${tot.visits} ${plural(tot.visits, 'заход', 'захода', 'заходов')}`} icon="user" />
        <Stat label="Заявок с сайта" value={tot.leads} hint={tot.people ? `конверсия ${(tot.leads / tot.people * 100).toFixed(1)}%` : '—'} icon="funnel" color="amber" />
        <Stat label="Нажали телефон / WhatsApp" value={`${tot.tel} / ${tot.wa}`} hint="заходов с нажатием" icon="phone" color="blue" />
        <Stat label="Время на сайте" value={dur(Math.round(tot.active))} hint="в среднем за заход" icon="clock" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(KINDS).map(([key, label]) => chip(k === key, href({ k: key, n: null }), label))}
        <span className="mx-1 h-5 w-px bg-line" />
        {chip(!f, href({ f: null, n: null }), 'Все заходы')}
        {Object.entries(FLAGS).map(([key, label]) => chip(f === key, href({ f: key, n: null }), label))}
      </div>

      {days.length > 1 && (
        <Card title="Заходы по дням" className="mb-4">
          <div className="flex h-32 items-end gap-1" role="img" aria-label="Заходы по дням">
            {days.map(x => (
              <div key={x.d} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${+x.d.slice(8)}.${x.d.slice(5, 7)}: ${x.n}`}>
                <div className="rounded-t bg-accent/80" style={{ height: `${Math.max(3, (x.n / maxDay) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[12px] text-ink-3"><span>{+days[0].d.slice(8)}.{days[0].d.slice(5, 7)}</span><span>{+days[days.length - 1].d.slice(8)}.{days[days.length - 1].d.slice(5, 7)}</span></div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title="Источники" pad={false}>
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {chip(!g, href({ g: null, n: null }), 'Все')}
            {[...groups].sort((a, b) => b[1] - a[1]).map(([key, n]) => chip(g === key, href({ g: key, n: null }), `${SOURCE_GROUPS[key].label} · ${Math.round(n / totalAll * 100)}%`, SOURCE_GROUPS[key].color))}
          </div>
          {sources.length ? (
            <ul className="mt-2">{sources.filter(x => !g || sourceGroup(x.source) === g).slice(0, 10).map(x => (
              <li key={x.source} className="flex items-center gap-2 border-t border-line px-4 py-2 text-[13.5px]">
                <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: SOURCE_GROUPS[sourceGroup(x.source)].color }} />
                <span className="min-w-0 flex-1 truncate">{x.source}</span>
                <span className="num text-ink-3">{x.people} чел.</span>
                {x.leads > 0 && <Badge tone="green">{x.leads} заяв.</Badge>}
              </li>
            ))}</ul>
          ) : <Empty>Заходов пока нет</Empty>}
        </Card>
        <Card title="Страницы входа" pad={false}>
          {landings.length ? <ul>{landings.map(x => (
            <li key={x.path} className="flex items-center gap-2 border-t border-line px-4 py-2 text-[13.5px] first:border-0">
              <span className="min-w-0 flex-1 truncate">{x.path || '/'}</span><span className="num text-ink-3">{x.n}</span>
              {x.leads > 0 && <Badge tone="green">{x.leads} заяв.</Badge>}
            </li>
          ))}</ul> : <Empty>—</Empty>}
        </Card>
        <Card title="Что делали" pad={false}>
          {events.length ? <ul>{events.map(x => (
            <li key={x.name} className="flex items-center gap-2 border-t border-line px-4 py-2 text-[13.5px] first:border-0">
              <span className="min-w-0 flex-1 truncate">{WEB_EVENTS[x.name] ?? x.name}</span><span className="num text-ink-3">{x.people} чел.</span>
            </li>
          ))}</ul> : <Empty>Действий пока нет</Empty>}
          {pages.length > 0 && <>
            <div className="card-h border-t border-line">Чаще смотрят</div>
            <ul>{pages.map(x => (
              <li key={x.path} className="flex items-center gap-2 border-t border-line px-4 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">{x.path || '/'}</span><span className="num text-ink-3">{x.n} · {dur(Math.round(x.active))}</span>
              </li>
            ))}</ul>
          </>}
        </Card>
      </div>

      <Card title={`Заходы${rows.length >= lim ? ` (последние ${lim})` : ` · ${rows.length}`}`} pad={false}>
        {rows.length ? (
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Когда</th><th>Источник</th><th>Вход</th><th>Страниц · время</th><th>Устройство</th><th>Заход №</th><th /></tr></thead>
            <tbody>{rows.map(v => (
              <tr key={v.id}>
                <td className="num"><Link className="row-link" href={`/traffic/${v.id}`}>{when(v.startedAt)}</Link></td>
                <td><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SOURCE_GROUPS[sourceGroup(v.source)].color }} />{v.source}</td>
                <td className="max-w-[220px] truncate text-ink-2" title={v.landing ?? ''}>{cleanPath(v.landing)}</td>
                <td className="num">{v.pages} · {dur(v.activeSeconds)}</td>
                <td className="text-ink-2">{v.device}{v.os && v.os !== '—' ? `, ${v.os}` : ''}</td>
                <td className="num">{v.number}{v.number > 1 && <span className="text-ink-3"> повтор</span>}</td>
                <td><span className="flex flex-wrap gap-1">
                  {v.leadId && <Badge tone="green">Заявка №{v.leadId}</Badge>}
                  {v.hasTel && <Badge tone="blue">телефон</Badge>}
                  {v.hasWa && <Badge tone="blue">WhatsApp</Badge>}
                  {v.kind !== 'human' && <Badge tone={KIND[v.kind][1]}>{KIND[v.kind][0]}</Badge>}
                  {v.site !== 'vdokh' && <Badge>{SITE_NAMES[v.site] ?? v.site}</Badge>}
                </span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>За этот период заходов нет. Счётчик пишет заходы с момента подключения на сайте.</Empty>}
        {rows.length >= lim && lim < 1000 && <div className="border-t border-line p-3 text-center"><Link className="link" href={href({ n: String(lim + 200) })}>Показать ещё</Link></div>}
      </Card>
    </>
  );
}
