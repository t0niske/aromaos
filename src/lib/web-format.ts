/* Форматирование заходов на сайт для админки: время по Астане (UTC+5), длительность, метки. */
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const astana = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString();

/* «14 ноя 18:40»; сегодняшние — только время */
export function when(d: Date | null | undefined, todayShort = true) {
  if (!d) return '—';
  const s = astana(d), now = astana(new Date());
  const time = s.slice(11, 16);
  return todayShort && s.slice(0, 10) === now.slice(0, 10) ? time : `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${time}`;
}
export const clock = (d: Date) => astana(d).slice(11, 19);
export const dayKey = (d: Date) => astana(d).slice(0, 10);

/* 0 → «0 с», 75 → «1 мин 15 с», 3700 → «1 ч 2 мин» */
export function dur(sec: number) {
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) return `${Math.floor(sec / 60)} мин${sec % 60 ? ` ${sec % 60} с` : ''}`;
  return `${Math.floor(sec / 3600)} ч ${Math.floor((sec % 3600) / 60)} мин`;
}

export const KIND: Record<string, [string, 'gray' | 'amber' | 'red']> = {
  human: ['человек', 'gray'], suspect: ['подозрительно', 'amber'], bot: ['бот', 'red'],
};

/* Адрес страницы без строки запроса, чтобы список не пестрил метками */
export const cleanPath = (p: string | null | undefined) => (p ? p.split('?')[0] || '/' : '—');

/* «Сейчас на сайте» — ping за последние 2 минуты (вынесено из компонентов: в рендере нельзя звать Date.now) */
export const onlineSince = () => new Date(Date.now() - 120_000);
export const isOnline = (lastPing: Date | null) => !!lastPing && Date.now() - lastPing.getTime() < 120_000;
