/* Что сервер понимает о заходе на сайт: источник, устройство, человек это или бот.
   Правила — docs/web-visits.md (по образцу счётчика «Сто дорог»). Без базы: проверяется скриптом scripts/test-web-detect.ts. */

const BOT = /bot|crawl|spider|slurp|yandex(?!browser|searchbrowser)|googlebot|google-inspectiontool|bingbot|headless|lighthouse|pagespeed|curl|wget|python|httpclient|java\/|go-http|okhttp|axios|node-fetch|scrapy|phantom|selenium|puppeteer|playwright|monitor|uptime|preview|facebookexternalhit|telegrambot|whatsapp|vkshare/i;

/* Группы источников для сводки — как «Источники, сводка» в Яндекс Метрике. Цвет постоянный: одна группа — один цвет везде */
export const SOURCE_GROUPS = {
  direct: { label: 'Прямые заходы', color: '#2a78d6' },
  yandex: { label: 'Поиск Яндекса', color: '#eb6834' },
  google: { label: 'Поиск Google', color: '#1baf7a' },
  ads: { label: 'Реклама', color: '#eda100' },
  maps: { label: 'Карты', color: '#e87ba4' },
  social: { label: 'Соцсети и мессенджеры', color: '#008300' },
  ai: { label: 'ИИ-помощники', color: '#7a5af5' },
  sites: { label: 'Другие сайты', color: '#6b655d' },
} as const;
export type SourceGroup = keyof typeof SOURCE_GROUPS;

export function sourceGroup(source: string): SourceGroup {
  if (source === 'Прямой заход') return 'direct';
  if (source === 'Поиск Яндекса') return 'yandex';
  if (source === 'Поиск Google' || source === 'Поиск Bing') return 'google';
  if (['Яндекс Директ', 'Google Реклама', 'Реклама Meta'].includes(source) || source.startsWith('Реклама')) return 'ads';
  if (['Яндекс Карты', '2ГИС', 'Google Карты'].includes(source)) return 'maps';
  if (['Instagram', 'Facebook', 'Telegram', 'WhatsApp', 'ВКонтакте', 'TikTok', 'YouTube', 'Threads'].includes(source)) return 'social';
  if (['ChatGPT', 'Perplexity', 'Алиса', 'Gemini', 'Copilot'].includes(source)) return 'ai';
  return 'sites';
}

const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^(www\.|m\.|l\.|lm\.)/, ''); } catch { return ''; } };
const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return ''; } };

/* Источник захода — по первому просмотру: метки рекламы, utm, затем откуда пришёл */
export function webSource(utm: Record<string, string>, ref: string): string {
  if (utm.yclid) return 'Яндекс Директ';
  if (utm.gclid) return 'Google Реклама';
  if (utm.fbclid && !utm.utm_source) return 'Реклама Meta';
  if (utm.utm_source) return 'Реклама: ' + utm.utm_source.slice(0, 100);
  const h = hostOf(ref), p = pathOf(ref);
  if (!h) return 'Прямой заход';
  if (/(^|\.)yandex\.[a-z.]+$/.test(h) && p.startsWith('/maps')) return 'Яндекс Карты';
  if (/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/.test(h)) return 'Поиск Яндекса';
  if (/(^|\.)google\.[a-z.]+$/.test(h) && p.startsWith('/maps')) return 'Google Карты';
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'Поиск Google';
  if (/(^|\.)bing\.com$/.test(h)) return 'Поиск Bing';
  if (/(^|\.)2gis\.[a-z.]+$/.test(h)) return '2ГИС';
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
  if (/(^|\.)facebook\.com$/.test(h)) return 'Facebook';
  if (/(^|\.)threads\.(net|com)$/.test(h)) return 'Threads';
  if (h === 't.me' || /(^|\.)telegram\.org$/.test(h)) return 'Telegram';
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(h)) return 'WhatsApp';
  if (/(^|\.)vk\.(com|ru)$/.test(h)) return 'ВКонтакте';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'TikTok';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'YouTube';
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(h)) return 'ChatGPT';
  if (/(^|\.)perplexity\.ai$/.test(h)) return 'Perplexity';
  if (/(^|\.)gemini\.google\.com$/.test(h)) return 'Gemini';
  if (/(^|\.)copilot\.microsoft\.com$/.test(h)) return 'Copilot';
  if (/(^|\.)alice\.yandex\.ru$/.test(h)) return 'Алиса';
  return 'Сайт: ' + h.slice(0, 100);
}

