/* Справочники из catalog.json: модели аппаратов, ароматы, тарифы (цены из прайсов Nova 300 / Nova 1000).
   Нужны и демо-базе, и рабочей: на сервере заполняются при первом запуске (/setup). */
import type { DB } from './client';
import * as s from './schema';
import catalog from './catalog.json';

export async function seedCatalog(db: DB) {
  const models = await db.insert(s.deviceModels).values(catalog.models.map(m => ({
    code: m.id, name: m.name, coverageM2: m.area, tankMl: m.tank, flowMlH: m.flow, specs: m.specs as [string, string][],
  }))).returning();
  const model = (code: string) => models.find(m => m.code === code)!;

  await db.insert(s.scents).values(catalog.scents.map(x => ({
    n: x.n, name: x.name, family: x.family, power: x.power, notesTop: x.top, notesHeart: x.heart, notesBase: x.base,
    description: x.desc, costPerMl: 30 + (x.n % 5) * 5,
  })));

  const tariffs = await db.insert(s.tariffs).values(catalog.models.flatMap(m => m.plans.map(p => ({
    name: `${m.name} · ${p.months} мес`, modelId: model(m.id).id, periodMonths: p.months, priceTotal: p.total, visitsPerMonth: 1,
  })))).returning();

  return { models, model, tariffs };
}
