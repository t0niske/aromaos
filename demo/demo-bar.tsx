/* Плашка «Демо»: смотреть систему глазами другой роли, где хранятся данные, сброс к исходным */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { getCurrentUser } from './runtime/auth';
import { resetDemo } from './runtime/db';
import { navigate, useNav } from './runtime/nav';
import { ROLES, signInAs } from './roles';

export function DemoBar() {
  const { loc, tick } = useNav();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { getCurrentUser().then(u => setEmail(u?.email ?? null)); }, [loc, tick]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function switchTo(as: string) {
    setBusy(as);
    navigate(await signInAs(as));
    setBusy(null);
    setOpen(false);
  }
  function reset() {
    if (!confirm('Вернуть демо-данные к исходным? Ваши изменения пропадут.')) return;
    setBusy('reset');
    resetDemo();
  }
  const current = ROLES.find(r => r.email === email);

  return (
    <div className="demo-bar" ref={ref}>
      {open && (
        <div className="card mb-2 w-[min(300px,calc(100vw-32px))] p-4 text-[13px]" role="dialog" aria-label="Демо-версия">
          <div className="font-medium text-ink">Посмотреть глазами роли</div>
          <ul className="mt-2 grid gap-1">
            {ROLES.map(r => (
              <li key={r.as}>
                <button onClick={() => switchTo(r.as)} disabled={!!busy} aria-current={r.email === email}
                  className={`flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left transition ${r.email === email ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2'}`}>
                  <span className="min-w-0">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{r.text}</span>
                  </span>
                  {r.email === email && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-ink-3">
            Настоящая система, но целиком в вашем браузере: база с демо-данными работает прямо на этой странице, менять можно всё.
            Изменения видите только вы, после перезагрузки страницы данные снова исходные. Компании и люди вымышленные.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-soft btn-sm" onClick={reset} disabled={!!busy}>{busy === 'reset' ? 'Сбрасываем…' : 'Сбросить данные'}</button>
            <a className="btn btn-sm" href="https://github.com/t0niske/aromaos" target="_blank" rel="noreferrer">Исходный код</a>
          </div>
        </div>
      )}
      <button className="demo-pill" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
        <span className="size-2 rounded-full bg-[var(--t-green)]" aria-hidden="true" />
        Демо{current ? ` · ${current.title}` : ''}
        <Icon name={open ? 'close' : 'users'} size={15} />
      </button>
    </div>
  );
}
