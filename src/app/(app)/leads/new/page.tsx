import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { CHANNEL_NAMES, SITE_NAMES } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { createLead } from '../actions';

export const metadata: Metadata = { title: 'Новый лид' };

export default function NewLeadPage() {
  return <Suspense fallback={<Skeleton />}><NewLead /></Suspense>;
}

async function NewLead() {
  await requireUser('leads');
  return (
    <>
      <PageHeader title="Новый лид" sub="Звонок, сообщение в WhatsApp или заявка не с сайта" back={{ href: '/leads', label: 'Лиды' }} />
      <Card className="max-w-[760px]">
        <ActionForm action={createLead} submit="Создать лид" className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя *"><input className="input" name="name" required minLength={2} /></Field>
          <Field label="Телефон / WhatsApp"><input className="input" name="phone" type="tel" placeholder="+7 7__ ___ __ __" /></Field>
          <Field label="Компания или объект"><input className="input" name="companyName" /></Field>
          <Field label="Почта"><input className="input" name="email" type="email" /></Field>
          <Field label="Сфера"><input className="input" name="industry" list="industries" placeholder="кофейня, салон, отель…" /></Field>
          <Field label="Площадь, м²"><input className="input" name="areaM2" type="number" min={0} inputMode="numeric" /></Field>
          <Field label="Источник">
            <select className="input" name="sourceSite" defaultValue="manual">
              {Object.entries(SITE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Канал">
            <select className="input" name="channel" defaultValue="phone">
              {Object.entries(CHANNEL_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Что нужно клиенту" className="sm:col-span-2"><textarea className="input" name="message" rows={3} /></Field>
          <datalist id="industries">{['кофейня', 'ресторан', 'салон красоты', 'барбершоп', 'бутик', 'отель', 'клиника', 'фитнес-клуб', 'офис', 'ЖК', 'автосалон', 'тойхана', 'квартира'].map(x => <option key={x} value={x} />)}</datalist>
        </ActionForm>
      </Card>
    </>
  );
}
