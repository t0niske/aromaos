import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/access';
import { SUB_STATUS, VISIT_STATUS, VISIT_TYPE, day, dayYear, kzt } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Empty, Field, PageHeader, Skeleton, Stat } from '@/components/ui';
import { addContact, createObject, updateCompany } from '../../actions';

export default function ClientPage({ params, searchParams }: PageProps<'/clients/[id]'>) {
  return <Suspense fallback={<Skeleton rows={10} />}><Client params={params} searchParams={searchParams} /></Suspense>;
}

async function Client({ params, searchParams }: Pick<PageProps<'/clients/[id]'>, 'params' | 'searchParams'>) {
  const user = await requireUser('clients');
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(t.companies).where(eq(t.companies.id, id));
  if (!c) notFound();
  const objs = await db.select().from(t.objects).where(eq(t.objects.companyId, id)).orderBy(asc(t.objects.id));
  const objIds = objs.map(o => o.id);
  const [contacts, subs, visits, tasks] = await Promise.all([
    db.select().from(t.contacts).where(eq(t.contacts.companyId, id)),
    objIds.length ? db.select({ s: t.subscriptions, tariff: t.tariffs.name, total: t.tariffs.priceTotal }).from(t.subscriptions).innerJoin(t.tariffs, eq(t.tariffs.id, t.subscriptions.tariffId)).where(inArray(t.subscriptions.objectId, objIds)).orderBy(desc(t.subscriptions.startDate)) : [],
    objIds.length ? db.select({ v: t.visits, obj: t.objects.name }).from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).where(and(inArray(t.visits.objectId, objIds), ne(t.visits.status, 'cancelled'))).orderBy(desc(t.visits.plannedDate)).limit(8) : [],
    db.select().from(t.tasks).where(and(eq(t.tasks.companyId, id), ne(t.tasks.status, 'done'))).orderBy(asc(t.tasks.dueDate)),
  ]);
  const live = subs.filter(x => x.s.status === 'active' || x.s.status === 'renewing');
  const mrr = live.reduce((a, x) => a + x.s.priceMonth, 0);
  const done = visits.filter(x => x.v.rating);
  const rating = done.length ? (done.reduce((a, x) => a + (x.v.rating ?? 0), 0) / done.length).toFixed(1) : '—';
  // сумма договоров = цена тарифа за период со скидкой (без ошибки округления помесячной цены)
  const ltv = subs.reduce((a, x) => a + Math.round(x.total * (100 - x.s.discountPct) / 100), 0);

  return (
    <>
      <PageHeader back={{ href: '/clients', label: 'Клиенты' }} title={c.name} sub={[c.legalForm, c.industry, c.bin && `БИН ${c.bin}`].filter(Boolean).join(' · ')} />
      {sp.won && <p className="badge badge-green mb-4 h-auto py-2 text-[13px]">Сделка выиграна: клиент, объект и подписка созданы, установка и задачи онбординга запланированы.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR клиента" value={kzt(mrr)} hint={`${live.length} активн. подписок`} />
        <Stat label="Объекты" value={objs.length} />
        <Stat label="Средняя оценка визитов" value={rating} hint={`${done.length} оценок`} />
        <Stat label="Выручка по договорам" value={kzt(ltv)} hint="LTV на сегодня" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          <Card title="Объекты и подписки" pad={false}>
            {objs.length ? (
              <div className="tbl-wrap" data-scroll-x><table className="tbl">
                <thead><tr><th>Объект</th><th>Подписка</th><th>₸ / мес</th><th>До</th></tr></thead>
                <tbody>{objs.map(o => {
                  const s = subs.find(x => x.s.objectId === o.id);
                  return (
                    <tr key={o.id}>
                      <td><Link className="row-link" href={`/objects/${o.id}`}>{o.name}</Link><div className="text-[12.5px] text-ink-3">{o.address ?? 'адрес не указан'}</div></td>
                      <td>{s ? <><Badge tone={SUB_STATUS[s.s.status][1]}>{SUB_STATUS[s.s.status][0]}</Badge><div className="text-[12.5px] text-ink-3">{s.tariff}</div></> : <Badge>нет</Badge>}</td>
                      <td className="num">{s ? kzt(s.s.priceMonth) : '—'}</td>
                      <td className="num">{s ? dayYear(s.s.endDate) : '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <Empty>Объектов пока нет</Empty>}
          </Card>

          {can(user.role, 'objects') && (
            <Card title="Добавить объект">
              <ActionForm action={createObject.bind(null, c.id)} submit="Добавить объект" className="grid gap-3 sm:grid-cols-2">
                <Field label="Название"><input className="input" name="name" required placeholder="Филиал на Туран" /></Field>
                <Field label="Тип"><input className="input" name="type" defaultValue={c.industry ?? ''} /></Field>
                <Field label="Адрес"><input className="input" name="address" placeholder="Астана, …" /></Field>
                <Field label="Площадь, м²"><input className="input" name="areaM2" type="number" min={0} /></Field>
              </ActionForm>
            </Card>
          )}

          <Card title="Визиты" pad={false}>
            {visits.length ? <div className="tbl-wrap" data-scroll-x><table className="tbl"><tbody>{visits.map(({ v, obj }) => (
              <tr key={v.id}>
                <td className="num w-20 text-ink-2">{day(v.plannedDate)}</td>
                <td><Link className="row-link" href={`/visits/${v.id}`}>{VISIT_TYPE[v.type]}</Link><div className="text-[12.5px] text-ink-3">{obj}</div></td>
                <td><Badge tone={VISIT_STATUS[v.status][1]}>{VISIT_STATUS[v.status][0]}</Badge></td>
                <td className="num text-right">{v.rating ? `★ ${v.rating}` : ''}</td>
              </tr>
            ))}</tbody></table></div> : <Empty>Визитов не было</Empty>}
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Контакты">
            <ul className="mb-4 grid gap-3">
              {contacts.map(x => (
                <li key={x.id}>
                  <div className="font-medium">{x.name} {x.isDecisionMaker && <Badge tone="violet">ЛПР</Badge>}</div>
                  <div className="text-[12.5px] text-ink-3">{[x.position, x.phone, x.email].filter(Boolean).join(' · ') || '—'}</div>
                </li>
              ))}
            </ul>
            <details>
              <summary className="link cursor-pointer text-[13px]">Добавить контакт</summary>
              <form action={addContact.bind(null, c.id)} className="mt-3 grid gap-2">
                <input className="input" name="name" placeholder="Имя" required aria-label="Имя" />
                <input className="input" name="position" placeholder="Должность" aria-label="Должность" />
                <input className="input" name="phone" placeholder="Телефон" aria-label="Телефон" />
                <input className="input" name="email" placeholder="Почта" aria-label="Почта" />
                <label className="flex items-center gap-2"><input type="checkbox" name="isDecisionMaker" /> Принимает решения</label>
                <div><button className="btn">Добавить</button></div>
              </form>
            </details>
          </Card>

          <Card title="Реквизиты">
            <form action={updateCompany.bind(null, c.id)} className="grid gap-3">
              <Field label="Название"><input className="input" name="name" defaultValue={c.name} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Форма"><select className="input" name="legalForm" defaultValue={c.legalForm}><option>ТОО</option><option>ИП</option><option>АО</option></select></Field>
                <Field label="БИН / ИИН"><input className="input" name="bin" defaultValue={c.bin ?? ''} /></Field>
                <Field label="Телефон"><input className="input" name="phone" defaultValue={c.phone ?? ''} /></Field>
                <Field label="Почта"><input className="input" name="email" defaultValue={c.email ?? ''} /></Field>
              </div>
              <Field label="Сфера"><input className="input" name="industry" defaultValue={c.industry ?? ''} /></Field>
              <Field label="Заметки"><textarea className="input" name="notes" defaultValue={c.notes ?? ''} rows={2} /></Field>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" name="vatPayer" defaultChecked={c.vatPayer} /> Плательщик НДС</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="isGov" defaultChecked={c.isGov} /> Госсектор</label>
              </div>
              <div><button className="btn">Сохранить</button></div>
            </form>
          </Card>

          <Card title="Открытые задачи" pad={false}>
            {tasks.length ? <ul>{tasks.map(x => (
              <li key={x.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0"><span>{x.title}</span><span className="num shrink-0 text-ink-3">{day(x.dueDate)}</span></li>
            ))}</ul> : <Empty>Нет</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
