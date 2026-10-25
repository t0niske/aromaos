'use client';
/* Круглый флажок: клик — выполнено / вернуть в работу */
import { useOptimistic, useTransition } from 'react';
import { setTaskStatus } from '../actions';

export function TaskToggle({ id, status }: { id: number; status: string }) {
  const [, start] = useTransition();
  const [st, set] = useOptimistic(status);
  const done = st === 'done';
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
      onClick={() => start(async () => { const next = done ? 'todo' : 'done'; set(next); await setTaskStatus(id, next); })}
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? 'border-accent bg-accent text-[var(--accent-ink)]' : 'border-line-2 hover:border-accent'}`}>
      {done && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5 5 9l4.5-5.5" /></svg>}
    </button>
  );
}
