import type { Metadata } from 'next';
import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { getDb, t } from '@/db';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/access';
import { COMMANDS, getSetting } from '@/lib/telegram';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Field, PageHeader, Skeleton } from '@/components/ui';
import { saveBotToken, unlinkTelegram } from './actions';
import { LinkButton } from './client';

export const metadata: Metadata = { title: 'Telegram' };

export default function TelegramPage() {
  return <Suspense fallback={<Skeleton rows={8} />}><TelegramSettings /></Suspense>;
}

async function TelegramSettings() {
  const me = await requireUser();
  const db = await getDb();
  const [[u], bot, group] = await Promise.all([
    db.select({ chat: t.users.telegramChatId }).from(t.users).where(eq(t.users.id, me.id)),
    getSetting('tg_username'),
    getSetting('tg_group'),
  ]);
  const owner = can(me.role, 'settings');
  return (
    <>
      <PageHeader title="Telegram" sub="Заявки с сайта и управление системой прямо из чата" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Мой Telegram">
          {!bot ? <p className="text-ink-2">Бот ещё не подключён{owner ? ' — вставьте токен справа' : ' — это делает собственник'}.</p> : u?.chat ? (
            <div className="grid gap-4">
              <p className="text-ink-2"><Badge tone="green">подключён</Badge> Бот <a className="link" href={`https://t.me/${bot}`} target="_blank" rel="noopener">@{bot}</a> пишет вам сюда.</p>
              <div className="flex flex-wrap gap-2"><LinkButton again /><form action={unlinkTelegram}><button className="btn">Отключить</button></form></div>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-ink-2">Нажмите кнопку — откроется бот @{bot}. Нажмите в нём «Запустить», и он начнёт присылать вам заявки и задачи.</p>
              <LinkButton />
            </div>
          )}
          <ul className="mt-5 grid gap-1.5 border-t border-line pt-4 text-[13.5px] text-ink-2">
            <li>• В общей группе — заявки, замеры и установки с кнопками «Беру», сводка в 9:00</li>
            <li>• В личке — назначенные вам заявки, ваши задачи и выезды, утром — план на день</li>
            {COMMANDS.map(([c, d]) => <li key={c}>• /{c} — {d.toLowerCase()}</li>)}
          </ul>
        </Card>

        {owner && (
          <Card title="Бот компании">
            <p className="mb-4 text-ink-2">{bot ? <>Подключён бот <b>@{bot}</b>. Чтобы заменить, вставьте новый токен.</> : <>Создайте бота в Telegram у <a className="link" href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> (команда /newbot) и вставьте сюда токен, который он выдаст.</>}</p>
            <ActionForm action={saveBotToken} submit={bot ? 'Заменить токен' : 'Подключить бота'}>
              <Field label="Токен бота"><input className="input" name="token" type="password" autoComplete="off" placeholder="123456789:AA…" required /></Field>
            </ActionForm>
            {bot && <div className="mt-5 border-t border-line pt-4">
              <p className="font-medium text-ink">Общая группа {group ? <Badge tone="green">подключена</Badge> : <Badge>не подключена</Badge>}</p>
              <p className="mt-1 text-[13.5px] text-ink-2">Создайте группу команды в Telegram, добавьте в неё @{bot} и отправьте там команду <b>/group</b> (со своего подключённого Telegram). Без группы общие сообщения приходят каждому в личку.</p>
            </div>}
            <p className="mt-4 text-[12.5px] text-ink-3">Токен хранится только на сервере системы. Если он где-то засветился — в @BotFather: /revoke, затем вставьте новый.</p>
          </Card>
        )}
      </div>
    </>
  );
}
