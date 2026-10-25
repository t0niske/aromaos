/* AromaOS — схема базы (PostgreSQL). Ядро по спецификации aroma-marketing/docs/05-business-system.md:
   Лид → Клиент (компания) → Объект → Подписка, вокруг — визиты, оборудование, задачи.
   Все деньги — в тенге, целыми (amount_kzt). Даты без времени — строкой 'YYYY-MM-DD'. */
import {
  pgTable, pgEnum, serial, integer, text, boolean, timestamp, date, jsonb, real, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'owner', 'sales_head', 'sales', 'account', 'service_head', 'tech', 'warehouse', 'accountant', 'marketer',
]);
export const leadStageEnum = pgEnum('lead_stage', ['new', 'qualify', 'survey', 'trial', 'proposal', 'contract', 'won', 'lost']);
export const subStatusEnum = pgEnum('sub_status', ['trial', 'active', 'paused', 'renewing', 'cancelled']);
export const visitTypeEnum = pgEnum('visit_type', ['install', 'service', 'scent_change', 'repair', 'uninstall', 'complaint']);
export const visitStatusEnum = pgEnum('visit_status', ['planned', 'done', 'missed', 'cancelled']);
export const deviceStatusEnum = pgEnum('device_status', ['stock', 'trial', 'client', 'repair', 'written_off']);
export const taskStatusEnum = pgEnum('task_status', ['todo', 'doing', 'done']);
export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high']);

const created = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  phone: text('phone'),
  active: boolean('active').default(true).notNull(),
  createdAt: created(),
}, t => [uniqueIndex('users_email_uq').on(t.email)]);

/* Справочники: аппараты, ароматы, тарифы */
export const deviceModels = pgTable('device_models', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),               // nova300
  name: text('name').notNull(),
  coverageM2: integer('coverage_m2').notNull(),
  tankMl: integer('tank_ml').notNull(),
  flowMlH: real('flow_ml_h').notNull(),
  specs: jsonb('specs').$type<[string, string][]>().default([]).notNull(),
}, t => [uniqueIndex('device_models_code_uq').on(t.code)]);

export const scents = pgTable('scents', {
  id: serial('id').primaryKey(),
  n: integer('n').notNull(),                   // номер в коллекции
  name: text('name').notNull(),
  family: text('family').notNull(),            // fresh | floral | gourmand | hotel | spa | perfume
  power: integer('power').default(2).notNull(),// интенсивность 1–3
  notesTop: text('notes_top'),
  notesHeart: text('notes_heart'),
  notesBase: text('notes_base'),
  description: text('description'),
  costPerMl: integer('cost_per_ml').default(0).notNull(),
  exclusiveCompanyId: integer('exclusive_company_id'), // фирменный аромат клиента — другим не даём
  active: boolean('active').default(true).notNull(),
});

export const tariffs = pgTable('tariffs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  modelId: integer('model_id').references(() => deviceModels.id).notNull(),
  periodMonths: integer('period_months').notNull(),
  priceTotal: integer('price_total').notNull(),
  visitsPerMonth: integer('visits_per_month').default(1).notNull(),
  active: boolean('active').default(true).notNull(),
});

/* Продажи */
export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  companyName: text('company_name'),
  bin: text('bin'),
  industry: text('industry'),
  areaM2: integer('area_m2'),
  city: text('city').default('Астана').notNull(),
  lang: text('lang').default('ru').notNull(),
  sourceSite: text('source_site').default('manual').notNull(), // tynys | aua | vdokh | hosh | manual
  channel: text('channel').default('form').notNull(),          // form | whatsapp | instagram | 2gis | phone | referral …
  utm: jsonb('utm').$type<Record<string, string>>().default({}).notNull(),
  message: text('message'),
  stage: leadStageEnum('stage').default('new').notNull(),
  lostReason: text('lost_reason'),
  expectedMrr: integer('expected_mrr'),
  trialUntil: date('trial_until'),
  ownerId: integer('owner_id').references(() => users.id),
  companyId: integer('company_id'),
  createdAt: created(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [index('leads_stage_idx').on(t.stage), index('leads_phone_idx').on(t.phone)]);

export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  companyId: integer('company_id'),
  userId: integer('user_id').references(() => users.id),
  kind: text('kind').notNull(),                // note | call | whatsapp | meeting | stage | system
  text: text('text').notNull(),
  createdAt: created(),
}, t => [index('activities_lead_idx').on(t.leadId)]);

