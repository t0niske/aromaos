'use client';
/* Канбан воронки: перетаскивание карточки меняет этап (в «Выиграно» — через форму с тарифом) */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { moveLeadAction } from './actions';

export type KanbanLead = {
  id: number; title: string; person: string; site: string; siteName: string; area: number | null;
  mrr: string | null; owner: string; age: string; stage: string; trialUntil: string | null;
};

export function Kanban({ stages, leads }: { stages: { id: string; name: string }[]; leads: KanbanLead[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [view, move] = useOptimistic(leads, (cur, m: { id: number; stage: string }) => cur.map(l => (l.id === m.id ? { ...l, stage: m.stage } : l)));

  function drop(stage: string) {
    const id = drag; setDrag(null); setOver(null);
    const lead = view.find(l => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === 'won') { router.push(`/leads/${id}#win`); return; }
    let reason: string | undefined;
    if (stage === 'lost') { reason = window.prompt('Причина проигрыша (дорого, ушли к конкуренту, не ответил…)') || undefined; if (!reason) return; }
    start(async () => { move({ id: id!, stage }); await moveLeadAction(id!, stage, reason); });
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6" data-scroll-x>
      <div className="grid auto-cols-[272px] grid-flow-col gap-5">
        {stages.map(s => {
          const items = view.filter(l => l.stage === s.id);
          return (
            <section key={s.id} aria-label={s.name}
              onDragOver={e => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(o => (o === s.id ? null : o))} onDrop={() => drop(s.id)}
              className={`-m-1.5 flex min-h-[220px] flex-col rounded-[10px] border-2 border-dashed p-1.5 transition-colors ${over === s.id ? 'border-accent bg-accent-soft' : 'border-transparent'}`}>
              <h2 className="flex items-center justify-between px-1 pt-0.5 pb-3 text-[16px] font-medium">
                {s.name}<span className="num badge badge-violet">{items.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {items.map(l => (
                  <article key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                    className={`card cursor-grab p-4 active:cursor-grabbing ${drag === l.id ? 'opacity-50' : ''}`}>
                    <Link href={`/leads/${l.id}`} className="block font-medium leading-snug text-ink hover:text-accent">{l.title}</Link>
                    {l.title !== l.person && <div className="truncate text-[12.5px] text-ink-3">{l.person}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                      <span className={`badge site-${l.site}`}>{l.siteName}</span>
                      {l.area && <span className="text-ink-3">{l.area} м²</span>}
                      {l.mrr && <span className="num ml-auto font-medium">{l.mrr}</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
                      <span>{l.owner}</span>
                      <span>{l.trialUntil ? `тест до ${l.trialUntil}` : l.age}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
