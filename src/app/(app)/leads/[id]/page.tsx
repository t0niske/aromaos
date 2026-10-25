import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { STAGES } from '@/lib/domain';
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
  await requireUser('leads');
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [row] = await db.select({ l: t.leads, owner: t.users.name }).from(t.leads).leftJoin(t.users, eq(t.users.id, t.leads.ownerId)).where(eq(t.leads.id, id));
  if (!row) notFound();
  const { l } = row;
  const [acts, tasks, sellers, tariffs] = await Promise.all([
    db.select({ a: t.activities, user: t.users.name }).from(t.activities).leftJoin(t.users, eq(t.users.id, t.activities.userId)).where(eq(t.activities.leadId, id)).orderBy(desc(t.activities.createdAt)),
    db.select().from(t.tasks).where(eq(t.tasks.leadId, id)).orderBy(asc(t.tasks.status), asc(t.tasks.dueDate)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ['sales', 'sales_head', 'owner', 'account']))),
    db.select({ id: t.tariffs.id, name: t.tariffs.name, total: t.tariffs.priceTotal, months: t.tariffs.periodMonths }).from(t.tariffs).where(eq(t.tariffs.active, true)).orderBy(asc(t.tariffs.modelId), asc(t.tariffs.periodMonths)),
  ]);
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
