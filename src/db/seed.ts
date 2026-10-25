/* Наполнение базы демо-данными: npm run db:seed (сервер разработки должен быть остановлен — PGlite однопроцессный).
   Сами данные и тестовые входы — в demo-data.ts. */
import { sql } from 'drizzle-orm';
import { connectDb } from './client';
import { seedDemo } from './demo-data';

async function main() {
  const { db, ready } = connectDb();
  await ready;
  await seedDemo(db);
  const n = (t: string) => db.execute(sql.raw(`select count(*)::int as c from ${t}`)).then(r => (r.rows[0] as { c: number }).c);
  console.log('Готово:', { лиды: await n('leads'), клиенты: await n('companies'), объекты: await n('objects'), подписки: await n('subscriptions'), визиты: await n('visits'), аппараты: await n('devices'), задачи: await n('tasks') });
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
