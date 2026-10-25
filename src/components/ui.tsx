/* Общие блоки интерфейса (серверные, без состояния). */
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tone } from '@/lib/format';
import { Icon } from './icons';

export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
            <Icon name="back" size={15} /> {back.label}
          </Link>
        )}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] sm:text-[26px]">{title}</h1>
        {sub && <p className="mt-1 text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone === 'gray' ? '' : 'badge-' + tone}`}>{children}</span>;
}

export function Card({ title, action, children, className = '', pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {title && <div className="card-h"><span>{title}</span>{action}</div>}
      {pad ? <div className="card-b">{children}</div> : children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  const c = tone === 'up' ? 'text-[var(--t-green)]' : tone === 'down' || tone === 'warn' ? 'text-[var(--t-red)]' : 'text-ink-3';
  return (
    <div className="card p-4">
      <div className="kicker">{label}</div>
      <div className="num mt-1.5 text-[24px] leading-none font-semibold tracking-[-0.02em]">{value}</div>
      {hint && <div className={`mt-2 text-[12.5px] ${c}`}>{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-ink-3">{children}</div>;
}

/* Заглушки на время загрузки данных (fallback для Suspense) */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <div className="mb-5 h-8 w-56 animate-pulse rounded-lg bg-line" />
      <div className="card p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="mb-3 h-5 animate-pulse rounded bg-line last:mb-0" style={{ width: `${92 - (i % 3) * 14}%` }} />
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Фильтр" data-scroll-x>
      {items.map(i => (
        <Link key={i.href} href={i.href} aria-current={i.href === active ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 whitespace-nowrap ${i.href === active ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
          {i.label}{i.count != null && <span className="num ml-1.5 text-ink-3">{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
