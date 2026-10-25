/* Приложение браузерной версии: те же страницы src/app, маршруты — из структуры папок, как у Next */
import { startTransition, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import AppLayout from '@/app/(app)/layout';
import { Empty, PageHeader } from '@/components/ui';
import { resolve } from './runtime/rsc';
import { NotFoundSignal, RedirectSignal, navigate, renderFinished, renderStarted, useNav, type Loc } from './runtime/nav';
import { signInAs } from './roles';
import { DemoBar } from './demo-bar';

type PageModule = { default: ComponentType<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>; metadata?: { title?: string | { default?: string } } };
const modules = import.meta.glob<PageModule>('../src/app/**/page.tsx', { eager: true });

type Route = { segs: string[]; mod: PageModule; app: boolean };
const routes: Route[] = Object.entries(modules)
  .filter(([file]) => !file.includes('/login/'))
  .map(([file, mod]) => {
    const rel = file.replace('../src/app', '').replace(/\/page\.tsx$/, '');
    return { segs: rel.split('/').filter(s => s && !/^\(.*\)$/.test(s)), mod, app: rel.includes('(app)') };
  })
  // точные сегменты раньше параметров: /leads/new раньше /leads/[id]
  .sort((a, b) => b.segs.length - a.segs.length || a.segs.filter(s => s.startsWith('[')).length - b.segs.filter(s => s.startsWith('[')).length);

function match(path: string) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.segs.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (r.segs.every((s, i) => (s.startsWith('[') ? ((params[s.slice(1, -1)] = decodeURIComponent(parts[i])), true) : s === parts[i]))) return { ...r, params };
  }
  return null;
}

const NotFound = () => (
  <>
    <PageHeader title="Страница не найдена" />
    <div className="card"><Empty>Такой страницы нет. <a className="link" href="#/">На главную</a></Empty></div>
  </>
);

const REDIRECTED = Symbol('redirected');
async function render(loc: Loc): Promise<ReactNode | typeof REDIRECTED> {
  // входа нет: /login (в том числе после «Выйти») сразу открывает систему — собственником или ролью из ?as=
  if (loc.path === '/login') {
    navigate(await signInAs(new URLSearchParams(loc.search).get('as')), { replace: true });
    return REDIRECTED;
  }
  const m = match(loc.path);
  const title = m?.mod.metadata?.title;
  document.title = (typeof title === 'string' ? title : title?.default) ? `${typeof title === 'string' ? title : title?.default} — AromaOS` : 'AromaOS';
  const searchParams = Promise.resolve(Object.fromEntries(new URLSearchParams(loc.search)));
  const page = m ? <m.mod.default params={Promise.resolve(m.params)} searchParams={searchParams} /> : <NotFound />;
  try {
    return await resolve(m && !m.app ? page : <AppLayout params={Promise.resolve({})}>{page}</AppLayout>);
  } catch (e) {
    if (e instanceof RedirectSignal) { navigate(e.url, { replace: true }); return REDIRECTED; }
    if (e instanceof NotFoundSignal) return resolve(<AppLayout params={Promise.resolve({})}><NotFound /></AppLayout>);
    throw e;
  }
}

export function App() {
  const { loc, tick, kind } = useNav();
  const [view, setView] = useState<ReactNode>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    renderStarted();
    const slow = setTimeout(() => n === seq.current && setBusy(true), 150);
    render(loc).then(v => {
      if (n !== seq.current || v === REDIRECTED) return;
      startTransition(() => { setView(v); setError(null); });
      if (kind === 'nav') requestAnimationFrame(() => {
        const target = loc.frag && document.getElementById(loc.frag);
        if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      });
    }, e => {
      console.error(e);
      if (n === seq.current) setError(String(e?.message ?? e));
    }).finally(() => {
      clearTimeout(slow);
      if (n === seq.current) setBusy(false);
      renderFinished();
    });
  }, [loc, tick, kind]);

  return (
    <>
      <div className={`demo-progress ${busy ? 'on' : ''}`} aria-hidden="true" />
      {error ? (
        <main className="grid min-h-dvh place-items-center p-6">
          <div className="card max-w-md p-6 text-center">
            <h1 className="text-[18px] font-medium">Что-то пошло не так</h1>
            <p className="mt-2 text-[13px] text-ink-3">{error}</p>
            <a className="btn btn-primary mt-4" href="#/">На главную</a>
          </div>
        </main>
      ) : view}
      <DemoBar />
    </>
  );
}
