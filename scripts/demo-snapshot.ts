/* Снимок демо-базы для браузерной версии (вызывается из npm run demo / demo:build).
   Собираем базу в памяти: миграции + демо-данные, пароли в формате демо-версии, дата «привязки» —
   по ней браузер сдвигает все даты к текущему дню. Пишем demo/snapshot/seed.bin (tar.gz) и seed.json. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';
import { DEMO_PASSWORDS, seedDemo } from '../src/db/demo-data';
import { today } from '../src/lib/dates';

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'demo', 'snapshot');

async function main() {
  // версия меняется вместе со схемой и демо-данными → у посетителей база пересоздастся
  const sources = [
    ...fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort().map(f => path.join(root, 'drizzle', f)),
    path.join(root, 'src/db/demo-data.ts'), path.join(root, 'src/db/catalog.json'), path.join(root, 'src/lib/domain.ts'),
  ];
  const version = crypto.createHash('sha256').update(sources.map(f => fs.readFileSync(f)).join('\n')).digest('hex').slice(0, 12);
  const metaFile = path.join(out, 'seed.json');
  if (fs.existsSync(metaFile) && JSON.parse(fs.readFileSync(metaFile, 'utf8')).version === version && fs.existsSync(path.join(out, 'seed.bin'))) {
    console.log('Снимок демо-базы актуален:', version);
    return;
  }

  const t = Date.now();
  const pg = new PGlite();
  const db = drizzle({ client: pg, schema });
  await migrate(db, { migrationsFolder: path.join(root, 'drizzle') });
  await seedDemo(db);
  for (const [email, password] of Object.entries(DEMO_PASSWORDS))
    await pg.query('update users set password_hash = $1 where email = $2', [`demo$${password}`, email]);
  const anchor = today();
  await pg.exec('create table _demo (k text primary key, v text not null)');
  await pg.query("insert into _demo values ('anchor', $1)", [anchor]);
  await pg.exec('vacuum full');
  const dump = await pg.dumpDataDir('gzip');
  await pg.close();

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'seed.bin'), Buffer.from(await dump.arrayBuffer()));
  fs.writeFileSync(metaFile, JSON.stringify({ version, anchor }, null, 2) + '\n');
  console.log(`Снимок демо-базы: ${version}, ${(dump.size / 1024).toFixed(0)} КБ, ${((Date.now() - t) / 1000).toFixed(1)} с`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
