'use client';
/* Вкладки внутри карточки: содержимое всех вкладок приходит с сервера, переключение — без запроса */
import { useState, type ReactNode } from 'react';

export function SwitchTabs({ tabs, label }: { tabs: { id: string; label: string; count?: number; content: ReactNode }[]; label: string }) {
  const [cur, setCur] = useState(tabs[0]?.id);
  return (
    <>
      <div className="flex border-b border-line px-6" role="tablist" aria-label={label}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={cur === t.id} onClick={() => setCur(t.id)}
            className={`-mb-px flex-1 border-b-2 px-2 py-2.5 text-[14px] whitespace-nowrap transition-colors ${cur === t.id ? 'border-accent font-medium text-accent' : 'border-transparent text-ink-2 hover:text-ink'}`}>
            {t.label}{t.count != null && <span className="num ml-1">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map(t => <div key={t.id} role="tabpanel" hidden={cur !== t.id}>{t.content}</div>)}
    </>
  );
}
