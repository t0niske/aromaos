/* Роли и разделы (спецификация, раздел 3). Используется и на сервере, и в меню. */
export type Role = 'owner' | 'sales_head' | 'sales' | 'account' | 'service_head' | 'tech' | 'warehouse' | 'accountant' | 'marketer';
export type Section = 'dashboard' | 'leads' | 'clients' | 'objects' | 'subscriptions' | 'visits' | 'devices' | 'tasks' | 'settings';

export const ROLE_NAMES: Record<Role, string> = {
  owner: 'Собственник', sales_head: 'Руководитель продаж', sales: 'Менеджер продаж', account: 'Аккаунт-менеджер',
  service_head: 'Руководитель сервиса', tech: 'Техник', warehouse: 'Кладовщик', accountant: 'Бухгалтер', marketer: 'Маркетолог',
};

const ACCESS: Record<Role, Section[]> = {
  owner: ['dashboard', 'leads', 'clients', 'objects', 'subscriptions', 'visits', 'devices', 'tasks', 'settings'],
  sales_head: ['dashboard', 'leads', 'clients', 'objects', 'subscriptions', 'tasks'],
  sales: ['dashboard', 'leads', 'clients', 'objects', 'subscriptions', 'tasks'],
  account: ['dashboard', 'leads', 'clients', 'objects', 'subscriptions', 'visits', 'tasks'],
  service_head: ['dashboard', 'clients', 'objects', 'visits', 'devices', 'tasks'],
  tech: ['visits', 'devices', 'tasks'],
  warehouse: ['devices', 'tasks'],
  accountant: ['dashboard', 'clients', 'subscriptions', 'tasks'],
  marketer: ['dashboard', 'leads', 'tasks'],
};

export const can = (role: Role, section: Section) => ACCESS[role]?.includes(section) ?? false;
export const homeFor = (role: Role) => (can(role, 'dashboard') ? '/' : '/' + ACCESS[role][0]);

export const NAV: { section: Section; href: string; label: string; icon: string }[] = [
  { section: 'dashboard', href: '/', label: 'Дашборд', icon: 'grid' },
  { section: 'leads', href: '/leads', label: 'Лиды и продажи', icon: 'funnel' },
  { section: 'clients', href: '/clients', label: 'Клиенты', icon: 'building' },
  { section: 'objects', href: '/objects', label: 'Объекты', icon: 'pin' },
  { section: 'subscriptions', href: '/subscriptions', label: 'Подписки', icon: 'repeat' },
  { section: 'visits', href: '/visits', label: 'Визиты', icon: 'calendar' },
  { section: 'devices', href: '/devices', label: 'Оборудование', icon: 'box' },
  { section: 'tasks', href: '/tasks', label: 'Задачи', icon: 'check' },
  { section: 'settings', href: '/settings', label: 'Настройки', icon: 'gear' },
];
