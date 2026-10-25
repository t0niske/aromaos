import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Fragment, Suspense } from 'react';
import { asc, desc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { DEVICE_STATUS, day, dayYear, kzt } from '@/lib/format';
import { Badge, Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { moveDevice } from '../../actions';

export default function DevicePage({ params }: PageProps<'/devices/[id]'>) {
  return <Suspense fallback={<Skeleton />}><Device params={params} /></Suspense>;
}

async function Device({ params }: Pick<PageProps<'/devices/[id]'>, 'params'>) {
  await requireUser('devices');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [row] = await db.select({ d: t.devices, m: t.deviceModels, obj: t.objects.name }).from(t.devices)
    .innerJoin(t.deviceModels, eq(t.deviceModels.id, t.devices.modelId)).leftJoin(t.objects, eq(t.objects.id, t.devices.objectId)).where(eq(t.devices.id, id));
  if (!row) notFound();
  const { d, m } = row;
  const [events, objects, [longest]] = await Promise.all([
    db.select({ e: t.deviceEvents, who: t.users.name }).from(t.deviceEvents).leftJoin(t.users, eq(t.users.id, t.deviceEvents.userId)).where(eq(t.deviceEvents.deviceId, id)).orderBy(desc(t.deviceEvents.createdAt)),
    db.select({ id: t.objects.id, name: t.objects.name }).from(t.objects).orderBy(asc(t.objects.name)),
    db.select({ total: t.tariffs.priceTotal, months: t.tariffs.periodMonths }).from(t.tariffs).where(eq(t.tariffs.modelId, m.id)).orderBy(desc(t.tariffs.periodMonths)).limit(1),
  ]);
  const perMonth = longest ? longest.total / longest.months : 0;
  // QR на наклейке ведёт прямо в карточку аппарата (техник сканирует телефоном)
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const qr = await QRCode.toString(`${origin}/devices/${d.id}`, { type: 'svg', margin: 1, color: { dark: '#141816', light: '#ffffff' } });

  return (
    <>
      <PageHeader back={{ href: '/devices', label: 'Оборудование' }} title={<span className="num">{d.serial}</span>}
        sub={<>{m.name} · <Badge tone={DEVICE_STATUS[d.status][1]}>{DEVICE_STATUS[d.status][0]}</Badge>{d.objectId && <> · <Link className="link" href={`/objects/${d.objectId}`}>{row.obj}</Link></>}</>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-4">
          <Card title="Переместить">
            <form action={moveDevice.bind(null, d.id)} className="grid gap-3 sm:grid-cols-3">
              <Field label="Статус"><select className="input" name="status" defaultValue={d.status}>{Object.entries(DEVICE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Объект (для клиента и теста)"><select className="input" name="objectId" defaultValue={d.objectId ?? ''}><option value="">—</option>{objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
              <Field label="Комментарий"><input className="input" name="note" placeholder="причина, что сделано" /></Field>
              <div><button className="btn btn-primary">Сохранить</button></div>
            </form>
          </Card>
          <Card title="История">
            <ol className="grid gap-3">{events.map(({ e, who }) => (
              <li key={e.id} className="grid grid-cols-[auto_1fr] gap-3"><span className="mt-1.5 size-2 rounded-full bg-accent" /><div><div className="text-[12.5px] text-ink-3">{day(e.createdAt)} · {who ?? 'система'}</div>{e.text}</div></li>
            ))}</ol>
          </Card>
          <Card title="Характеристики модели">
            <dl className="dl">{m.specs.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card title="QR-наклейка">
            <div className="mx-auto w-44 overflow-hidden rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-2 text-center text-[12.5px] text-ink-3">Отсканируйте — откроется эта карточка</p>
          </Card>
          <Card title="Учёт">
            <dl className="dl">
              <dt>Закупка</dt><dd>{dayYear(d.purchaseDate)}</dd>
              <dt>Цена</dt><dd>{kzt(d.purchasePrice)}</dd>
              <dt>Гарантия</dt><dd>до {dayYear(d.warrantyUntil)}</dd>
              <dt>Окупаемость</dt><dd>{d.purchasePrice && perMonth ? `≈ ${Math.ceil(d.purchasePrice / perMonth)} мес подписки` : '—'}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
