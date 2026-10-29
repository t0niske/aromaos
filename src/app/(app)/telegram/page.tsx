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
  const [[u], bot] = await Promise.all([
    db.select({ chat: t.users.telegramChatId }).from(t.users).where(eq(t.users.id, me.id)),
    getSetting('tg_username'),
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
            <li>• Новые заявки с сайта приходят сразу — с кнопками «Беру в работу», «Тест 3 дня», «Отказ»</li>
            {COMMANDS.map(([c, d]) => <li key={c}>• /{c} — {d.toLowerCase()}</li>)}
          </ul>
        </Card>

        {owner && (
          <Card title="Бот компании">
            <p className="mb-4 text-ink-2">{bot ? <>Подключён бот <b>@{bot}</b>. Чтобы заменить, вставьте новый токен.</> : <>Создайте бота в Telegram у <a className="link" href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> (команда /newbot) и вставьте сюда токен, который он выдаст.</>}</p>
            <ActionForm action={saveBotToken} submit={bot ? 'Заменить токен' : 'Подключить бота'}>
              <Field label="Токен бота"><input className="input" name="token" type="password" autoComplete="off" placeholder="123456789:AA…" required /></Field>
            </ActionForm>
            <p className="mt-4 text-[12.5px] text-ink-3">Токен хранится только на сервере системы. Если он где-то засветился — в @BotFather: /revoke, затем вставьте новый.</p>
          </Card>
        )}
      </div>
    </>
  );
}
