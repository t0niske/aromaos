import Image from 'next/image';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { addDays, addMonths, monthStart, today } from '@/lib/dates';
import { STAGES } from '@/lib/domain';
import { SCENT_FAMILY, SITE_NAMES, VISIT_TYPE, day, kzt, plural } from '@/lib/format';
import { Badge, Card, Empty, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { BarsUpDown, Donut, Gauge, Sparkline } from '@/components/charts';
import { SwitchTabs } from '@/components/switch-tabs';

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <Dashboard />
    </Suspense>
  );
}

const count = sql<number>`count(*)`.mapWith(Number);
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
// цвета сайтов-источников на диаграмме — из палитры темы
const SITES = ['tynys', 'aua', 'vdokh', 'hosh', 'manual'];
const SITE_TONE: Record<string, string> = { tynys: 'var(--t-green)', aua: 'var(--t-blue)', vdokh: 'var(--t-amber)', hosh: 'var(--accent)', manual: 'var(--t-gray)' };
const VISIT_TONE: Record<string, string> = { install: 'violet', service: 'green', scent_change: 'blue', repair: 'amber', uninstall: 'red', complaint: 'red' };
// «245 тыс» для осей и компактных подписей
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)} млн` : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n));
const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 100 : 0);
const astanaNow = () => new Date(Date.now() + 5 * 3_600_000);

async function Dashboard() {
  const user = await requireUser('dashboard');
  const db = await getDb();
  const t0 = today(), m0 = monthStart(t0), prevM0 = addMonths(m0, -1);
  const since = (d: string) => new Date(d + 'T00:00:00+05:00');

  const [subs, stages, leadSites, [leadsPrev], [clients], [pipeline], renewals, scents, visits, recentLeads, doneVisits, myTasks] = await Promise.all([
    db.select({ s: t.subscriptions, obj: t.objects.name }).from(t.subscriptions).innerJoin(t.objects, eq(t.objects.id, t.subscriptions.objectId)),
    db.select({ stage: t.leads.stage, n: count }).from(t.leads).groupBy(t.leads.stage),
    db.select({ site: t.leads.sourceSite, n: count }).from(t.leads).where(gte(t.leads.createdAt, since(m0))).groupBy(t.leads.sourceSite),
    db.select({ v: count }).from(t.leads).where(and(gte(t.leads.createdAt, since(prevM0)), sql`${t.leads.createdAt} < ${since(m0)}`)),
    db.select({ v: count }).from(t.companies),
    db.select({ v: sql<number>`coalesce(sum(${t.leads.expectedMrr}),0)`.mapWith(Number), n: count }).from(t.leads).where(inArray(t.leads.stage, ['trial', 'proposal', 'contract'])),
    db.select({ at: t.auditLog.createdAt, price: t.subscriptions.priceMonth }).from(t.auditLog)
      .innerJoin(t.subscriptions, sql`${t.subscriptions.id} = (${t.auditLog.data}->>'next')::int`)
      .where(and(eq(t.auditLog.action, 'renew'), eq(t.auditLog.entity, 'subscription'), gte(t.auditLog.createdAt, since(prevM0)))),
    db.select({ id: t.scents.id, n: t.scents.n, name: t.scents.name, family: t.scents.family, zones: count }).from(t.zones)
      .innerJoin(t.scents, eq(t.scents.id, t.zones.scentId))
      .where(sql`exists (select 1 from subscriptions s where s.object_id = ${t.zones.objectId} and s.status in ('active','renewing','trial'))`)
      .groupBy(t.scents.id).orderBy(desc(count), asc(t.scents.n)).limit(5),
    db.select({ v: t.visits, obj: t.objects.name, objId: t.objects.id, address: t.objects.address, who: t.users.name }).from(t.visits)
      .innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).leftJoin(t.users, eq(t.users.id, t.visits.employeeId))
      .where(and(eq(t.visits.status, 'planned'), lte(t.visits.plannedDate, addDays(t0, 7)))).orderBy(asc(t.visits.plannedDate), asc(t.visits.id)).limit(60),
    db.select().from(t.leads).orderBy(desc(t.leads.createdAt)).limit(6),
    db.select({ v: t.visits, obj: t.objects.name }).from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId))
      .where(and(eq(t.visits.status, 'done'), isNotNull(t.visits.doneAt), notInArray(t.visits.type, ['uninstall']))).orderBy(desc(t.visits.doneAt)).limit(6),
    db.select().from(t.tasks).where(and(eq(t.tasks.assigneeId, user.id), ne(t.tasks.status, 'done'), lte(t.tasks.dueDate, t0))).orderBy(asc(t.tasks.dueDate)).limit(6),
  ]);

  /* подписки → MRR, новые, отток. Продление = подписка, начавшаяся в день окончания предыдущей на том же объекте */
  const all = subs.map(x => x.s);
  const isRenewal = (s: (typeof all)[number]) => all.some(p => p.objectId === s.objectId && p.id !== s.id && p.endDate === s.startDate);
  const live = all.filter(s => (s.status === 'active' || s.status === 'renewing') && s.startDate <= t0);
  const mrr = live.reduce((a, s) => a + s.priceMonth, 0);
  const mrrAt = (d: string) => all.filter(s => s.status !== 'trial' && s.startDate <= d && s.endDate > d).reduce((a, s) => a + s.priceMonth, 0);
  const inMonth = (d: string, m: string) => d >= m && d < addMonths(m, 1);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(m0, i - 5));
  const bars = months.map(m => ({
    label: MONTHS[+m.slice(5, 7) - 1], current: m === m0,
    up: all.filter(s => s.status !== 'trial' && inMonth(s.startDate, m) && s.startDate <= t0 && !isRenewal(s)).reduce((a, s) => a + s.priceMonth, 0),
    down: all.filter(s => s.status === 'cancelled' && inMonth(s.endDate, m)).reduce((a, s) => a + s.priceMonth, 0),
  }));
  const trend = [...months.slice(0, -1).map(m => mrrAt(addDays(addMonths(m, 1), -1))), mrr];
  const mrrGrowth = pct(mrr, trend[trend.length - 2]);

  const period = (m: string) => {
    const end = m === m0 ? t0 : addDays(addMonths(m, 1), -1);
    const fresh = all.filter(s => s.status !== 'trial' && s.startDate >= m && s.startDate <= end && !isRenewal(s));
    const churn = all.filter(s => s.status === 'cancelled' && s.endDate >= m && s.endDate <= end);
    const ren = renewals.filter(r => r.at >= since(m) && (m === m0 || r.at < since(m0)));
    return {
      newN: fresh.length, newSum: fresh.reduce((a, s) => a + s.priceMonth, 0),
      churnN: churn.length, churnSum: churn.reduce((a, s) => a + s.priceMonth, 0),
      renN: ren.length, renSum: ren.reduce((a, r) => a + r.price, 0),
    };
  };
  const cur = period(m0), prev = period(prevM0);
  const atRisk = all.filter(s => s.status === 'renewing');

  /* продажи */
  const stageN = (id: string) => stages.find(x => x.stage === id)?.n ?? 0;
  const won = stageN('won'), lost = stageN('lost');
  const conv = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const openLeads = stages.filter(s => s.stage !== 'won' && s.stage !== 'lost').reduce((a, s) => a + s.n, 0);
  const leadsMonth = leadSites.reduce((a, s) => a + s.n, 0);
  const leadsGrowth = pct(leadsMonth, leadsPrev.v);
  const funnel = STAGES.filter(s => s.id !== 'lost');
  const maxStage = Math.max(1, ...funnel.map(s => stageN(s.id)));
  const forecastAdd = Math.round((pipeline.v * conv) / 100);
  const nextMonth = MONTHS_NOM[+addMonths(m0, 1).slice(5, 7) - 1];

  /* визиты */
  const vToday = visits.filter(x => x.v.plannedDate === t0);
  const vWeek = visits.filter(x => x.v.plannedDate > t0);
  const vLate = visits.filter(x => x.v.plannedDate < t0);

  /* лента событий: подписки, расторжения, лиды, визиты */
  type Ev = { key: string; at: string; icon: string; tone: string; title: ReactNode; sub: string; end?: ReactNode };
  const money = (n: number, sign: '+' | '−') => <span className={`num font-medium ${sign === '+' ? 'text-[var(--t-green)]' : 'text-[var(--t-red)]'}`}>{sign}{kzt(n)}</span>;
  const events: Ev[] = [
    ...subs.filter(x => x.s.status !== 'trial' && x.s.startDate <= t0).map(({ s, obj }) => ({
      key: 's' + s.id, at: s.startDate + 'T09', icon: 'repeat', tone: isRenewal(s) ? 'violet' : 'green', title: obj,
      sub: `${isRenewal(s) ? 'Продление' : 'Новая подписка'} · ${day(s.startDate)}`, end: money(s.priceMonth, '+'),
    })),
    ...subs.filter(x => x.s.status === 'cancelled').map(({ s, obj }) => ({
      key: 'c' + s.id, at: s.endDate + 'T18', icon: 'close', tone: 'red', title: obj,
      sub: `Расторжение${s.cancelReason ? ': ' + s.cancelReason : ''} · ${day(s.endDate)}`, end: money(s.priceMonth, '−'),
    })),
    ...recentLeads.slice(0, 3).map(l => ({
      key: 'l' + l.id, at: new Date(l.createdAt.getTime() + 5 * 3_600_000).toISOString(), icon: 'funnel', tone: 'blue', title: l.companyName || l.name,
      sub: `Новый лид · ${day(l.createdAt)}`, end: <span className={`badge site-${l.sourceSite}`}>{SITE_NAMES[l.sourceSite]}</span>,
    })),
    ...doneVisits.slice(0, 2).map(({ v, obj }) => ({
      key: 'v' + v.id, at: new Date(v.doneAt!.getTime() + 5 * 3_600_000).toISOString(), icon: 'drop', tone: 'amber', title: obj,
      sub: `Визит: ${VISIT_TYPE[v.type].toLowerCase()} · ${day(v.doneAt)}`,
      end: v.rating ? <span className="num inline-flex items-center gap-1 text-ink-2"><Icon name="star" size={15} className="text-[var(--t-amber)]" />{v.rating}</span> : undefined,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 7);

  const hour = astanaNow().getUTCHours();
  const hello = hour < 5 ? 'Здравствуйте' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const updated = astanaNow().toISOString().slice(11, 16);
  const scentTotal = Math.max(1, scents.reduce((a, s) => a + s.zones, 0));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-12">
      {/* приветствие */}
      <section className="card relative overflow-hidden md:col-span-2 xl:col-span-5">
        <div className="relative z-10 p-6 pr-[40%] sm:pr-[36%]">
          <h1 className="text-[18px] font-medium">{hello}, {user.name.split(' ')[0]}!</h1>
          <p className="mt-0.5 text-ink-3">MRR — выручка в месяц</p>
          <div className="num mt-4 text-[26px] leading-tight font-semibold text-accent sm:text-[28px]">{kzt(mrr)}</div>
          <p className="mt-1 text-[13px] text-ink-3">{cur.newN ? `+${kzt(cur.newSum)} новых в ${MONTHS_IN[+m0.slice(5, 7) - 1]}` : `ARR ${kzt(mrr * 12)}`}</p>
          <Link href="/subscriptions" className="btn btn-primary btn-sm mt-4">Открыть подписки</Link>
        </div>
        <Image src="/img/device.webp" alt="" width={271} height={320} loading="eager"
          className="pointer-events-none absolute right-5 bottom-0 h-[78%] w-auto max-w-[32%] object-contain object-bottom drop-shadow-[0_12px_18px_rgba(47,43,61,.18)] sm:right-8" />
      </section>

      {/* статистика */}
      <section className="card flex flex-col md:col-span-2 xl:col-span-7">
        <div className="card-h"><span>Статистика</span><span className="text-[13px] font-normal text-ink-3">обновлено в {updated}</span></div>
        <div className="card-b mt-auto grid grid-cols-2 gap-x-4 gap-y-6 pt-6 pb-7 sm:grid-cols-4">
          <StatItem icon="funnel" tone="violet" value={openLeads} label="Лиды в работе" />
          <StatItem icon="building" tone="blue" value={clients.v} label={plural(clients.v, 'Клиент', 'Клиента', 'Клиентов')} />
          <StatItem icon="pin" tone="red" value={new Set(live.map(s => s.objectId)).size} label="Объектов на сервисе" />
          <StatItem icon="coin" tone="green" value={short(mrr)} label="MRR, ₸" />
        </div>
      </section>

      {/* малые карточки + лиды за месяц */}
      <div className="grid grid-cols-2 gap-6 md:col-span-2 xl:col-span-4">
        <section className="card flex flex-col p-5">
          <div className="text-[15px] font-medium text-ink">Конверсия</div>
          <div className="text-[13px] text-ink-3">лид → клиент</div>
          <div className="mt-auto pt-4"><Gauge value={conv} label={`${won} из ${won + lost}`} /></div>
          <p className="mt-3 text-center text-[12.5px] text-ink-3">закрытых сделок</p>
        </section>
        <section className="card flex flex-col p-5">
          <div className="text-[15px] font-medium text-ink">Рост MRR</div>
          <div className="text-[13px] text-ink-3">за 6 месяцев</div>
          <div className="mt-auto pt-4"><Sparkline points={trend} /></div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="num font-medium text-ink">{short(mrr)}</span>
            <Delta value={mrrGrowth} hint="к прошлому месяцу" />
          </div>
        </section>
        <section className="card col-span-2 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[17px] font-medium text-ink">Лиды за месяц</div>
              <div className="text-[13px] text-ink-3">по сайтам-источникам</div>
              <div className="num mt-5 text-[26px] leading-none font-semibold text-ink">{leadsMonth}</div>
              <div className="mt-2"><Delta value={leadsGrowth} hint="к прошлому месяцу" /></div>
            </div>
            <Donut parts={SITES.map(s => ({ label: SITE_NAMES[s], color: SITE_TONE[s], value: leadSites.find(x => x.site === s)?.n ?? 0 }))}
              center={<div><span className="num block text-[18px] font-semibold text-ink">{leadsMonth}</span><span className="block text-[11.5px] text-ink-3">{plural(leadsMonth, 'лид', 'лида', 'лидов')}</span></div>} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
            {SITES.map(s => (
              <li key={s} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: SITE_TONE[s] }} />{SITE_NAMES[s]}<span className="num text-ink-3">{leadSites.find(x => x.site === s)?.n ?? 0}</span></li>
            ))}
          </ul>
        </section>
      </div>

      {/* выручка по месяцам + прогноз */}
      <section className="card md:col-span-2 xl:col-span-8">
        <div className="grid lg:grid-cols-[1fr_250px]">
          <div className="min-w-0 border-line pb-5 lg:border-r">
            <div className="card-h">
              <span>Движение MRR<span className="sub">новые подписки и отток по месяцам</span></span>
              <span className="hidden items-center gap-4 text-[13px] font-normal text-ink-2 sm:flex">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" />Новый MRR</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--t-amber)]" />Отток</span>
              </span>
            </div>
            <div className="px-4 pt-3 sm:px-6"><BarsUpDown data={bars} fmt={short} /></div>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-line px-6 py-6 text-center lg:border-t-0">
            <span className="badge badge-violet">прогноз на {nextMonth}</span>
            <div className="num mt-4 text-[26px] leading-tight font-semibold text-ink">{kzt(mrr + forecastAdd)}</div>
            <p className="mt-1 text-[13px] text-ink-3">MRR + сделки в работе × конверсия</p>
            <dl className="mt-5 grid w-full gap-2.5 text-left text-[13.5px]">
              <Row k="Сейчас" v={kzt(mrr)} />
              <Row k={`Сделки (${pipeline.n})`} v={<span className="text-[var(--t-green)]">+{kzt(forecastAdd)}</span>} />
              <Row k="На продлении" v={<span className={atRisk.length ? 'text-[var(--t-amber)]' : ''}>{kzt(atRisk.reduce((a, s) => a + s.priceMonth, 0))}</span>} />
            </dl>
            <Link href="/leads" className="btn btn-soft btn-sm mt-6 w-full">Воронка продаж</Link>
          </div>
        </div>
      </section>

      {/* подписки за месяц */}
      <Card title={<>Подписки за месяц<span className="sub">в сравнении с прошлым</span></>} action={<Link href="/subscriptions" className="link text-[13px]">Все</Link>} className="xl:col-span-4">
        <ul className="grid grid-cols-1 gap-5 pt-1">
          <SubRow icon="plus" tone="green" title="Новые подписки" n={cur.newN} sum={`+${kzt(cur.newSum)}`} delta={pct(cur.newSum, prev.newSum)} />
          <SubRow icon="repeat" tone="violet" title="Продления" n={cur.renN} sum={`+${kzt(cur.renSum)}`} delta={pct(cur.renSum, prev.renSum)} />
          <SubRow icon="down" tone="red" title="Отток" n={cur.churnN} sum={cur.churnSum ? `−${kzt(cur.churnSum)}` : kzt(0)} delta={pct(cur.churnSum, prev.churnSum)} inverse />
          <SubRow icon="clock" tone="amber" title="На продлении" n={atRisk.length} sum={kzt(atRisk.reduce((a, s) => a + s.priceMonth, 0))} note="в ближайшие 30 дней" />
        </ul>
      </Card>

      {/* популярные ароматы */}
      <Card title={<>Популярные ароматы<span className="sub">по зонам на объектах</span></>} className="xl:col-span-4">
        {scents.length ? (
          <ul className="grid grid-cols-1 gap-4 pt-1">
            {scents.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3.5">
                <span className={`ichip ichip-sq num text-[13px] font-semibold ichip-${['violet', 'green', 'blue', 'amber', 'red'][i]}`}>№{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.name}</span>
                  <span className="block truncate text-[13px] text-ink-3">{SCENT_FAMILY[s.family] ?? s.family} · {s.zones} {plural(s.zones, 'зона', 'зоны', 'зон')}</span>
                </span>
                <span className="num font-medium text-ink">{Math.round((s.zones / scentTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
        ) : <Empty>Ароматы ещё не назначены зонам</Empty>}
      </Card>

      {/* ближайшие визиты */}
      <section className="card md:col-span-2 xl:col-span-4">
        <div className="card-h"><span>Визиты<span className="sub">{vToday.length} сегодня · {vLate.length} просрочено</span></span><Link href="/visits" className="link text-[13px]">Все</Link></div>
        <div className="mt-3">
          <SwitchTabs label="Визиты" tabs={[
            { id: 'today', label: 'Сегодня', count: vToday.length, content: <Timeline items={vToday} t0={t0} empty="На сегодня визитов нет" /> },
            { id: 'week', label: 'Неделя', count: vWeek.length, content: <Timeline items={vWeek} t0={t0} empty="На неделю визитов нет" /> },
            { id: 'late', label: 'Просрочено', count: vLate.length, content: <Timeline items={vLate} t0={t0} empty="Просрочек нет" late /> },
          ]} />
        </div>
      </section>

      {/* лента событий */}
      <Card title={<>Последние события<span className="sub">подписки, лиды и визиты</span></>} className="md:col-span-2 xl:col-span-5">
        {events.length ? (
          <ul className="grid grid-cols-1 gap-4 pt-1">
            {events.map(e => (
              <li key={e.key} className="flex items-center gap-3.5">
                <span className={`ichip ichip-sq ichip-${e.tone}`}><Icon name={e.icon} size={19} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{e.title}</span>
                  <span className="block truncate text-[13px] text-ink-3">{e.sub}</span>
                </span>
                <span className="shrink-0">{e.end}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>Событий пока нет</Empty>}
      </Card>

      {/* воронка */}
      <Card title={<>Воронка продаж<span className="sub">лиды по этапам</span></>} action={<Link href="/leads" className="link text-[13px]">Канбан</Link>} className="xl:col-span-3">
        <div className="grid gap-3 pt-1">
          {funnel.map(s => (
            <div key={s.id}>
              <div className="mb-1 flex justify-between text-[13.5px]"><span className="truncate">{s.name}</span><span className="num font-medium text-ink">{stageN(s.id)}</span></div>
              <span className="block h-2 overflow-hidden rounded-full bg-[var(--t-violet-bg)]">
                <span className="block h-full rounded-full" style={{ width: `${(stageN(s.id) / maxStage) * 100}%`, background: s.id === 'won' ? 'var(--t-green)' : 'var(--accent)' }} />
              </span>
            </div>
          ))}
          <p className="text-[12.5px] text-ink-3">Проиграно: {lost}</p>
        </div>
      </Card>

      {/* мои задачи */}
      <Card title={<>Мои задачи<span className="sub">на сегодня и просроченные</span></>} action={<Link href="/tasks" className="link text-[13px]">Все</Link>} className="xl:col-span-4">
        {myTasks.length ? (
          <ul className="grid grid-cols-1 gap-3 pt-1">{myTasks.map(x => (
            <li key={x.id} className="flex items-start gap-3">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${x.dueDate! < t0 ? 'bg-[var(--t-red)]' : 'bg-[var(--t-blue)]'}`} />
              <span className="min-w-0 flex-1 text-ink">{x.title}</span>
              <span className="shrink-0">{x.dueDate! < t0 ? <Badge tone="red">{day(x.dueDate)}</Badge> : <Badge tone="blue">сегодня</Badge>}</span>
            </li>
          ))}</ul>
        ) : <Empty>На сегодня задач нет</Empty>}
      </Card>
    </div>
  );
}

