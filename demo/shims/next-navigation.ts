/* next/navigation для браузерной версии */
import { useMemo } from 'react';
import { NotFoundSignal, RedirectSignal, navigate, refresh, useNav } from '../runtime/nav';

export function redirect(url: string): never { throw new RedirectSignal(url); }
export const permanentRedirect = redirect;
export function notFound(): never { throw new NotFoundSignal(); }

export const usePathname = () => useNav().loc.path;
export function useSearchParams() {
  const s = useNav().loc.search;
  return useMemo(() => new URLSearchParams(s), [s]);
}

const router = {
  push: (url: string) => navigate(url),
  replace: (url: string) => navigate(url, { replace: true }),
  refresh,
  back: () => history.back(),
  forward: () => history.forward(),
  prefetch: () => {},
};
export const useRouter = () => router;
