/* Демо-данные AromaOS: npm run db:seed (сервер разработки должен быть остановлен — PGlite однопроцессный).
   Компании и люди вымышленные. Цены тарифов — из прайсов Nova 300 / Nova 1000.
   Тестовые входы (только для локальной разработки):
     owner@aromaos.local   / demo-owner-2026   — собственник
     sales@aromaos.local   / demo-sales-2026   — менеджер продаж
     sales2@aromaos.local  / demo-sales-2026   — менеджер продаж
     service@aromaos.local / demo-service-2026 — руководитель сервиса
     tech@aromaos.local    / demo-tech-2026    — техник */
import { sql } from 'drizzle-orm';
import { connectDb } from './client';
import * as s from './schema';
import catalog from './catalog.json';
import { hashPassword } from '../lib/password';
import { addDays, today } from '../lib/dates';
import { audit, completeVisit, createSubscription, intakeLead, moveLead, renewalSweep, winLead } from '../lib/domain';

async function main() {
  const { db, ready } = connectDb();
  await ready;
  // чистый лист
  await db.execute(sql`truncate audit_log, tasks, visits, device_events, devices, subscriptions, zones, objects, contacts, companies, activities, leads, tariffs, scents, device_models, users restart identity cascade`);

  const [owner, sales1, sales2, serviceHead, tech] = await db.insert(s.users).values([
    { name: 'Айдана Сеитова', email: 'owner@aromaos.local', passwordHash: hashPassword('demo-owner-2026'), role: 'owner' },
    { name: 'Ерлан Жумабеков', email: 'sales@aromaos.local', passwordHash: hashPassword('demo-sales-2026'), role: 'sales' },
    { name: 'Мария Ким', email: 'sales2@aromaos.local', passwordHash: hashPassword('demo-sales-2026'), role: 'sales' },
    { name: 'Тимур Абенов', email: 'service@aromaos.local', passwordHash: hashPassword('demo-service-2026'), role: 'service_head' },
    { name: 'Данияр Ахметов', email: 'tech@aromaos.local', passwordHash: hashPassword('demo-tech-2026'), role: 'tech' },
  ]).returning();

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
  const tariff = (code: string, months: number) => tariffs.find(t => t.modelId === model(code).id && t.periodMonths === months)!;

  // склад: 14 × Nova 300, 6 × Nova 1000
  const devRows = [
    ...Array.from({ length: 14 }, (_, i) => ({ serial: `NV3-2410-${String(i + 1).padStart(3, '0')}`, modelId: model('nova300').id, purchasePrice: 38000, purchaseDate: '2026-10-01', warrantyUntil: '2027-10-01' })),
    ...Array.from({ length: 6 }, (_, i) => ({ serial: `NV10-2410-${String(i + 1).padStart(3, '0')}`, modelId: model('nova1000').id, purchasePrice: 96000, purchaseDate: '2026-10-01', warrantyUntil: '2027-10-01' })),
  ];
  await db.insert(s.devices).values(devRows);

  const t0 = today();
  // лиды со всех четырёх сайтов и из каналов
  const L = async (o: Parameters<typeof intakeLead>[1]) => (await intakeLead(db, o, null)).lead;

  const won = [
    { lead: { name: 'Асель Нурланова', phone: '+77011234501', companyName: 'Кофейня «Бариста Лаб»', industry: 'кофейня', areaM2: 90, sourceSite: 'tynys', message: 'Хотим аромат кофе и выпечки у входа' }, t: ['nova300', 6], start: -120, addr: 'Астана, пр. Мангилик Ел, 28' },
    { lead: { name: 'Руслан Беков', phone: '+77011234502', companyName: 'Барбершоп «Кедр»', industry: 'барбершоп', areaM2: 70, sourceSite: 'hosh', channel: 'form' }, t: ['nova300', 3], start: -75, addr: 'Астана, ул. Кенесары, 40' },
    { lead: { name: 'Гульнара Ибраева', phone: '+77011234503', companyName: 'Отель «Сарыарка Резиденс»', industry: 'отель', areaM2: 650, sourceSite: 'aua', message: 'Фирменный аромат для лобби' }, t: ['nova1000', 6], start: -150, addr: 'Астана, ул. Достык, 12' },
    { lead: { name: 'Павел Ли', phone: '+77011234504', companyName: 'Фитнес «Атлант»', industry: 'фитнес-клуб', areaM2: 800, sourceSite: 'vdokh', message: 'Запах пота в раздевалках' }, t: ['nova1000', 3], start: -60, addr: 'Астана, ул. Сыганак, 18' },
    { lead: { name: 'Динара Касымова', phone: '+77011234505', companyName: 'Салон «Лотос»', industry: 'салон красоты', areaM2: 120, sourceSite: 'tynys', channel: 'whatsapp' }, t: ['nova300', 6], start: -170, addr: 'Астана, ул. Кабанбай батыра, 9' },
    { lead: { name: 'Алибек Омаров', phone: '+77011234506', companyName: 'Бутик «Алтын Сәулет»', industry: 'бутик', areaM2: 150, sourceSite: 'aua' }, t: ['nova300', 1], start: -20, addr: 'Астана, ТРЦ Хан Шатыр' },
    { lead: { name: 'Сабина Ержанова', phone: '+77011234507', companyName: 'Стоматология «Дент Астана»', industry: 'клиника', areaM2: 200, sourceSite: 'vdokh', message: 'Запах больницы в коридоре' }, t: ['nova300', 3], start: -40, addr: 'Астана, ул. Туран, 55' },
    { lead: { name: 'Ержан Тулегенов', phone: '+77011234508', companyName: 'ЖК «Highvill»: лобби', industry: 'ЖК', areaM2: 400, sourceSite: 'tynys', channel: 'phone' }, t: ['nova1000', 6], start: -10, addr: 'Астана, ул. Ахмета Байтурсынова, 1' },
    // история для графиков: два расторжения
    { lead: { name: 'Илья Сорокин', phone: '+77011234509', companyName: 'Пекарня «Нан Үйі»', industry: 'пекарня', areaM2: 60, sourceSite: 'hosh' }, t: ['nova300', 3], start: -130, addr: 'Астана, ул. Бейбитшилик, 14', cancel: { at: -48, reason: 'закрыли точку' } },
    { lead: { name: 'Азамат Нуров', phone: '+77011234510', companyName: 'Шоурум «Керамика»', industry: 'шоурум', areaM2: 220, sourceSite: 'tynys' }, t: ['nova300', 6], start: -95, addr: 'Астана, ул. Сарайшык, 5', cancel: { at: -8, reason: 'не подошёл аромат' } },
  ] as const;

  for (const w of won) {
    const lead = await L({ ...w.lead, utm: { utm_source: w.lead.sourceSite === 'aua' ? 'instagram' : 'google', utm_medium: 'cpc' } });
    await db.update(s.leads).set({ createdAt: new Date(Date.parse(addDays(t0, w.start - 12) + 'T09:00:00Z')) }).where(sql`id = ${lead.id}`);
    for (const st of ['qualify', 'survey', 'trial', 'proposal', 'contract'] as const) await moveLead(db, lead.id, st, lead.ownerId);
    const res = await winLead(db, lead.id, { tariffId: tariff(w.t[0], w.t[1]).id, address: w.addr, startDate: addDays(t0, w.start) }, lead.ownerId);
    if ('cancel' in w) {
      // расторжение в прошлом: дата окончания = дата расторжения, дальше визитов нет, аппарат вернулся на склад
      const end = addDays(t0, w.cancel.at);
      await db.update(s.subscriptions).set({ status: 'cancelled', endDate: end, cancelReason: w.cancel.reason }).where(sql`id = ${res.subscriptionId}`);
      await db.update(s.visits).set({ status: 'cancelled' }).where(sql`subscription_id = ${res.subscriptionId} and planned_date > ${end}`);
      await db.insert(s.visits).values({ objectId: res.objectId, subscriptionId: res.subscriptionId, type: 'uninstall', plannedDate: end, employeeId: tech.id, status: 'done', doneAt: new Date(Date.parse(end + 'T12:00:00Z')) });
      await db.update(s.devices).set({ status: 'stock', objectId: null, zoneId: null }).where(sql`object_id = ${res.objectId}`);
      await db.update(s.tasks).set({ status: 'done' }).where(sql`object_id = ${res.objectId}`);
    }
    if (w.lead.companyName === 'Салон «Лотос»') {
      // продлён заранее: следующая подписка начнётся в день окончания текущей
      const [sub] = await db.select().from(s.subscriptions).where(sql`id = ${res.subscriptionId}`);
      const next = await createSubscription(db, { objectId: res.objectId, tariffId: sub.tariffId, startDate: sub.endDate, withInstall: false, employeeId: tech.id });
      await db.update(s.subscriptions).set({ autoRenew: false }).where(sql`id = ${sub.id}`);
      await audit(db, sales1.id, 'renew', 'subscription', sub.id, { next: next.id });
    }
  }

  // зоны с ароматами на действующих объектах (номера — из коллекции)
  const ZONES: Record<string, [string, number][]> = {
    'Кофейня «Бариста Лаб»': [['Вход', 21], ['Зал', 6]],
    'Барбершоп «Кедр»': [['Зал', 4]],
    'Отель «Сарыарка Резиденс»': [['Лобби', 17], ['Коридоры', 8], ['SPA', 2]],
    'Фитнес «Атлант»': [['Раздевалки', 10], ['Тренажёрный зал', 18]],
    'Салон «Лотос»': [['Ресепшен', 17], ['Зал', 9]],
    'Бутик «Алтын Сәулет»': [['Торговый зал', 29]],
    'Стоматология «Дент Астана»': [['Коридор', 1], ['Ресепшен', 17]],
    'ЖК «Highvill»: лобби': [['Лобби', 26], ['Лифтовой холл', 17]],
  };
  const scentByN = new Map((await db.select().from(s.scents)).map(x => [x.n, x.id]));
  for (const o of await db.select().from(s.objects)) {
    const z = ZONES[o.name];
    if (z) await db.insert(s.zones).values(z.map(([name, n]) => ({ objectId: o.id, name, scentId: scentByN.get(n) ?? null })));
  }

  // прошедшие визиты — выполнены (с оценками), один пропущен
  const past = await db.select().from(s.visits).where(sql`planned_date < ${t0} and status = 'planned'`).orderBy(s.visits.id);
  for (const [i, v] of past.entries()) {
    if (i === 3) { await db.update(s.visits).set({ status: 'missed' }).where(sql`id = ${v.id}`); continue; }
    await completeVisit(db, v.id, { oilMl: v.type === 'install' ? 200 : 150 + (i % 4) * 25, rating: i === 6 ? 3 : 5 - (i % 2), checklist: { refill: true, settings: true, photo: true } }, tech.id);
    await db.update(s.visits).set({ doneAt: new Date(Date.parse(v.plannedDate + 'T11:00:00Z')) }).where(sql`id = ${v.id}`);
  }

  // открытая воронка
  const open = [
    { o: { name: 'Нурсултан А.', phone: '+77021110001', companyName: 'Ресторан «Дастархан»', industry: 'ресторан', areaM2: 300, sourceSite: 'vdokh', message: 'Запах кухни в зале' }, st: 'new' },
    { o: { name: 'Ольга Петрова', phone: '+77021110002', companyName: 'Цветочный «Флора»', industry: 'магазин', areaM2: 60, sourceSite: 'hosh' }, st: 'new' },
    { o: { name: 'Канат С.', phone: '+77021110003', companyName: 'Автосалон «Астана Моторс»', industry: 'автосалон', areaM2: 900, sourceSite: 'aua', channel: 'instagram' }, st: 'qualify' },
    { o: { name: 'Айгерим Б.', phone: '+77021110004', companyName: 'Тойхана «Ак Орда»', industry: 'тойхана', areaM2: 1000, sourceSite: 'vdokh' }, st: 'survey' },
    { o: { name: 'Марат Е.', phone: '+77021110005', companyName: 'Офис «QazTech»', industry: 'офис', areaM2: 450, sourceSite: 'tynys' }, st: 'trial' },
    { o: { name: 'Жанна К.', phone: '+77021110006', companyName: 'Клиника «Мейірім»', industry: 'клиника', areaM2: 250, sourceSite: 'tynys', channel: '2gis' }, st: 'proposal' },
    { o: { name: 'Виктор Н.', phone: '+77021110007', companyName: 'Шоурум «Mebel Lux»', industry: 'шоурум', areaM2: 500, sourceSite: 'aua' }, st: 'contract' },
    { o: { name: 'Самал Д.', phone: '+77021110008', companyName: 'Кофейня «Кофе Тайм»', industry: 'кофейня', areaM2: 50, sourceSite: 'hosh' }, st: 'lost', reason: 'дорого' },
    { o: { name: 'Бекзат Т.', phone: '+77021110009', companyName: 'Хостел «Номад»', industry: 'хостел', areaM2: 180, sourceSite: 'vdokh', message: 'Запах сырости' }, st: 'qualify' },
    { o: { name: 'Алия М.', phone: '+77021110010', industry: 'квартира', areaM2: 85, sourceSite: 'tynys', channel: 'whatsapp' }, st: 'new' },
  ] as const;
  for (const [i, x] of open.entries()) {
    const lead = await L(x.o);
    // разносим по последним 10 дням: видно «возраст» лида и просроченные звонки
    const born = addDays(t0, -((i * 3) % 10));
    await db.update(s.leads).set({ createdAt: new Date(Date.parse(born + 'T10:00:00+05:00')) }).where(sql`id = ${lead.id}`);
    await db.update(s.tasks).set({ dueDate: born }).where(sql`lead_id = ${lead.id}`);
    const path = ['qualify', 'survey', 'trial', 'proposal', 'contract'] as const;
    const upto = x.st === 'lost' ? 2 : path.indexOf(x.st as (typeof path)[number]) + 1;
    for (const st of path.slice(0, upto)) await moveLead(db, lead.id, st, lead.ownerId);
    if (x.st === 'lost') await moveLead(db, lead.id, 'lost', lead.ownerId, 'reason' in x ? x.reason : undefined);
    if (x.st === 'trial' || x.st === 'proposal' || x.st === 'contract')
      await db.update(s.leads).set({ expectedMrr: (x.o.areaM2 ?? 0) > 400 ? 66667 : 33333 }).where(sql`id = ${lead.id}`);
  }
  // повторная заявка с того же номера — уйдёт в комментарий
  await L({ name: 'Нурсултан А.', phone: '8 702 111 00 01', sourceSite: 'tynys', message: 'Ещё раз оставил заявку' });

  // общие задачи
  await db.insert(s.tasks).values([
    { title: 'Заказать масла: Белый чай и Свежий цитрус (остаток < минимума)', assigneeId: serviceHead.id, dueDate: addDays(t0, 2), priority: 'normal', createdById: owner.id },
    { title: 'Подготовить план продаж на ноябрь', assigneeId: owner.id, dueDate: addDays(t0, 5), createdById: owner.id },
    { title: 'Согласовать скидку 5% для шоурума «Mebel Lux»', assigneeId: owner.id, dueDate: t0, priority: 'high', createdById: sales1.id },
    { title: 'Подписать акт сверки с отелем «Сарыарка Резиденс»', assigneeId: owner.id, dueDate: addDays(t0, -1), createdById: owner.id },
    { title: 'Позвонить клиентам с подпиской до конца месяца', assigneeId: sales2.id, dueDate: addDays(t0, 1), priority: 'high', createdById: owner.id },
  ]);

  // ежедневная проверка продлений — в демо сразу, чтобы дашборд и вкладка «На продлении» совпадали
  await renewalSweep(db);
  const n = (t: string) => db.execute(sql.raw(`select count(*)::int as c from ${t}`)).then(r => (r.rows[0] as { c: number }).c);
  console.log('Готово:', { лиды: await n('leads'), клиенты: await n('companies'), объекты: await n('objects'), подписки: await n('subscriptions'), визиты: await n('visits'), аппараты: await n('devices'), задачи: await n('tasks') });
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