function StatItem({ icon, tone, value, label }: { icon: string; tone: string; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className={`ichip ichip-${tone} size-[42px]`}><Icon name={icon} size={22} /></span>
      <span className="min-w-0 leading-tight">
        <span className="num block text-[18px] font-semibold text-ink">{value}</span>
        <span className="block text-[13px] text-ink-3">{label}</span>
      </span>
    </div>
  );
}

function Delta({ value, hint, inverse = false }: { value: number; hint?: string; inverse?: boolean }) {
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[13px] font-medium ${value === 0 ? 'text-ink-3' : good ? 'text-[var(--t-green)]' : 'text-[var(--t-red)]'}`} title={hint}>
      {value !== 0 && <Icon name={value > 0 ? 'up' : 'down'} size={14} />}
      <span className="num">{value > 0 ? '+' : ''}{value}%</span>
    </span>
  );
}

function SubRow({ icon, tone, title, n, sum, delta, inverse, note }: { icon: string; tone: string; title: string; n: number; sum: string; delta?: number; inverse?: boolean; note?: string }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className={`ichip ichip-${tone}`}><Icon name={icon} size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="num block font-medium text-ink">{sum}</span>
        <span className="block truncate text-[13px] text-ink-3">{title} · {n}{note ? ` · ${note}` : ''}</span>
      </span>
      {delta != null && <Delta value={delta} inverse={inverse} hint="к прошлому месяцу" />}
    </li>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-ink-3">{k}</dt><dd className="num font-medium text-ink">{v}</dd></div>;
}

type VisitRow = { v: { id: number; plannedDate: string; type: string }; obj: string; objId: number; address: string | null; who: string | null };
function Timeline({ items, t0, empty, late = false }: { items: VisitRow[]; t0: string; empty: string; late?: boolean }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="px-6 pt-5 pb-4">
      {items.slice(0, 5).map((x, i, arr) => (
        <li key={x.v.id} className="relative flex gap-3.5 pb-5 last:pb-1">
          {i < arr.length - 1 && <span className="absolute top-4 bottom-0 left-[6px] border-l border-dashed border-line-2" aria-hidden="true" />}
          <span className={`relative mt-1 size-[13px] shrink-0 rounded-full border-[3px] border-[var(--surface)] shadow-[0_0_0_1.5px_currentColor] ${late ? 'text-[var(--t-red)]' : `text-[var(--t-${VISIT_TONE[x.v.type] ?? 'gray'})]`}`} style={{ background: 'currentColor' }} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <Link href={`/objects/${x.objId}`} className="truncate font-medium text-ink hover:text-accent">{x.obj}</Link>
              <span className={`num shrink-0 text-[12.5px] ${late ? 'text-[var(--t-red)]' : 'text-ink-3'}`}>{x.v.plannedDate === t0 ? 'сегодня' : day(x.v.plannedDate)}</span>
            </span>
            <span className="block truncate text-[13px] text-ink-3">{VISIT_TYPE[x.v.type]}{x.who ? ` · ${x.who}` : ''}</span>
            {x.address && <span className="block truncate text-[12.5px] text-ink-3">{x.address}</span>}
          </span>
        </li>
      ))}
      {items.length > 5 && <li className="text-center text-[13px]"><Link href="/visits" className="link">Ещё {items.length - 5}</Link></li>}
    </ul>
  );
}
