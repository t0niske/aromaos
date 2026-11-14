import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { can } from '@/lib/access';
import { STAGES } from '@/lib/domain';
import { sourceGroup, SOURCE_GROUPS } from '@/lib/web-detect';
import { dur, when } from '@/lib/web-format';
import { CHANNEL_NAMES, PRIORITY, SITE_NAMES, day, dayYear, kzt } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Empty, Field, PageHeader, Skeleton } from '@/components/ui';
import { addNote, moveLeadAction, updateLead, winLeadAction } from '../actions';
import { StageSelect } from './stage-select';

export default function LeadPage({ params, searchParams }: PageProps<'/leads/[id]'>) {
  return <Suspense fallback={<Skeleton rows={10} />}><Lead params={params} searchParams={searchParams} /></Suspense>;
}

const KIND: Record<string, string> = { note: 'Заметка', call: 'Звонок', whatsapp: 'WhatsApp', meeting: 'Встреча', stage: 'Этап', system: 'Система' };

async function Lead({ params, searchParams }: Pick<PageProps<'/leads/[id]'>, 'params' | 'searchParams'>) {
  const user = await requireUser('leads');
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [row] = await db.select({ l: t.leads, owner: t.users.name }).from(t.leads).leftJoin(t.users, eq(t.users.id, t.leads.ownerId)).where(eq(t.leads.id, id));
  if (!row) notFound();
  const { l } = row;
  const [acts, tasks, sellers, tariffs, path] = await Promise.all([
    db.select({ a: t.activities, user: t.users.name }).from(t.activities).leftJoin(t.users, eq(t.users.id, t.activities.userId)).where(eq(t.activities.leadId, id)).orderBy(desc(t.activities.createdAt)),
    db.select().from(t.tasks).where(eq(t.tasks.leadId, id)).orderBy(asc(t.tasks.status), asc(t.tasks.dueDate)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ['sales', 'sales_head', 'owner', 'account']))),
    db.select({ id: t.tariffs.id, name: t.tariffs.name, total: t.tariffs.priceTotal, months: t.tariffs.periodMonths }).from(t.tariffs).where(eq(t.tariffs.active, true)).orderBy(asc(t.tariffs.modelId), asc(t.tariffs.periodMonths)),
    // «Путь клиента»: все заходы на сайт этого посетителя (cookie ar_vid) и заходы, отмеченные этой заявкой
    db.select().from(t.webVisits).where(l.visitorId ? or(eq(t.webVisits.vid, l.visitorId), eq(t.webVisits.leadId, id)) : eq(t.webVisits.leadId, id)).orderBy(asc(t.webVisits.startedAt)).limit(50),
  ]);
  const seeTraffic = can(user.role, 'traffic');
  const open = l.stage !== 'won' && l.stage !== 'lost';
  const suggest = tariffs.find(x => x.months === 6 && (l.areaM2 ?? 0) > 300 === x.name.includes('1000'))?.id;

  return (
    <>
      <PageHeader back={{ href: '/leads', label: 'Лиды' }} title={l.companyName || l.name}
        sub={<>{l.name}{l.phone && <> · <a className="link" href={`tel:${l.phone}`}>{l.phone}</a> · <a className="link" href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</>}
        actions={<StageSelect id={l.id} stage={l.stage} stages={STAGES} action={moveLeadAction} />} />

      {sp.dup && <p className="badge badge-amber mb-4 h-auto py-2 text-[13px]">Лид с этим телефоном уже был в работе — заявка добавлена в его историю.</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-4">
          {l.stage === 'won' && l.companyId && (
            <Card><div className="flex flex-wrap items-center justify-between gap-3"><span><Badge tone="green">Выиграно</Badge> <span className="ml-2">Клиент создан, подписка оформлена.</span></span><Link className="btn" href={`/clients/${l.companyId}`}>Карточка клиента</Link></div></Card>
          )}
          {l.stage === 'lost' && <Card><Badge tone="red">Проиграно</Badge> <span className="ml-2">Причина: {l.lostReason}</span></Card>}

          {open && (
            <section id="win" className="card scroll-mt-20 border-accent">
              <div className="card-h">Выиграть сделку <span className="text-[12.5px] font-normal text-ink-3">создаст клиента, объект, подписку, установку и задачи</span></div>
              <div className="card-b">
                <ActionForm action={winLeadAction.bind(null, l.id)} submit="Оформить подписку" className="grid gap-4 sm:grid-cols-2">
                  <Field label="Тариф">
                    <select className="input" name="tariffId" defaultValue={suggest} required>
                      {tariffs.map(x => <option key={x.id} value={x.id}>{x.name} — {kzt(x.total)} ({kzt(Math.round(x.total / x.months))}/мес)</option>)}
                    </select>
                  </Field>
                  <Field label="Начало"><input className="input" type="date" name="startDate" defaultValue={today()} required /></Field>
                  <Field label="Название объекта"><input className="input" name="objectName" defaultValue={l.companyName ?? ''} /></Field>
                  <Field label="Адрес"><input className="input" name="address" placeholder="Астана, …" /></Field>
                  <Field label="Скидка, %"><input className="input" type="number" name="discountPct" min={0} max={50} defaultValue={0} /></Field>
                </ActionForm>
              </div>
            </section>
          )}

          <Card title="История">
            <form action={addNote.bind(null, l.id)} className="mb-4 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
              <select className="input" name="kind" aria-label="Тип"><option value="note">Заметка</option><option value="call">Звонок</option><option value="whatsapp">WhatsApp</option><option value="meeting">Встреча</option></select>
              <input className="input" name="text" placeholder="Что обсудили, о чём договорились" aria-label="Текст" required />
              <button className="btn">Добавить</button>
            </form>
            {acts.length ? (
              <ol className="grid gap-3">
                {acts.map(({ a, user }) => (
                  <li key={a.id} className="grid grid-cols-[auto_1fr] gap-3">
                    <span className={`mt-1.5 size-2 rounded-full ${a.kind === 'stage' ? 'bg-accent' : 'bg-line'}`} />
                    <div><div className="text-[12.5px] text-ink-3">{KIND[a.kind] ?? a.kind} · {user ?? 'система'} · {day(a.createdAt)}</div><div>{a.text}</div></div>
                  </li>
                ))}
              </ol>
            ) : <Empty>Пока пусто</Empty>}
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Данные лида">
            <form action={updateLead.bind(null, l.id)} className="grid gap-3">
              <Field label="Имя"><input className="input" name="name" defaultValue={l.name} required /></Field>
              <Field label="Компания"><input className="input" name="companyName" defaultValue={l.companyName ?? ''} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Телефон"><input className="input" name="phone" defaultValue={l.phone ?? ''} /></Field>
                <Field label="Почта"><input className="input" name="email" defaultValue={l.email ?? ''} /></Field>
                <Field label="Сфера"><input className="input" name="industry" defaultValue={l.industry ?? ''} /></Field>
                <Field label="Площадь, м²"><input className="input" name="areaM2" type="number" defaultValue={l.areaM2 ?? ''} /></Field>
                <Field label="Ожидаемый MRR, ₸"><input className="input" name="expectedMrr" type="number" defaultValue={l.expectedMrr ?? ''} /></Field>
                <Field label="Ответственный">
                  <select className="input" name="ownerId" defaultValue={l.ownerId ?? ''}>
                    <option value="">—</option>{sellers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
              </div>
              <div><button className="btn">Сохранить</button></div>
            </form>
          </Card>

          <Card title="Откуда">
            <dl className="dl">
              <dt>Сайт</dt><dd>{SITE_NAMES[l.sourceSite] ?? l.sourceSite}</dd>
              <dt>Канал</dt><dd>{CHANNEL_NAMES[l.channel] ?? l.channel}</dd>
              {Object.entries(l.utm).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
              <dt>Создан</dt><dd>{dayYear(l.createdAt.toISOString().slice(0, 10))}</dd>
              {l.message && <><dt>Запрос</dt><dd>{l.message}</dd></>}
            </dl>
          </Card>

          {path.length > 0 && (
            <Card title={`Путь клиента · ${path.length}`} pad={false}>
              <p className="px-4 pt-3 text-[13px] text-ink-2">
                Первый заход {when(path[0].startedAt, false)} — {path[0].source}.
                {' '}{(() => { const d = Math.floor((l.createdAt.getTime() - path[0].startedAt.getTime()) / 864e5); return d > 0 ? `До заявки ${d} дн.` : 'Заявка в день первого захода.'; })()}
              </p>
              <ul className="mt-2">{path.slice().reverse().map(v => {
                const inner = <>
                  <span className="mt-1 inline-block size-2 shrink-0 rounded-full" style={{ background: SOURCE_GROUPS[sourceGroup(v.source)].color }} />
                  <span className="min-w-0 flex-1"><span className="num block">{when(v.startedAt, false)} · {v.source}</span>
                    <span className="block text-[12.5px] text-ink-3">{v.pages} стр. · {dur(v.activeSeconds)}{v.hasTel ? ' · телефон' : ''}{v.hasWa ? ' · WhatsApp' : ''}</span></span>
                  {v.leadId === l.id && <Badge tone="green">заявка</Badge>}
                </>;
                return <li key={v.id} className="border-t border-line text-[13px]">
                  {seeTraffic ? <Link href={`/traffic/${v.id}`} className="flex items-start gap-2 px-4 py-2 hover:bg-surface-2">{inner}</Link> : <div className="flex items-start gap-2 px-4 py-2">{inner}</div>}
                </li>;
              })}</ul>
            </Card>
          )}

          <Card title="Задачи" action={<Link className="link text-[13px]" href={`/tasks/new?lead=${l.id}`}>Добавить</Link>} pad={false}>
            {tasks.length ? <ul>{tasks.map(x => (
              <li key={x.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0">
                <span className={x.status === 'done' ? 'text-ink-3 line-through' : ''}>{x.title}</span>
                <Badge tone={x.status === 'done' ? 'gray' : PRIORITY[x.priority][1]}>{day(x.dueDate)}</Badge>
              </li>
            ))}</ul> : <Empty>Задач нет</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
