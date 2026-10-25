/* Небольшие графики без библиотек: SVG и CSS, рисуются на сервере. Цвета — из токенов темы. */
import type { ReactNode } from 'react';

/* Полукруглый индикатор: доля 0–100 */
export function Gauge({ value, label }: { value: number; label?: ReactNode }) {
  const v = Math.max(0, Math.min(100, value));
  const arc = 'M10 60a50 50 0 0 1 100 0';
  return (
    <div className="relative mx-auto w-full max-w-[150px]">
      <svg viewBox="0 0 120 66" className="block w-full" role="img" aria-label={`${v}%`}>
        <path d={arc} fill="none" strokeWidth="11" strokeLinecap="round" style={{ stroke: 'var(--t-violet-bg)' }} />
        {v > 0 && <path d={arc} fill="none" strokeWidth="11" strokeLinecap="round" pathLength={100} strokeDasharray={`${v} 100`} style={{ stroke: 'var(--accent)' }} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <div className="num text-[22px] font-semibold text-ink">{v}%</div>
        {label && <div className="mt-1 text-[12px] text-ink-3">{label}</div>}
      </div>
    </div>
  );
}

/* Линия с заливкой: тренд по точкам */
export function Sparkline({ points, tone = 'green' }: { points: number[]; tone?: 'green' | 'violet' }) {
  const w = 160, h = 56, pad = 4;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / Math.max(1, points.length - 1)) * w, pad + (1 - (p - min) / span) * (h - pad * 2)] as const);
  // сглаженная кривая через середины отрезков
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const color = tone === 'green' ? 'var(--t-green)' : 'var(--accent)';
  const id = `spark-${tone}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-14 w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} style={{ fill: `url(#${id})` }} />
      <path d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: color }} />
    </svg>
  );
}

/* Кольцевая диаграмма: доли по сегментам, в центре — подпись */
export function Donut({ parts, center }: { parts: { value: number; color: string; label: string }[]; center: ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  let acc = 0;
  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 42 42" className="block size-full -rotate-90" role="img" aria-label={parts.map(p => `${p.label}: ${p.value}`).join(', ')}>
        <circle cx="21" cy="21" r="15.9" fill="none" strokeWidth="4.2" style={{ stroke: 'var(--surface-2)' }} />
        {total > 0 && parts.filter(p => p.value > 0).map(p => {
          const len = (p.value / total) * 100, off = acc;
          acc += len;
          // небольшой зазор между сегментами
          return <circle key={p.label} cx="21" cy="21" r="15.9" fill="none" strokeWidth="4.2" pathLength={100}
            strokeDasharray={`${Math.max(0, len - 1.2)} ${100 - Math.max(0, len - 1.2)}`} strokeDashoffset={-off} style={{ stroke: p.color }} />;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">{center}</div>
    </div>
  );
}

/* Столбцы по месяцам: вверх — плюс (фиолетовый), вниз — минус (оранжевый). HTML, чтобы подписи не масштабировались */
export function BarsUpDown({ data, fmt }: { data: { label: string; up: number; down: number; current?: boolean }[]; fmt: (n: number) => string }) {
  const maxUp = Math.max(1, ...data.map(d => d.up));
  const maxDown = Math.max(...data.map(d => d.down));
  const step = niceStep(Math.max(maxUp, maxDown) / 3);
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = maxDown > 0 ? Math.ceil(maxDown / step) * step : 0;
  const ticks: number[] = [];
  for (let v = top; v >= -bottom; v -= step) ticks.push(v);
  const H = 270, range = top + bottom;
  const y = (v: number) => ((top - v) / range) * H;
  return (
    <div className="flex gap-2 pt-2">
      <div className="relative w-12 shrink-0 text-right text-[12px] text-ink-3 sm:w-14" style={{ height: H }} aria-hidden="true">
        {ticks.map(v => <span key={v} className="num absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: y(v) }}>{v < 0 ? '−' : ''}{fmt(Math.abs(v))}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: H }}>
          {ticks.map(v => <span key={v} className={`absolute inset-x-0 border-t ${v === 0 ? 'border-line-2' : 'border-dashed border-line'}`} style={{ top: y(v) }} />)}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map(d => (
              <div key={d.label} className="group relative" title={`${d.label}: +${fmt(d.up)} / −${fmt(d.down)}`}>
                {d.up > 0 && <span className="absolute left-1/2 w-3 -translate-x-1/2 rounded-t-[6px] sm:w-4" style={{ top: y(d.up), height: y(0) - y(d.up), background: 'var(--accent)', opacity: d.current ? 1 : 0.85 }} />}
                {d.down > 0 && <span className="absolute left-1/2 w-3 -translate-x-1/2 rounded-b-[6px] sm:w-4" style={{ top: y(0) + 2, height: y(-d.down) - y(0), background: 'var(--t-amber)' }} />}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 grid text-center text-[12.5px] text-ink-3" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
          {data.map(d => <span key={d.label} className={d.current ? 'font-medium text-ink' : ''}>{d.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
