'use client';
import { useState, useTransition } from 'react';
import { setVisitStatus } from '../../actions';

export function VisitMoves({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const [date, setDate] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block"><span className="label">Перенести на</span>
        <input className="input w-44" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <button className="btn" disabled={!date || pending} onClick={() => start(() => setVisitStatus(id, 'planned', date))}>Перенести</button>
      <button className="btn text-[var(--t-red)]" disabled={pending} onClick={() => start(() => setVisitStatus(id, 'missed'))}>Не состоялся</button>
    </div>
  );
}
