/* База браузерной версии — подменяет src/db/index.ts и src/db/client.ts.
   Тот же PostgreSQL (PGlite) и та же схема, что у сервера, но в памяти вкладки: при открытии загружается
   готовый снимок с демо-данными (scripts/demo-snapshot.ts), и все даты сдвигаются к сегодняшнему дню,
   чтобы «сегодня», просрочки и продления выглядели живыми. Изменения живут до перезагрузки страницы —
   переходы по разделам её не перезагружают. Сброс — перезагрузка. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { today } from '@/lib/dates';
import snapshotUrl from '../snapshot/seed.bin?url';

const makeDb = (client: PGlite) => drizzle({ client, schema });
export type DB = ReturnType<typeof makeDb>;

let conn: Promise<{ db: DB; pg: PGlite }> | null = null;
let status: (s: string) => void = () => {};
export const onStatus = (f: (s: string) => void) => { status = f; };

/* сдвиг всех дат на (сегодня − дата снимка) */
async function shiftDates(pg: PGlite) {
  const t0 = today();
  await pg.exec(`do $$
declare a date; n int; r record;
begin
  select v::date into a from _demo where k = 'anchor';
  n := date '${t0}' - a;
  if n = 0 then return; end if;
  for r in select table_name, column_name, data_type from information_schema.columns
           where table_schema = 'public' and table_name <> '_demo' and data_type in ('date', 'timestamp with time zone', 'timestamp without time zone') loop
    execute format('update %I set %I = %I + %s', r.table_name, r.column_name, r.column_name,
      case when r.data_type = 'date' then n::text else format('interval %L', n || ' days') end);
  end loop;
  update _demo set v = '${t0}' where k = 'anchor';
end $$;`);
}

async function connect() {
  status('Загружаем демо-базу…');
  const res = await fetch(new URL(snapshotUrl, location.href));
  if (!res.ok) throw new Error(`снимок базы: ${res.status}`);
  const loadDataDir = await res.blob();
  status('Запускаем базу данных в браузере…');
  const pg = await PGlite.create({ loadDataDir });
  await shiftDates(pg);
  return { db: makeDb(pg), pg };
}

export const connectDb = () => (conn ??= connect());
export async function getDb() { return (await connectDb()).db; }

/* «Сбросить демо-данные»: база в памяти — перезагрузка возвращает исходный снимок */
export function resetDemo() { location.reload(); }

export * as t from '@/db/schema';
export { schema };
