'use client';
/* Кнопки управления подпиской: пауза, возобновление, продление, расторжение */
import { useTransition } from 'react';
import { renewSubscription, setSubscriptionStatus } from '../../actions';

export function SubActions({ id, status }: { id: number; status: string }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) => start(fn);
  return (
    <div className="flex flex-wrap gap-2">
      {(status === 'active' || status === 'renewing') && <button className="btn btn-sm" disabled={pending} onClick={() => run(() => renewSubscription(id))}>Продлить</button>}
      {status === 'active' && <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setSubscriptionStatus(id, 'paused'))}>Пауза на месяц</button>}
      {(status === 'paused' || status === 'trial') && <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => setSubscriptionStatus(id, 'active'))}>Активировать</button>}
      <button className="btn btn-sm text-[var(--t-red)]" disabled={pending} onClick={() => {
        const reason = window.prompt('Причина расторжения (дорого, закрылись, не понравился аромат…)');
        if (reason) run(() => setSubscriptionStatus(id, 'cancelled', reason));
      }}>Расторгнуть</button>
    </div>
  );
}
