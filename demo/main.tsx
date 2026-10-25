/// <reference types="vite/client" />
/* Точка входа браузерной версии: поднимаем базу, затем приложение */
import { createRoot } from 'react-dom/client';
import './app.css';
import { connectDb, onStatus } from './runtime/db';
import { currentLoc, navigate } from './runtime/nav';
import { App } from './app';

const splash = document.getElementById('splash-status');
onStatus(s => { if (splash) splash.textContent = s; });

// обычные ссылки и GET-формы с путями приложения → переход внутри hash
document.addEventListener('click', e => {
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  const href = a.getAttribute('href') ?? '';
  if (href.startsWith('/')) { e.preventDefault(); navigate(href); return; }
  // якорь на этой странице (#win), а не маршрут (#/…)
  if (href.startsWith('#') && !href.startsWith('#/') && href.length > 1) {
    e.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
document.addEventListener('submit', e => {
  const f = e.target as HTMLFormElement;
  const action = f.getAttribute('action') ?? '';
  if (e.defaultPrevented || !action.startsWith('/') || (f.method || 'get').toLowerCase() !== 'get') return;
  e.preventDefault();
  const q = new URLSearchParams();
  new FormData(f).forEach((v, k) => { if (typeof v === 'string' && v !== '') q.append(k, v); });
  navigate(action + (q.size ? '?' + q : ''));
});

if (!location.hash || location.hash === '#') history.replaceState(null, '', '#' + currentLoc().path);

connectDb().then(() => {
  document.getElementById('splash')?.remove();
  createRoot(document.getElementById('root')!).render(<App />);
}, e => {
  console.error(e);
  if (splash) splash.textContent = 'Не удалось запустить базу в этом браузере. Попробуйте обновить страницу или открыть в Chrome.';
});
