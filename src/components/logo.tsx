/* Знак AromaOS: капля масла, из которой поднимается волна аромата */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.01em] text-ink">
      <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-[var(--accent-ink)]">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M10 17.5a4.5 4.5 0 0 0 4.5-4.5c0-2.6-4.5-7.5-4.5-7.5S5.5 10.4 5.5 13A4.5 4.5 0 0 0 10 17.5z" />
          <path d="M7 3.2c1 .8 2 .8 3 0s2-.8 3 0" />
        </svg>
      </span>
      {!compact && <span className="text-[17px]">AromaOS</span>}
    </span>
  );
}
