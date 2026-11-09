/* Откуда пришёл человек с сайта: реферер, страница входа, utm_* и метки рекламы → понятная подпись для CRM и бота.
   Результат кладётся в leads.utm: «Источник», «Переход с», «Вход» + исходные utm_*, gclid, yclid, fbclid. */
export type LeadSrc = { ref?: string; landing?: string; utm?: Record<string, string> };

const HOSTS: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google, поиск'],
  [/(^|\.)(yandex\.|ya\.ru$)/, 'Яндекс, поиск'],
  [/(^|\.)bing\.com$/, 'Bing, поиск'],
  [/(^|\.)2gis\./, '2ГИС'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'Telegram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
];

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function describeSource(s: LeadSrc | undefined): Record<string, string> {
  if (!s) return {};
  const utm = Object.fromEntries(Object.entries(s.utm ?? {}).filter(([k, v]) => /^(utm_\w+|gclid|yclid|fbclid)$/.test(k) && v).slice(0, 10));
  const h = s.ref ? host(s.ref) : '';
  let label: string;
  if (utm.utm_source) label = [utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' / ');
  else if (utm.gclid) label = 'Google Ads';
  else if (utm.yclid) label = 'Яндекс Директ';
  else if (utm.fbclid) label = 'Facebook / Instagram, реклама';
  else if (h) label = HOSTS.find(([re]) => re.test(h))?.[1] ?? `Переход с ${h}`;
  else label = 'Прямой заход';
  return { 'Источник': label, ...(h && { 'Переход с': h }), ...(s.landing && { 'Вход': s.landing }), ...utm };
}
