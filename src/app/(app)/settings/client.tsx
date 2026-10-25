'use client';
import { useState, useTransition } from 'react';
import { runRenewals } from '../actions';

export function RenewalsButton() {
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const n = await runRenewals();
        setMsg(n ? `На продление переведено: ${n}, задачи созданы` : 'Подписок, которые заканчиваются в ближайшие 30 дней, нет');
      })}>Проверить продления</button>
      {msg && <span className="text-ink-2" role="status">{msg}</span>}
      <span className="w-full text-[12px] text-ink-3">В продакшене это будет запускаться каждый день по расписанию.</span>
    </div>
  );
}
