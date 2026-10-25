import type { Metadata } from 'next';
import { Suspense } from 'react';
import { asc, eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { ROLE_NAMES } from '@/lib/access';
import { addDays, today } from '@/lib/dates';
import { ActionForm } from '@/components/action-form';
import { Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { createTask } from '../../actions';

export const metadata: Metadata = { title: 'Новая задача' };

export default function NewTaskPage({ searchParams }: PageProps<'/tasks/new'>) {
  return <Suspense fallback={<Skeleton />}><NewTask searchParams={searchParams} /></Suspense>;
}

async function NewTask({ searchParams }: { searchParams: PageProps<'/tasks/new'>['searchParams'] }) {
  const user = await requireUser('tasks');
  const sp = await searchParams;
  const leadId = Number(sp.lead) || null, objectId = Number(sp.object) || null;
  const db = await getDb();
  const [users, lead, obj] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name, role: t.users.role }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name)),
    leadId ? db.select({ name: t.leads.name, company: t.leads.companyName }).from(t.leads).where(eq(t.leads.id, leadId)).then(r => r[0]) : null,
    objectId ? db.select({ name: t.objects.name, companyId: t.objects.companyId }).from(t.objects).where(eq(t.objects.id, objectId)).then(r => r[0]) : null,
  ]);
  const back = lead ? { href: `/leads/${leadId}`, label: lead.company || lead.name } : obj ? { href: `/objects/${objectId}`, label: obj.name } : { href: '/tasks', label: 'Задачи' };

  return (
    <>
      <PageHeader title="Новая задача" back={back} sub={lead ? `По лиду: ${lead.company || lead.name}` : obj ? `По объекту: ${obj.name}` : undefined} />
      <Card className="max-w-[680px]">
        <ActionForm action={createTask} submit="Создать задачу" className="grid gap-4 sm:grid-cols-2">
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          {objectId && <><input type="hidden" name="objectId" value={objectId} /><input type="hidden" name="companyId" value={obj?.companyId ?? ''} /></>}
          <Field label="Что сделать *" className="sm:col-span-2"><input className="input" name="title" required minLength={3} autoFocus /></Field>
          <Field label="Исполнитель"><select className="input" name="assigneeId" defaultValue={user.id}>{users.map(u => <option key={u.id} value={u.id}>{u.name} · {ROLE_NAMES[u.role]}</option>)}</select></Field>
          <Field label="Срок"><input className="input" type="date" name="dueDate" defaultValue={addDays(today(), 1)} /></Field>
          <Field label="Приоритет"><select className="input" name="priority" defaultValue="normal"><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select></Field>
          <Field label="Подробности" className="sm:col-span-2"><textarea className="input" name="description" rows={3} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
