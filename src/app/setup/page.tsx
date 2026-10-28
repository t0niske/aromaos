import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { hasUsers } from './actions';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'Первый запуск' };

async function Gate() {
  await connection();
  if (await hasUsers()) redirect('/login');
  return <SetupForm />;
}

export default function SetupPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <h1 className="mb-1 text-[20px] font-semibold">Первый запуск</h1>
          <p className="mb-5 text-ink-3">Создайте учётную запись собственника. Код запуска — в сообщении от того, кто ставил систему.</p>
          <Suspense><Gate /></Suspense>
        </div>
      </div>
    </main>
  );
}
