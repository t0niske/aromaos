'use client';
/* Боковое меню: на ПК — постоянная колонка, на телефоне — верхняя панель + выдвижное меню */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Logo } from './logo';

export type NavItem = { href: string; label: string; icon: string; count?: number };

export function Sidebar({ items, user }: { items: NavItem[]; user: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

  const nav = (
    <nav className="grid gap-0.5" aria-label="Разделы">
      {items.map(i => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined} onClick={() => setOpen(false)}
          className={`flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 ${active(i.href) ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
          <Icon name={i.icon} className={active(i.href) ? 'text-accent' : 'text-ink-3'} />
          <span className="flex-1">{i.label}</span>
          {!!i.count && <span className="num rounded-full bg-[var(--t-red-bg)] px-1.5 text-[11.5px] font-semibold text-[var(--t-red)]">{i.count}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-[var(--bg)]/90 px-4 backdrop-blur lg:hidden">
        <Link href="/"><Logo /></Link>
        <button className="btn btn-ghost size-10 p-0" onClick={() => setOpen(true)} aria-label="Открыть меню" aria-expanded={open}>
          <Icon name="menu" size={22} />
        </button>
      </header>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 px-2"><Logo /></Link>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-line pt-3">{user}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-label="Закрыть меню" />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col bg-surface px-3 py-4 shadow-xl">
            <div className="mb-5 flex items-center justify-between px-2">
              <Logo />
              <button className="btn btn-ghost size-9 p-0" onClick={() => setOpen(false)} aria-label="Закрыть меню"><Icon name="close" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <div className="border-t border-line pt-3">{user}</div>
          </div>
        </div>
      )}
    </>
  );
}
