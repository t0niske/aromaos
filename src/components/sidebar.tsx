'use client';
/* Оболочка: тёмная боковая панель с разделами (на телефоне — выдвижная) и плавающая верхняя панель
   с поиском, колокольчиком просроченных задач и меню пользователя */
import Form from 'next/form';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Logo } from './logo';

export type NavItem = { href: string; label: string; icon: string; group?: string; count?: number };
export type ShellUser = { name: string; role: string; initials: string };

export function Shell({ items, user, overdue, logout, search }: { items: NavItem[]; user: ShellUser; overdue: number; logout: ReactNode; search: boolean }) {
  const path = usePathname();
  const q = useSearchParams().get('q') ?? '';
  const query = path === '/search' ? q : '';
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

  // группы в порядке появления; пункты без группы — сверху без заголовка
  const groups: { name?: string; items: NavItem[] }[] = [];
  for (const i of items) {
    const g = groups.find(x => x.name === i.group);
    if (g) g.items.push(i); else groups.push({ name: i.group, items: [i] });
  }

  const nav = (
    <nav aria-label="Разделы" className="pb-4">
      {groups.map(g => (
        <div key={g.name ?? '-'}>
          {g.name && <div className="nav-section">{g.name}</div>}
          <div className="grid gap-1">
            {g.items.map(i => (
              <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined} onClick={() => setOpen(false)} className="nav-link">
                <Icon name={i.icon} size={20} />
                <span className="flex-1 truncate">{i.label}</span>
                {!!i.count && <span className="nav-count num">{i.count}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const panel = (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href="/" onClick={() => setOpen(false)}><Logo tone="dark" /></Link>
        <button className="nav-close lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню"><Icon name="close" /></button>
      </div>
      <div className="nav-scroll min-h-0 flex-1 overflow-y-auto px-3.5">{nav}</div>
      <div className="px-5 pb-4 text-[12px] text-[var(--nav-ink-2)]">AromaOS · v0.1 · демо-данные</div>
    </>
  );

  return (
    <>
      <aside className="nav-panel fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col lg:flex">{panel}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button className="absolute inset-0 bg-[#2f3349]/50" onClick={() => setOpen(false)} aria-label="Закрыть меню" />
          <div className="nav-panel absolute inset-y-0 left-0 flex w-[min(280px,86vw)] flex-col shadow-xl">{panel}</div>
        </div>
      )}

      <div className="topbar-wrap">
        <header className="card topbar">
          <button className="topbar-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Открыть меню" aria-expanded={open}>
            <Icon name="menu" size={22} />
          </button>
          {search && <Form action="/search" className="topbar-search" role="search">
            <Icon name="search" size={20} className="shrink-0 text-ink-3" />
            <input name="q" type="search" placeholder="Поиск по лидам, клиентам, объектам" aria-label="Поиск" autoComplete="off"
              key={query} defaultValue={query} />
          </Form>}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href="/tasks" className="topbar-btn relative" aria-label={overdue ? `Просроченные задачи: ${overdue}` : 'Задачи'} title={overdue ? `Просрочено задач: ${overdue}` : 'Просроченных задач нет'}>
              <Icon name="bell" size={22} />
              {overdue > 0 && <span className="topbar-dot num">{overdue > 9 ? '9+' : overdue}</span>}
            </Link>
            <UserMenu user={user} logout={logout} />
          </div>
        </header>
      </div>
    </>
  );
}

function UserMenu({ user, logout }: { user: ShellUser; logout: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const avatar = (
    <span className="avatar">
      {user.initials}
      <span className="avatar-online" aria-hidden="true" />
    </span>
  );
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center rounded-full" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`${user.name}: меню`}>
        {avatar}
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+10px)] z-40 w-60 py-2" role="menu">
          <div className="flex items-center gap-3 px-4 py-2">
            {avatar}
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[13px] text-ink-3">{user.role}</span>
            </span>
          </div>
          <div className="my-1.5 border-t border-line" />
          <Link href="/tasks" className="menu-item" role="menuitem" onClick={() => setOpen(false)}><Icon name="check" /> Мои задачи</Link>
          <Link href="/telegram" className="menu-item" role="menuitem" onClick={() => setOpen(false)}><Icon name="chat" /> Telegram</Link>
          <div className="my-1.5 border-t border-line" />
          <div className="px-3 pt-1">{logout}</div>
        </div>
      )}
    </div>
  );
}
