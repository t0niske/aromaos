import type { Metadata } from 'next';
import { Logo } from '@/components/logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <h1 className="mb-1 text-[20px] font-semibold">Вход в систему</h1>
          <p className="mb-5 text-ink-3">Лиды, клиенты, объекты и сервис — в одном месте.</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[12px] text-ink-3">Доступ выдаёт собственник в разделе «Настройки».</p>
      </div>
    </main>
  );
}
