/* Остальные модули Next для браузерной версии: next/link, next/form, next/image, next/cache, next/headers, next/server */
import type { AnchorHTMLAttributes, FormHTMLAttributes, ImgHTMLAttributes } from 'react';
import { refresh as rerender } from '../runtime/nav';

// путь приложения → адрес в hash; внешние ссылки и якоря не трогаем
export const toHref = (href: string) => (href.startsWith('/') ? '#' + href : href);

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; prefetch?: unknown; replace?: boolean; scroll?: boolean };
export function Link({ href, ...props }: LinkProps) {
  const rest = { ...props };
  delete rest.prefetch; delete rest.replace; delete rest.scroll;
  return <a href={toHref(href)} {...rest} />;
}
Link.$$client = true;

// формы с action="/путь" (GET) перехватывает main.tsx
export function Form(props: FormHTMLAttributes<HTMLFormElement>) { return <form {...props} />; }
Form.$$client = true;

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string; priority?: boolean; preload?: boolean; quality?: number };
export function Image({ src, alt, ...props }: ImageProps) {
  const rest = { ...props };
  delete rest.priority; delete rest.preload; delete rest.quality;
  // в браузерной версии оптимизатора картинок нет — обычный <img> с путём от корня сборки
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.startsWith('/') ? import.meta.env.BASE_URL + src.slice(1) : src} alt={alt ?? ''} {...rest} />;
}

export const refresh = () => rerender();
export const revalidatePath = refresh;
export const updateTag = refresh;
export const revalidateTag = refresh;

// для QR-наклейки: «origin» указывает на эту страницу, дальше путь пойдёт после #
export async function headers() {
  const base = location.host + location.pathname.replace(/\/$/, '') + '/#';
  return new Headers({ host: base, 'x-forwarded-proto': location.protocol.replace(':', '') });
}
export async function cookies() { return { get: () => undefined, set: () => {}, delete: () => {} }; }
export async function connection() {}
