'use client';
/* Форма с серверным действием: показывает ошибку и состояние отправки */
import { useActionState, type ReactNode } from 'react';

type State = { error?: string; ok?: string };

export function ActionForm({ action, children, submit, className = 'grid gap-4' }: {
  action: (s: State, f: FormData) => Promise<State>; children: ReactNode; submit: string; className?: string;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, {});
  return (
    <form action={run} className={className}>
      {children}
      {state.error && <p role="alert" className="badge badge-red h-auto py-2 text-[13px]">{state.error}</p>}
      {state.ok && <p role="status" className="badge badge-green h-auto py-2 text-[13px]">{state.ok}</p>}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? 'Сохраняем…' : submit}</button></div>
    </form>
  );
}
