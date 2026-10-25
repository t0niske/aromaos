import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { DEVICE_STATUS, dayYear, kzt } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Empty, Field, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { addDevice } from '../actions';

export const metadata: Metadata = { title: 'Оборудование' };

export default function DevicesPage({ searchParams }: PageProps<'/devices'>) {
  return <Suspense fallback={<Skeleton />}><Devices searchParams={searchParams} /></Suspense>;
}

async function Devices({ searchParams }: { searchParams: PageProps<'/devices'>['searchParams'] }) {
  await requireUser('devices');
  const st = String((await searchParams).status ?? '');
  const status = st in DEVICE_STATUS ? (st as keyof typeof DEVICE_STATUS) : null;
  const db = await getDb();
  const [rows, counts, models] = await Promise.all([
    db.select({ d: t.devices, model: t.deviceModels.name, obj: t.objects.name }).from(t.devices)
      .innerJoin(t.deviceModels, eq(t.deviceModels.id, t.devices.modelId)).leftJoin(t.objects, eq(t.objects.id, t.devices.objectId))
      .where(status ? eq(t.devices.status, status as typeof t.devices.$inferSelect['status']) : undefined).orderBy(asc(t.devices.serial)),
    db.select({ status: t.devices.status, n: sql<number>`count(*)`.mapWith(Number) }).from(t.devices).groupBy(t.devices.status),
    db.select().from(t.deviceModels).orderBy(asc(t.deviceModels.coverageM2)),
  ]);
  const total = counts.reduce((a, c) => a + c.n, 0);
  const t0 = today();

  return (
    <>
      <PageHeader title="Оборудование" sub={`${total} диффузоров · ${models.map(m => `${m.name}: до ${m.coverageM2} м², бак ${m.tankMl} мл`).join(' · ')}`} />
      <Tabs active={`/devices${status ? '?status=' + status : ''}`} items={[
        { href: '/devices', label: 'Все', count: total },
        ...Object.entries(DEVICE_STATUS).map(([k, [label]]) => ({ href: `/devices?status=${k}`, label, count: counts.find(c => c.status === k)?.n ?? 0 })),
      ]} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card pad={false}>
          {rows.length ? (
            <div className="tbl-wrap" data-scroll-x><table className="tbl">
              <thead><tr><th>Аппарат</th><th>Статус</th><th>Где</th><th>Гарантия</th><th>Цена</th></tr></thead>
              <tbody>{rows.map(({ d, model, obj }) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap"><Link className="row-link num" href={`/devices/${d.id}`}>{d.serial}</Link><div className="text-[12.5px] text-ink-3">{model}</div></td>
                  <td><Badge tone={DEVICE_STATUS[d.status][1]}>{DEVICE_STATUS[d.status][0]}</Badge></td>
                  <td>{d.objectId ? <Link className="hover:text-accent" href={`/objects/${d.objectId}`}>{obj}</Link> : <span className="text-ink-3">склад</span>}</td>
                  <td className="num">{d.warrantyUntil ? (d.warrantyUntil < t0 ? <span className="text-ink-3">истекла</span> : `до ${dayYear(d.warrantyUntil)}`) : '—'}</td>
                  <td className="num text-ink-2">{kzt(d.purchasePrice)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Аппаратов в этом статусе нет</Empty>}
        </Card>
        <Card title="Принять на склад">
          <ActionForm action={addDevice} submit="Добавить аппарат">
            <Field label="Серийный номер"><input className="input" name="serial" required placeholder="NV3-2411-001" /></Field>
            <Field label="Модель"><select className="input" name="modelId">{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Цена закупки, ₸"><input className="input" name="purchasePrice" type="number" min={0} /></Field>
            <Field label="Дата закупки"><input className="input" name="purchaseDate" type="date" defaultValue={t0} /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
