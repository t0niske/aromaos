import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { SCENT_FAMILY, VISIT_STATUS, VISIT_TYPE, day, dayYear } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { completeVisitAction } from '../../actions';
import { VisitMoves } from './visit-moves';

export default function VisitPage({ params }: PageProps<'/visits/[id]'>) {
  return <Suspense fallback={<Skeleton />}><Visit params={params} /></Suspense>;
}

const CHECKS: [string, string][] = [
  ['refill', 'Заправлено масло'], ['settings', 'Проверены интенсивность и расписание'], ['clean', 'Аппарат очищен, форсунка в порядке'],
  ['photo', 'Фото до/после сделаны'], ['signature', 'Клиент подтвердил визит'],
];

async function Visit({ params }: Pick<PageProps<'/visits/[id]'>, 'params'>) {
  const user = await requireUser('visits');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [row] = await db.select({ v: t.visits, obj: t.objects, company: t.companies.name, who: t.users.name })
    .from(t.visits).innerJoin(t.objects, eq(t.objects.id, t.visits.objectId)).innerJoin(t.companies, eq(t.companies.id, t.objects.companyId))
    .leftJoin(t.users, eq(t.users.id, t.visits.employeeId)).where(eq(t.visits.id, id));
  if (!row || (user.role === 'tech' && row.v.employeeId !== user.id)) notFound();
  const { v, obj } = row;
  const [zones, devices] = await Promise.all([
    db.select({ z: t.zones, scent: t.scents }).from(t.zones).leftJoin(t.scents, eq(t.scents.id, t.zones.scentId)).where(eq(t.zones.objectId, obj.id)),
    db.select({ serial: t.devices.serial, model: t.deviceModels.name, tank: t.deviceModels.tankMl, id: t.devices.id }).from(t.devices).innerJoin(t.deviceModels, eq(t.deviceModels.id, t.devices.modelId)).where(eq(t.devices.objectId, obj.id)),
  ]);
  const t0 = today();

  return (
    <>
      <PageHeader back={{ href: '/visits', label: 'Визиты' }} title={`${VISIT_TYPE[v.type]} · ${obj.name}`}
        sub={<>{v.plannedDate === t0 ? 'Сегодня' : dayYear(v.plannedDate)} · {row.who ?? 'техник не назначен'} · <Badge tone={VISIT_STATUS[v.status][1]}>{VISIT_STATUS[v.status][0]}</Badge></>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {v.status === 'planned' ? (
          <Card title="Отчёт о визите">
            <ActionForm action={completeVisitAction.bind(null, v.id)} submit="Завершить визит">
              <fieldset className="grid gap-1">
                <legend className="label">Чек-лист</legend>
                {CHECKS.map(([k, label]) => (
                  <label key={k} className="flex min-h-11 items-center gap-3 rounded-[10px] px-2 hover:bg-surface-2">
                    <input type="checkbox" name={k} className="size-5 accent-[var(--accent)]" defaultChecked={k !== 'signature'} /> {label}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Залито масла, мл"><input className="input h-11 text-[16px]" name="oilMl" type="number" min={0} max={2000} inputMode="numeric" defaultValue={devices[0] ? Math.round(devices[0].tank * 0.75) : ''} /></Field>
                <fieldset>
                  <legend className="label">Оценка клиента</legend>
                  <div className="flex gap-1.5" role="radiogroup">
                    {[1, 2, 3, 4, 5].map(n => (
                      <label key={n} className="grid size-11 cursor-pointer place-items-center rounded-[10px] border border-line-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                        <input type="radio" name="rating" value={n} className="sr-only" defaultChecked={n === 5} /><span className="num font-semibold">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <Field label="Комментарий"><textarea className="input text-[16px]" name="comment" rows={3} placeholder="Что сделано, что заметили, о чём просил клиент" /></Field>
              <p className="text-[12.5px] text-ink-3">Оценка 3 и ниже автоматически создаёт задачу руководителю сервиса.</p>
            </ActionForm>
            <div className="mt-4 border-t border-line pt-4"><VisitMoves id={v.id} /></div>
          </Card>
        ) : (
          <Card title="Итог визита">
            <dl className="dl">
              <dt>Статус</dt><dd><Badge tone={VISIT_STATUS[v.status][1]}>{VISIT_STATUS[v.status][0]}</Badge></dd>
              {v.doneAt && <><dt>Выполнен</dt><dd>{day(v.doneAt)}</dd></>}
              <dt>Масло</dt><dd>{v.oilMl ? `${v.oilMl} мл` : '—'}</dd>
              <dt>Оценка</dt><dd>{v.rating ? `★ ${v.rating} из 5` : '—'}</dd>
              <dt>Чек-лист</dt><dd>{CHECKS.filter(([k]) => v.checklist[k]).map(([, l]) => l).join(', ') || '—'}</dd>
              {v.comment && <><dt>Комментарий</dt><dd>{v.comment}</dd></>}
            </dl>
          </Card>
        )}

        <div className="grid content-start gap-4">
          <Card title="Объект">
            <dl className="dl">
              <dt>Клиент</dt><dd>{row.company}</dd>
              <dt>Адрес</dt><dd>{obj.address ?? '—'}</dd>
              <dt>Доступ</dt><dd>{obj.accessNotes ?? '—'}</dd>
              <dt>График</dt><dd>{obj.schedule ?? '—'}</dd>
            </dl>
            <Link className="link mt-3 inline-block text-[13px]" href={`/objects/${obj.id}`}>Карточка объекта</Link>
          </Card>
          <Card title="Аппараты и ароматы">
            <ul className="grid gap-2">
              {devices.map(d => <li key={d.id}><Link className="hover:text-accent" href={`/devices/${d.id}`}>{d.model} · {d.serial}</Link> <span className="text-ink-3">· бак {d.tank} мл</span></li>)}
              {zones.map(({ z, scent }) => <li key={z.id}><span className="text-ink-3">{z.name}:</span> {scent ? `№${scent.n} ${scent.name} (${SCENT_FAMILY[scent.family]})` : 'аромат не выбран'}</li>)}
              {!devices.length && !zones.length && <li className="text-ink-3">Нет данных</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
