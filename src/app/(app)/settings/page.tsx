import type { Metadata } from 'next';
import { Suspense } from 'react';
import { asc, desc, eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { ROLE_NAMES, type Role } from '@/lib/access';
import { day, kzt } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icons';
import { Badge, Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { createUser, toggleUser, updateTariff } from '../actions';
import { RenewalsButton } from './client';

export const metadata: Metadata = { title: 'Настройки' };

export default function SettingsPage() {
  return <Suspense fallback={<Skeleton rows={12} />}><Settings /></Suspense>;
}

const ACTION_NAMES: Record<string, string> = {
  login: 'вход', create: 'создание', update: 'изменение', stage: 'смена этапа', win: 'выигрыш', status: 'статус', renew: 'продление',
  complete: 'визит выполнен', scent: 'смена аромата', sweep: 'проверка продлений', activate: 'включение', deactivate: 'отключение',
};
const ENTITY_NAMES: Record<string, string> = { lead: 'лид', company: 'клиент', object: 'объект', subscription: 'подписка', visit: 'визит', task: 'задача', user: 'пользователь', tariff: 'тариф', zone: 'зона' };

async function Settings() {
  const me = await requireUser('settings');
  const db = await getDb();
  const [users, tariffs, log] = await Promise.all([
    db.select().from(t.users).orderBy(asc(t.users.id)),
    db.select({ x: t.tariffs, model: t.deviceModels.name }).from(t.tariffs).innerJoin(t.deviceModels, eq(t.deviceModels.id, t.tariffs.modelId)).orderBy(asc(t.tariffs.modelId), asc(t.tariffs.periodMonths)),
    db.select({ a: t.auditLog, who: t.users.name }).from(t.auditLog).leftJoin(t.users, eq(t.users.id, t.auditLog.userId)).orderBy(desc(t.auditLog.id)).limit(25),
  ]);

  return (
    <>
      <PageHeader title="Настройки" sub="Команда, тарифы, автоматизации, журнал действий" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Команда" pad={false}>
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Сотрудник</th><th>Роль</th><th /></tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id}>
                <td><span className={u.active ? 'font-medium' : 'text-ink-3 line-through'}>{u.name}</span><div className="text-[12.5px] text-ink-3">{u.email}</div></td>
                <td>{ROLE_NAMES[u.role as Role]}</td>
                <td className="text-right">{u.id !== me.id && <form action={toggleUser.bind(null, u.id)}><button className="btn btn-sm">{u.active ? 'Отключить' : 'Включить'}</button></form>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <details className="border-t border-line px-[18px] py-4">
            <summary className="link cursor-pointer">Добавить сотрудника</summary>
            <ActionForm action={createUser} submit="Создать доступ" className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Имя"><input className="input" name="name" required /></Field>
              <Field label="Рабочая почта"><input className="input" name="email" type="email" required /></Field>
              <Field label="Роль"><select className="input" name="role" defaultValue="sales">{Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Временный пароль"><input className="input" name="password" type="text" minLength={10} required autoComplete="off" /></Field>
            </ActionForm>
          </details>
        </Card>

        <Card title="Тарифы (из прайса Nova 300 / Nova 1000)" pad={false}>
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <thead><tr><th>Тариф</th><th>Цена за период · в месяц · визитов</th></tr></thead>
            <tbody>{tariffs.map(({ x }) => (
              <tr key={x.id}>
                <td className="font-medium whitespace-nowrap text-ink">{x.name}</td>
                <td>
                  <form action={updateTariff.bind(null, x.id)} className="flex items-center gap-2">
                    <input className="input num h-8 w-28 shrink-0" name="priceTotal" type="number" defaultValue={x.priceTotal} aria-label="Цена за период" />
                    <span className="num w-[88px] shrink-0 text-[13px] text-ink-3">{kzt(Math.round(x.priceTotal / x.periodMonths))}</span>
                    <input className="input num h-8 w-14 shrink-0" name="visitsPerMonth" type="number" min={1} max={8} defaultValue={x.visitsPerMonth} aria-label="Визитов в месяц" />
                    <button className="btn btn-soft btn-sm size-8 shrink-0 p-0" aria-label={`Сохранить: ${x.name}`} title="Сохранить"><Icon name="check" size={16} /></button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="px-6 py-4 text-[12.5px] text-ink-3">Новая цена действует для новых подписок; действующие не меняются.</p>
        </Card>

        <Card title="Автоматизации">
          <ul className="mb-4 grid gap-1.5 text-ink-2">
            <li>• Новый лид → ответственный по очереди + задача «связаться за 15 минут»</li>
            <li>• Повторная заявка с того же телефона → в историю открытого лида</li>
            <li>• Этап «Тест» → задача позвонить за день до конца теста</li>
            <li>• Сделка выиграна → клиент, объект, подписка, установка, аппарат со склада, 3 задачи онбординга</li>
            <li>• Подписка → график визитов на весь срок</li>
            <li>• Оценка визита ≤ 3 → задача руководителю сервиса</li>
            <li>• Расторжение → отмена визитов + визит на демонтаж</li>
          </ul>
          <RenewalsButton />
        </Card>

        <Card title="Журнал действий" pad={false} className="xl:col-span-2">
          <div className="tbl-wrap" data-scroll-x><table className="tbl">
            <tbody>{log.map(({ a, who }) => (
              <tr key={a.id}>
                <td className="num w-28 text-ink-3">{day(a.createdAt)} {a.createdAt.toISOString().slice(11, 16)}</td>
                <td>{who ?? 'система'}</td>
                <td>{ACTION_NAMES[a.action] ?? a.action}</td>
                <td className="text-ink-2">{ENTITY_NAMES[a.entity] ?? a.entity}{a.entityId ? ` #${a.entityId}` : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3"><Badge>v0.1</Badge> MVP-ядро AromaOS. Дальше по спецификации: приём заявок с сайтов, счета и Kaspi, склад масел, кабинет клиента, приложение техника офлайн.</p>
    </>
  );
}
