/* Форматирование для интерфейса: тенге, даты по-русски, подписи статусов. */
export const kzt = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₸';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const day = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : new Date(d.getTime() + 5 * 3_600_000).toISOString();
  return `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
};
export const dayYear = (d: string | null | undefined) => (d ? `${day(d)} ${d.slice(0, 4)}` : '—');

export const SITE_NAMES: Record<string, string> = {
  tynys: 'Tynys', aua: 'ÁUA', vdokh: 'Aromé', hosh: 'HOSH', manual: 'Вручную',
};
export const CHANNEL_NAMES: Record<string, string> = {
  form: 'Форма на сайте', whatsapp: 'WhatsApp', instagram: 'Instagram', '2gis': '2ГИС', phone: 'Звонок', referral: 'Рекомендация', email: 'Почта',
};
export const SUB_STATUS: Record<string, [string, Tone]> = {
  trial: ['Тест', 'violet'], active: ['Активна', 'green'], paused: ['Пауза', 'amber'], renewing: ['На продлении', 'blue'], cancelled: ['Расторгнута', 'gray'],
};
export const VISIT_TYPE: Record<string, string> = {
  install: 'Установка', service: 'Обслуживание', scent_change: 'Смена аромата', repair: 'Ремонт', uninstall: 'Демонтаж', complaint: 'По жалобе',
};
export const VISIT_STATUS: Record<string, [string, Tone]> = {
  planned: ['Запланирован', 'blue'], done: ['Выполнен', 'green'], missed: ['Пропущен', 'red'], cancelled: ['Отменён', 'gray'],
};
export const DEVICE_STATUS: Record<string, [string, Tone]> = {
  stock: ['На складе', 'gray'], trial: ['На тесте', 'violet'], client: ['У клиента', 'green'], repair: ['В ремонте', 'amber'], written_off: ['Списан', 'red'],
};
export const TASK_STATUS: Record<string, string> = { todo: 'К выполнению', doing: 'В работе', done: 'Готово' };
export const PRIORITY: Record<string, [string, Tone]> = { low: ['Низкий', 'gray'], normal: ['Обычный', 'blue'], high: ['Высокий', 'red'] };
export const SCENT_FAMILY: Record<string, string> = {
  fresh: 'Свежие', floral: 'Цветочные', gourmand: 'Гурманские', hotel: 'Отельные', spa: 'SPA', perfume: 'Парфюмерные',
};

export type Tone = 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'violet';

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
