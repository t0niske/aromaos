/* Подключение к базе. Без DATABASE_URL — встроенный PostgreSQL (PGlite) в папке data/,
   ничего ставить не нужно. С DATABASE_URL — настоящий PostgreSQL (прод: сервер в РК).
   Миграции из drizzle/ применяются при первом подключении. Модуль без 'server-only',
   чтобы им пользовались и скрипты (seed); в приложение он попадает через src/db/index.ts. */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

function connect() {
  if (process.env.DATABASE_URL) {
    const db = drizzlePg(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
    return { db, ready: migratePg(db, { migrationsFolder: MIGRATIONS }) };
  }
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), 'data', 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  // при остановке (Ctrl+C) закрываем базу аккуратно — PGlite плохо переносит обрыв посреди записи
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { pg.close().finally(() => process.exit(0)); });
  const db = drizzlePglite(pg, { schema });
  return { db, ready: migratePglite(db, { migrationsFolder: MIGRATIONS }) };
}

type Conn = ReturnType<typeof connect>;
// Подключаемся лениво, при первом обращении: при сборке (много воркеров) база не открывается вовсе.
// Один экземпляр на процесс — в dev Next перезагружает модули, поэтому держим в globalThis.
const g = globalThis as unknown as { __aromaos?: Conn };
export const connectDb = (): Conn => (g.__aromaos ??= connect());

export type DB = Conn['db'];
export { schema };
