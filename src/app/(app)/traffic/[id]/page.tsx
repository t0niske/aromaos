/* Один заход на сайт: откуда пришёл, путь по страницам со временем и действиями, все заходы этого посетителя. */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { SITE_NAMES } from '@/lib/format';
import { SOURCE_GROUPS, WEB_EVENTS, sourceGroup } from '@/lib/web-detect';
import { KIND, clock, dur, isOnline, when } from '@/lib/web-format';
import { Badge, Card, Empty, PageHeader, Skeleton } from '@/components/ui';

export default function VisitPage({ params }: PageProps<'/traffic/[id]'>) {
  return <Suspense fallback={<Skeleton rows={10} />}><Visit params={params} /></Suspense>;
}

async function Visit({ params }: Pick<PageProps<'/traffic/[id]'>, 'params'>) {
  await requireUser('traffic');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [v] = await db.select().from(t.webVisits).where(eq(t.webVisits.id, id));
  if (!v) notFound();
  const [pages, events, others, lead] = await Promise.all([
    db.select().from(t.webPages).where(eq(t.webPages.visitId, id)).orderBy(asc(t.webPages.openedAt), asc(t.webPages.id)),
    db.select().from(t.webEvents).where(eq(t.webEvents.visitId, id)).orderBy(asc(t.webEvents.id)),
    db.select().from(t.webVisits).where(and(eq(t.webVisits.vid, v.vid), ne(t.webVisits.id, id))).orderBy(desc(t.webVisits.startedAt)).limit(30),
    v.leadId ? db.select({ id: t.leads.id, name: t.leads.name, company: t.leads.companyName }).from(t.leads).where(eq(t.leads.id, v.leadId)).then(r => r[0]) : null,
  ]);
  const online = isOnline(v.lastPingAt);
  const utm = Object.entries(v.utm);
  const firstVisit = others.length ? others[others.length - 1].startedAt : v.startedAt;

  return (
    <>
      <PageHeader back={{ href: '/traffic', label: 'Заходы на сайт' }}
        title={<>{when(v.startedAt, false)} · {v.source}</>}
        sub={<>{v.pages} стр. · {dur(v.activeSeconds)} на экране · {v.device}{v.number > 1 ? ` · ${v.number}-й заход посетителя` : ' · первый заход'}</>}
        actions={<span className="flex flex-wrap gap-1.5">
          {online && <Badge tone="green">Сейчас на сайте</Badge>}
          {lead && <Link href={`/leads/${lead.id}`} className="badge badge-green h-8 px-3 text-[13px]">Заявка №{lead.id}: {lead.company || lead.name}</Link>}
          <Badge tone={KIND[v.kind][1]}>{KIND[v.kind][0]}</Badge>
        </span>} />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title="Путь по сайту" pad={false}>
          {pages.length ? (
            <ol className="relative">
              {pages.map((pg, i) => {
                const evs = events.filter(e => e.pageId === pg.id && e.name !== 'scroll');
                return (
                  <li key={pg.id} className="border-t border-line px-4 py-3 first:border-0">
                    <div className="flex items-start gap-3">
                      <span className="num mt-0.5 w-16 shrink-0 text-[12.5px] text-ink-3">{clock(pg.openedAt)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{pg.title || pg.path}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">{pg.path}</span>
                      </span>
                      <span className="num shrink-0 text-right text-[12.5px] text-ink-2">{dur(pg.activeSeconds)}<br /><span className="text-ink-3">прочитано {pg.scroll}%</span></span>
                    </div>
                    {evs.length > 0 && <ul className="mt-2 ml-[76px] grid gap-1">{evs.map(e => (
                      <li key={e.id} className="flex gap-2 text-[13px]"><span className="num text-ink-3">{clock(e.createdAt)}</span>
                        <span className={e.name === 'lead' ? 'font-medium text-[var(--t-green)]' : ''}>{WEB_EVENTS[e.name] ?? e.name}{e.data ? `: ${e.name === 'lead' ? '№' : ''}${e.data}` : ''}</span></li>
                    ))}</ul>}
                    {i === pages.length - 1 && v.hasLeave && <div className="mt-2 ml-[76px] text-[12.5px] text-ink-3">Ушёл с сайта</div>}
                  </li>
                );
              })}
            </ol>
          ) : <Empty>Страниц нет</Empty>}
        </Card>

        <div className="grid content-start gap-4">
          <Card title="Откуда и с чего">
            <dl className="dl">
              <dt>Источник</dt><dd><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SOURCE_GROUPS[sourceGroup(v.source)].color }} />{v.source}</dd>
              {v.referrer && <><dt>Переход с</dt><dd className="break-all">{v.referrer}</dd></>}
              <dt>Страница входа</dt><dd className="break-all">{v.landing ?? '—'}</dd>
              {utm.map(([key, val]) => <Fragment key={key}><dt>{key}</dt><dd className="break-all">{val}</dd></Fragment>)}
              <dt>Сайт</dt><dd>{SITE_NAMES[v.site] ?? v.site}</dd>
            </dl>
          </Card>
          <Card title="Устройство">
            <dl className="dl">
              <dt>Устройство</dt><dd>{v.device}</dd>
              <dt>Система</dt><dd>{v.os}</dd>
              <dt>Браузер</dt><dd>{v.browser}</dd>
              {v.screen && <><dt>Экран</dt><dd>{v.screen}</dd></>}
              {v.lang && <><dt>Язык</dt><dd>{v.lang}</dd></>}
              {v.tz && <><dt>Часовой пояс</dt><dd>{v.tz}</dd></>}
              {v.ip && <><dt>IP</dt><dd className="num">{v.ip}</dd></>}
              {v.ym && <><dt>Метрика ClientID</dt><dd className="num break-all">{v.ym} <span className="block text-[12px] text-ink-3">по нему запись ищется в Вебвизоре</span></dd></>}
              {v.reasons && <><dt>Почему {KIND[v.kind][0]}</dt><dd>{v.reasons}</dd></>}
            </dl>
          </Card>
          <Card title={`Все заходы посетителя · ${others.length + 1}`} pad={false}>
            <p className="px-4 pt-3 text-[13px] text-ink-3">Первый заход {when(firstVisit, false)}</p>
            <ul className="mt-2">
              {[v, ...others].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).map(o => (
                <li key={o.id} className="border-t border-line">
                  {o.id === v.id
                    ? <div className="flex items-center gap-2 bg-surface-2 px-4 py-2 text-[13px]"><span className="num w-24 shrink-0">{when(o.startedAt, false)}</span><span className="min-w-0 flex-1 truncate font-medium">{o.source}</span><span className="text-ink-3">этот</span></div>
                    : <Link href={`/traffic/${o.id}`} className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-surface-2">
                      <span className="num w-24 shrink-0">{when(o.startedAt, false)}</span><span className="min-w-0 flex-1 truncate">{o.source}</span>
                      <span className="num text-ink-3">{o.pages} стр.</span>{o.leadId && <Badge tone="green">№{o.leadId}</Badge>}
                    </Link>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
