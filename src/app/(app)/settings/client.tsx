'use client';
import { useState, useTransition } from 'react';
import { rotateApiKey, runRenewals } from '../actions';

/* Новый ключ сайта: показываем один раз — его нужно сразу вставить в настройки сайта */
export function KeyRotate({ id }: { id: number }) {
  const [key, setKey] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (key) return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <code className="num min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-[12.5px]">{key}</code>
      <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(key)}>Копировать</button>
      <span className="w-full text-[12px] text-ink-3">Ключ показан один раз. Старый больше не работает.</span>
    </span>
  );
  return (
    <button className="btn btn-sm" disabled={pending} onClick={() => {
      if (window.confirm('Выпустить новый ключ? Старый перестанет работать.')) start(async () => setKey(await rotateApiKey(id)));
    }}>Новый ключ</button>
  );
}

export function RenewalsButton() {
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const n = await runRenewals();
        setMsg(n ? `На продление переведено: ${n}, задачи созданы` : 'Подписок, которые заканчиваются в ближайшие 30 дней, нет');
      })}>Проверить продления</button>
      {msg && <span className="text-ink-2" role="status">{msg}</span>}
      <span className="w-full text-[12px] text-ink-3">В продакшене это будет запускаться каждый день по расписанию.</span>
    </div>
  );
}
