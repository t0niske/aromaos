import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/access';
import { today } from '@/lib/dates';
import { DEVICE_STATUS, SCENT_FAMILY, SUB_STATUS, VISIT_STATUS, VISIT_TYPE, day, dayYear, kzt } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Empty, Field, PageHeader, Skeleton } from '@/components/ui';
import { addSubscription, addZone, planVisit, setZoneScent, updateObject } from '../../actions';
import { SubActions } from './sub-actions';

export default function ObjectPage({ params }: PageProps<'/objects/[id]'>) {
  return <Suspense fallback={<Skeleton rows={10} />}><ObjectView params={params} /></Suspense>;
}

async function ObjectView({ params }: Pick<PageProps<'/objects/[id]'>, 'params'>) {
  const user = await requireUser('objects');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [row] = await db.select({ o: t.objects, company: t.companies.name }).from(t.objects).innerJoin(t.companies, eq(t.companies.id, t.objects.companyId)).where(eq(t.objects.id, id));
  if (!row) notFound();
  const { o } = row;
  const [zones, scents, devices, subs, visits, tariffs, techs] = await Promise.all([
    db.select().from(t.zones).where(eq(t.zones.objectId, id)).orderBy(asc(t.zones.id)),
    db.select().from(t.scents).where(eq(t.scents.active, true)).orderBy(asc(t.scents.n)),
    db.select({ d: t.devices, model: t.deviceModels.name }).from(t.devices).innerJoin(t.deviceModels, eq(t.deviceModels.id, t.devices.modelId)).where(eq(t.devices.objectId, id)),
    db.select({ s: t.subscriptions, tariff: t.tariffs.name }).from(t.subscriptions).innerJoin(t.tariffs, eq(t.tariffs.id, t.subscriptions.tariffId)).where(eq(t.subscriptions.objectId, id)).orderBy(desc(t.subscriptions.startDate)),
    db.select({ v: t.visits, who: t.users.name }).from(t.visits).leftJoin(t.users, eq(t.users.id, t.visits.employeeId)).where(and(eq(t.visits.objectId, id), ne(t.visits.status, 'cancelled'))).orderBy(desc(t.visits.plannedDate)),
    db.select().from(t.tariffs).where(eq(t.tariffs.active, true)).orderBy(asc(t.tariffs.modelId), asc(t.tariffs.periodMonths)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ['tech', 'service_head']))),
  ]);
  const current = subs.find(x => x.s.status !== 'cancelled');
  const t0 = today();
  const upcoming = visits.filter(x => x.v.status === 'planned').reverse();
  const past = visits.filter(x => x.v.status !== 'planned');
  const scentName = (sid: number | null) => scents.find(s => s.id === sid)?.name;

  return (
    <>
      <PageHeader back={{ href: `/clients/${o.companyId}`, label: row.company }} title={o.name}
        sub={[o.type, o.address, o.areaM2 && `${o.areaM2} м²`].filter(Boolean).join(' · ')}
        actions={<Link className="btn" href={`/tasks/new?object=${o.id}`}>Задача по объекту</Link>} />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-4">
          <Card title="Подписка">
            {current ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><Badge tone={SUB_STATUS[current.s.status][1]}>{SUB_STATUS[current.s.status][0]}</Badge><span className="font-medium">{current.tariff}</span></div>
                  <div className="num mt-2 text-[22px] font-semibold">{kzt(current.s.priceMonth)} <span className="text-[14px] font-normal text-ink-3">в месяц{current.s.discountPct ? ` · скидка ${current.s.discountPct}%` : ''}</span></div>
                  <div className="mt-1 text-ink-3">{dayYear(current.s.startDate)} — {dayYear(current.s.endDate)} · визитов в месяц: {current.s.visitsPerMonth}{current.s.pausedUntil ? ` · пауза до ${day(current.s.pausedUntil)}` : ''}</div>
                </div>
                {can(user.role, 'subscriptions') && <SubActions id={current.s.id} status={current.s.status} />}
              </div>
            ) : can(user.role, 'subscriptions') ? (
              <ActionForm action={addSubscription.bind(null, o.id)} submit="Оформить подписку" className="grid gap-3 sm:grid-cols-2">
                <Field label="Тариф"><select className="input" name="tariffId" required>{tariffs.map(x => <option key={x.id} value={x.id}>{x.name} — {kzt(x.priceTotal)}</option>)}</select></Field>
                <Field label="Начало"><input className="input" type="date" name="startDate" defaultValue={t0} required /></Field>
                <Field label="Скидка, %"><input className="input" type="number" name="discountPct" min={0} max={50} defaultValue={0} /></Field>
                <Field label="Статус"><select className="input" name="status"><option value="active">Активна</option><option value="trial">Тест</option></select></Field>
              </ActionForm>
            ) : <Empty>Подписки нет</Empty>}
            {subs.length > 1 && <p className="mt-3 text-[12.5px] text-ink-3">История: {subs.slice(1).map(x => `${x.tariff} (${SUB_STATUS[x.s.status][0].toLowerCase()})`).join(', ')}</p>}
          </Card>

          <Card title="Зоны и ароматы">
            {zones.length ? (
              <ul className="mb-4 grid gap-2">
                {zones.map(z => (
                  <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface-2 px-3 py-2">
                    <span className="font-medium">{z.name}</span>
                    <form action={setZoneScent.bind(null, z.id)} className="flex items-center gap-2">
                      <select className="input h-8 w-56" name="scentId" defaultValue={z.scentId ?? ''} aria-label={`Аромат: ${z.name}`}>
                        <option value="">— не выбран —</option>
                        {scents.map(s => <option key={s.id} value={s.id}>№{s.n} {s.name} · {SCENT_FAMILY[s.family]}</option>)}
                      </select>
                      <button className="btn btn-sm">OK</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="mb-3 text-ink-3">Зоны не заданы. Разбейте объект на зоны (вход, зал, санузел), чтобы у каждой был свой аромат и аппарат.</p>}
            <form action={addZone.bind(null, o.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="input" name="name" placeholder="Новая зона: вход, зал, примерочные…" required aria-label="Название зоны" />
              <select className="input" name="scentId" aria-label="Аромат зоны"><option value="">аромат позже</option>{scents.map(s => <option key={s.id} value={s.id}>№{s.n} {s.name}</option>)}</select>
              <button className="btn">Добавить</button>
            </form>
          </Card>

          <Card title="Визиты" pad={false}>
            {upcoming.length + past.length ? (
              <div className="tbl-wrap" data-scroll-x><table className="tbl"><tbody>{[...upcoming, ...past].map(({ v, who }) => (
                <tr key={v.id}>
                  <td className="num w-24 text-ink-2">{v.plannedDate === t0 ? 'Сегодня' : day(v.plannedDate)}</td>
                  <td><Link className="row-link" href={`/visits/${v.id}`}>{VISIT_TYPE[v.type]}</Link>{v.comment && <div className="text-[12.5px] text-ink-3">{v.comment}</div>}</td>
                  <td className="text-ink-2">{who ?? '—'}</td>
                  <td><Badge tone={v.status === 'planned' && v.plannedDate < t0 ? 'red' : VISIT_STATUS[v.status][1]}>{v.status === 'planned' && v.plannedDate < t0 ? 'Просрочен' : VISIT_STATUS[v.status][0]}</Badge></td>
                  <td className="num text-right">{v.oilMl ? `${v.oilMl} мл` : ''}{v.rating ? ` · ★ ${v.rating}` : ''}</td>
                </tr>
              ))}</tbody></table></div>
            ) : <Empty>Визитов нет</Empty>}
            {can(user.role, 'visits') && (
              <div className="border-t border-line px-[18px] py-4">
                <ActionForm action={planVisit.bind(null, o.id)} submit="Запланировать" className="grid gap-3 sm:grid-cols-4">
                  <Field label="Тип"><select className="input" name="type">{Object.entries(VISIT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="Дата"><input className="input" type="date" name="plannedDate" defaultValue={t0} required /></Field>
                  <Field label="Техник"><select className="input" name="employeeId"><option value="">—</option>{techs.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                  <Field label="Комментарий"><input className="input" name="comment" /></Field>
                </ActionForm>
              </div>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Оборудование" pad={false}>
            {devices.length ? <ul>{devices.map(({ d, model }) => (
              <li key={d.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0">
                <Link className="font-medium hover:text-accent" href={`/devices/${d.id}`}>{model} · {d.serial}</Link>
                <Badge tone={DEVICE_STATUS[d.status][1]}>{DEVICE_STATUS[d.status][0]}</Badge>
              </li>
            ))}</ul> : <Empty>Аппаратов нет — выдайте со склада в разделе «Оборудование»</Empty>}
          </Card>

          <Card title="Параметры объекта">
            <form action={updateObject.bind(null, o.id)} className="grid gap-3">
              <Field label="Название"><input className="input" name="name" defaultValue={o.name} required /></Field>
              <Field label="Адрес"><input className="input" name="address" defaultValue={o.address ?? ''} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Тип"><input className="input" name="type" defaultValue={o.type ?? ''} /></Field>
                <Field label="Площадь, м²"><input className="input" name="areaM2" type="number" defaultValue={o.areaM2 ?? ''} /></Field>
                <Field label="Потолки, м"><input className="input" name="ceilingM" type="number" step="0.1" defaultValue={o.ceilingM ?? ''} /></Field>
                <Field label="График"><input className="input" name="schedule" defaultValue={o.schedule ?? ''} placeholder="10:00–22:00" /></Field>
              </div>
              <Field label="Доступ для техника"><textarea className="input" name="accessNotes" rows={2} defaultValue={o.accessNotes ?? ''} placeholder="Код домофона, время визитов, к кому обратиться" /></Field>
              <div><button className="btn">Сохранить</button></div>
            </form>
          </Card>
          {zones.some(z => z.scentId) && (
            <Card title="Ароматы на объекте">
              <ul className="grid gap-1">{zones.filter(z => z.scentId).map(z => <li key={z.id}><span className="text-ink-3">{z.name}:</span> {scentName(z.scentId)}</li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