/* Устройство, браузер и система по подписи браузера */
export function webDevice(ua: string | null | undefined, touch = false, screen?: string | null) {
  const u = ua || '';
  const os = /iPhone|iPad|iPod/.test(u) ? 'iOS' : u.includes('Android') ? 'Android' : u.includes('Windows') ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS' : u.includes('CrOS') ? 'ChromeOS' : u.includes('Linux') ? 'Linux' : '—';
  const browser = /YaBrowser|YaSearchBrowser/.test(u) ? 'Яндекс Браузер' : u.includes('Edg/') ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera'
    : u.includes('SamsungBrowser') ? 'Samsung' : u.includes('Instagram') ? 'Instagram' : /FBAN|FBAV/.test(u) ? 'Facebook'
    : u.includes('Firefox/') ? 'Firefox' : /Chrome\/|CriOS/.test(u) ? 'Chrome' : u.includes('Safari/') ? 'Safari' : '—';
  const m = screen ? /^(\d+)x(\d+)$/.exec(screen) : null;
  const w = m ? Math.min(+m[1], +m[2]) : 0;
  const device = u.includes('iPad') || (u.includes('Android') && !u.includes('Mobile')) ? 'планшет'
    : /Mobile|iPhone|iPod|Android/.test(u) ? 'телефон'
    : u.includes('Macintosh') && touch ? 'планшет'
    : touch && w > 0 && w < 600 ? 'телефон' : 'компьютер';
  return { device, browser, os };
}

export const isBotAgent = (ua: string | null | undefined) => !ua || !ua.trim() || BOT.test(ua);

/* Человек, подозрительно или бот — и почему. finished: заход закончился, можно судить по отсутствию ping и leave */
export function classifyVisit(v: {
  userAgent: string | null; webdriver: boolean; activeSeconds: number; eventsCount: number; hasLeave: boolean; lastPingAt: Date | null;
}, pagesFirst5Min: number, finished: boolean) {
  const bot: string[] = [], suspect: string[] = [];
  if (isBotAgent(v.userAgent)) bot.push('подпись робота или скрипта');
  if (v.webdriver) bot.push('браузер управляется программой');
  if (pagesFirst5Min > 30) suspect.push(`${pagesFirst5Min} страниц за 5 минут`);
  if (finished) {
    if (!v.lastPingAt && !v.hasLeave) suspect.push('страница не была видна на экране');
    else if (v.activeSeconds < 2 && v.eventsCount === 0) suspect.push('меньше 2 секунд без единого действия');
  }
  if (bot.length) return { kind: 'bot', reasons: [...bot, ...suspect] };
  return { kind: suspect.length ? 'suspect' : 'human', reasons: suspect };
}

/* Подписи действий на сайте для админки */
export const WEB_EVENTS: Record<string, string> = {
  tel: 'Нажал на телефон', wa: 'Открыл WhatsApp', form_open: 'Открыл форму заявки', form_view: 'Увидел форму заявки',
  form_start: 'Начал заполнять форму', form_error: 'Ошибка отправки формы', lead: 'Оставил заявку', scroll: 'Дочитал страницу',
  out: 'Ушёл по внешней ссылке', file: 'Открыл документ', scent: 'Смотрел аромат', model: 'Переключил аппарат',
  faq: 'Открыл вопрос', osi: 'Шаблон для ОСИ', space: 'Смотрел пространство',
};
