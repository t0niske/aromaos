'use client';
import { useState, useTransition } from 'react';
import { makeLink } from './actions';

/* Кнопка «Подключить Telegram»: получает одноразовую ссылку и открывает бота */
export function LinkButton({ again }: { again?: boolean }) {
  const [pending, start] = useTransition();
  const [state, set] = useState<{ url?: string; error?: string }>({});
  return (
    <div className="grid gap-3">
      <div>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await makeLink(); set(r);
          if (r.url) window.open(r.url, '_blank', 'noopener');
        })}>{pending ? 'Готовим ссылку…' : again ? 'Подключить другой чат' : 'Подключить Telegram'}</button>
      </div>
      {state.url && <p className="text-[13px] text-ink-3">Если Telegram не открылся, перейдите по <a className="link" href={state.url} target="_blank" rel="noopener">ссылке</a> и нажмите «Запустить» (Start).</p>}
      {state.error && <p role="alert" className="badge badge-red h-auto py-2 text-[13px]">{state.error}</p>}
    </div>
  );
}
