/* Навигация браузерной версии: адрес страницы живёт в hash (#/leads/17?q=…), чтобы работать на GitHub Pages.
   Здесь же — «сигналы» redirect/notFound и ожидание перерисовки после действий. */
import { useSyncExternalStore } from 'react';

export type Loc = { path: string; search: string; frag: string };
export type NavState = { loc: Loc; tick: number; kind: 'nav' | 'refresh' };

export class RedirectSignal { constructor(public url: string) {} }
export class NotFoundSignal {}

function parse(): Loc {
  const raw = decodeURI(location.hash.replace(/^#/, '')) || '/';
  const [beforeFrag, frag = ''] = raw.split('#');
  const [path, search = ''] = beforeFrag.split('?');
  return { path: path.startsWith('/') ? path : '/' + path, search, frag };
}

let state: NavState = { loc: parse(), tick: 0, kind: 'nav' };
const listeners = new Set<() => void>();
const emit = (next: NavState) => { state = next; listeners.forEach(l => l()); };

window.addEventListener('hashchange', () => emit({ loc: parse(), tick: state.tick, kind: 'nav' }));

/* url — путь приложения: '/leads/17?dup=1#win' */
export function navigate(url: string, o: { replace?: boolean } = {}) {
  const hash = '#' + (url.startsWith('/') ? url : '/' + url);
  if (hash === location.hash) return refresh();
  if (o.replace) { history.replaceState(null, '', hash); emit({ loc: parse(), tick: state.tick, kind: 'nav' }); }
  else location.hash = hash;
}

export function refresh() { emit({ loc: state.loc, tick: state.tick + 1, kind: 'refresh' }); }

export const useNav = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
export const currentLoc = () => state.loc;

/* Рендер страницы асинхронный: действия ждут, пока свежие данные окажутся на экране */
let pending = 0;
let waiters: (() => void)[] = [];
export function renderStarted() { pending++; }
export function renderFinished() {
  pending = Math.max(0, pending - 1);
  if (!pending) { const w = waiters; waiters = []; w.forEach(f => f()); }
}
export const settled = () => new Promise<void>(r => (pending ? waiters.push(r) : queueMicrotask(r)));
