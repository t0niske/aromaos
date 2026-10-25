import 'server-only';
import { connectDb } from './client';

/* Доступ к базе из приложения: дожидаемся миграций при первом обращении */
export async function getDb() {
  const { db, ready } = connectDb();
  await ready;
  return db;
}

export * as t from './schema';
