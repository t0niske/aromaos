import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/action-form';
import { Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { createCompany } from '../../actions';

export const metadata: Metadata = { title: 'Новый клиент' };

export default function NewClientPage() {
  return <Suspense fallback={<Skeleton />}><NewClient /></Suspense>;
}

async function NewClient() {
  await requireUser('clients');
  return (
    <>
      <PageHeader title="Новый клиент" sub="Обычно клиент создаётся сам при выигрыше лида" back={{ href: '/clients', label: 'Клиенты' }} />
      <Card className="max-w-[760px]">
        <ActionForm action={createCompany} submit="Создать клиента" className="grid gap-4 sm:grid-cols-2">
          <Field label="Название *" className="sm:col-span-2"><input className="input" name="name" required /></Field>
          <Field label="Форма"><select className="input" name="legalForm"><option>ТОО</option><option>ИП</option><option>АО</option></select></Field>
          <Field label="БИН / ИИН"><input className="input" name="bin" inputMode="numeric" maxLength={12} pattern="\d{12}" title="12 цифр" /></Field>
          <Field label="Сфера"><input className="input" name="industry" /></Field>
          <Field label="Контактное лицо (ЛПР)"><input className="input" name="contactName" /></Field>
          <Field label="Телефон"><input className="input" name="phone" type="tel" /></Field>
          <Field label="Почта"><input className="input" name="email" type="email" /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" name="isChain" /> Сеть (несколько точек)</label>
        </ActionForm>
      </Card>
    </>
  );
}
