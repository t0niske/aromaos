'use client';
import { useActionState } from 'react';
import { setup, type SetupState } from './actions';

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(setup, {});
  return (
    <form action={action} className="grid gap-4">
      <label className="block">
        <span className="label">Код запуска</span>
        <input className="input" name="code" autoComplete="off" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Ваше имя</span>
        <input className="input" name="name" autoComplete="name" required defaultValue={state.name} />
      </label>
      <label className="block">
        <span className="label">Рабочая почта (логин)</span>
        <input className="input" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      </label>
      <label className="block">
        <span className="label">Пароль, от 10 символов</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="block">
        <span className="label">Пароль ещё раз</span>
        <input className="input" name="password2" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {state.error && <p role="alert" className="badge badge-red h-auto justify-center py-2 text-[13px]">{state.error}</p>}
      <button className="btn btn-primary h-10" disabled={pending}>{pending ? 'Создаём…' : 'Создать и войти'}</button>
    </form>
  );
}
