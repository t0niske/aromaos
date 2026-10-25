'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function StageSelect({ id, stage, stages, action }: {
  id: number; stage: string; stages: { id: string; name: string }[];
  action: (id: number, to: string, reason?: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (stage === 'won') return null;
  return (
    <label className="flex items-center gap-2">
      <span className="text-ink-3">Этап</span>
      <select className="input w-auto" value={stage} disabled={pending} aria-label="Этап сделки"
        onChange={e => {
          const to = e.target.value;
          if (to === 'won') { location.hash = 'win'; document.getElementById('win')?.scrollIntoView({ behavior: 'smooth' }); return; }
          let reason: string | undefined;
          if (to === 'lost') { reason = window.prompt('Причина проигрыша') || undefined; if (!reason) return; }
          start(async () => { await action(id, to, reason); router.refresh(); });
        }}>
        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}