/* Клиенты */
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  legalForm: text('legal_form').default('ТОО').notNull(), // ТОО | ИП | АО
  bin: text('bin'),
  vatPayer: boolean('vat_payer').default(false).notNull(),
  industry: text('industry'),
  isChain: boolean('is_chain').default(false).notNull(),
  parentId: integer('parent_id'),
  isGov: boolean('is_gov').default(false).notNull(),
  lang: text('lang').default('ru').notNull(),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  ownerId: integer('owner_id').references(() => users.id),
  createdAt: created(),
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  position: text('position'),
  phone: text('phone'),
  email: text('email'),
  isDecisionMaker: boolean('is_decision_maker').default(false).notNull(),
  channel: text('channel').default('whatsapp').notNull(),
});

export const objects = pgTable('objects', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type'),                          // кофейня, бутик, лобби…
  address: text('address'),
  areaM2: integer('area_m2'),
  ceilingM: real('ceiling_m'),
  schedule: text('schedule'),                  // «пн–вс 10:00–22:00» — для таймера и расхода масла
  accessNotes: text('access_notes'),
  contactId: integer('contact_id'),
  createdAt: created(),
});

export const zones = pgTable('zones', {
  id: serial('id').primaryKey(),
  objectId: integer('object_id').references(() => objects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  scentId: integer('scent_id').references(() => scents.id),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  objectId: integer('object_id').references(() => objects.id, { onDelete: 'cascade' }).notNull(),
  tariffId: integer('tariff_id').references(() => tariffs.id).notNull(),
  priceMonth: integer('price_month').notNull(),   // после скидки, ₸ в месяц — из этого считается MRR
  periodMonths: integer('period_months').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: subStatusEnum('status').default('active').notNull(),
  autoRenew: boolean('auto_renew').default(true).notNull(),
  visitsPerMonth: integer('visits_per_month').default(1).notNull(),
  discountPct: integer('discount_pct').default(0).notNull(),
  pausedUntil: date('paused_until'),
  cancelReason: text('cancel_reason'),
  createdAt: created(),
}, t => [index('subs_status_idx').on(t.status)]);

/* Сервис и оборудование */
export const devices = pgTable('devices', {
  id: serial('id').primaryKey(),
  serial: text('serial').notNull(),
  modelId: integer('model_id').references(() => deviceModels.id).notNull(),
  status: deviceStatusEnum('status').default('stock').notNull(),
  objectId: integer('object_id').references(() => objects.id, { onDelete: 'set null' }),
  zoneId: integer('zone_id').references(() => zones.id, { onDelete: 'set null' }),
  purchasePrice: integer('purchase_price'),
  purchaseDate: date('purchase_date'),
  warrantyUntil: date('warranty_until'),
  notes: text('notes'),
  createdAt: created(),
}, t => [uniqueIndex('devices_serial_uq').on(t.serial)]);

export const deviceEvents = pgTable('device_events', {
  id: serial('id').primaryKey(),
  deviceId: integer('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id),
  text: text('text').notNull(),
  createdAt: created(),
});

export const visits = pgTable('visits', {
  id: serial('id').primaryKey(),
  objectId: integer('object_id').references(() => objects.id, { onDelete: 'cascade' }).notNull(),
  subscriptionId: integer('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  type: visitTypeEnum('type').default('service').notNull(),
  plannedDate: date('planned_date').notNull(),
  doneAt: timestamp('done_at', { withTimezone: true }),
  employeeId: integer('employee_id').references(() => users.id),
  status: visitStatusEnum('status').default('planned').notNull(),
  oilMl: integer('oil_ml'),
  rating: integer('rating'),
  comment: text('comment'),
  checklist: jsonb('checklist').$type<Record<string, boolean>>().default({}).notNull(),
  createdAt: created(),
}, t => [index('visits_date_idx').on(t.plannedDate), index('visits_status_idx').on(t.status)]);

/* Задачи */
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: integer('assignee_id').references(() => users.id),
  dueDate: date('due_date'),
  priority: priorityEnum('priority').default('normal').notNull(),
  status: taskStatusEnum('status').default('todo').notNull(),
  leadId: integer('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  objectId: integer('object_id').references(() => objects.id, { onDelete: 'cascade' }),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: created(),
}, t => [index('tasks_assignee_idx').on(t.assigneeId, t.status)]);

/* Журнал действий: кто, что, когда */
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: created(),
}, t => [index('audit_entity_idx').on(t.entity, t.entityId)]);
