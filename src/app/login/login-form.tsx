'use client';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="grid gap-4">
      <label className="block">
        <span className="label">Рабочая почта</span>
        <input className="input" name="email" type="email" autoComplete="username" required defaultValue={state.email} autoFocus />
      </label>
      <label className="block">
        <span className="label">Пароль</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p role="alert" className="badge badge-red h-auto justify-center py-2 text-[13px]">{state.error}</p>}
      <button className="btn btn-primary h-10" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</button>
    </form>
  );
}
