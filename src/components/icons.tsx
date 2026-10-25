/* Набор иконок (линейные, 20×20, stroke=currentColor). */
const P: Record<string, string> = {
  grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  funnel: 'M3 4h14l-5.5 6.5V16l-3 1.5v-7z',
  building: 'M4 17V4.5L11 3v14M11 7h5v10M2.5 17h15M6.5 7h2M6.5 10h2M6.5 13h2M13.5 10h1M13.5 13h1',
  pin: 'M10 17.5s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4.5 5.5 9.5 5.5 9.5zM10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  repeat: 'M4 9V8a3 3 0 0 1 3-3h9l-2.5-2.5M16 11v1a3 3 0 0 1-3 3H4l2.5 2.5',
  calendar: 'M3.5 5.5h13v11h-13zM3.5 9h13M7 3.5v3M13 3.5v3',
  box: 'M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5zM3.5 6.5 10 10l6.5-3.5M10 10v7',
  check: 'M4 10.5l3.5 3.5L16 5.5',
  gear: 'M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
  plus: 'M10 4v12M4 10h12',
  search: 'M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5 17 17',
  menu: 'M3 6h14M3 10h14M3 14h14',
  close: 'M5 5l10 10M15 5 5 15',
  logout: 'M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 13.5 16 10l-3.5-3.5M16 10H8',
  phone: 'M6 3h2.5l1 4-2 1.2a8 8 0 0 0 4.3 4.3L13 10.5l4 1V14a2 2 0 0 1-2 2A12 12 0 0 1 4 5a2 2 0 0 1 2-2z',
  chat: 'M4 15.5V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 5v7a1.5 1.5 0 0 1-1.5 1.5H7z',
  arrow: 'M4 10h12M11 5l5 5-5 5',
  back: 'M16 10H4M9 5 4 10l5 5',
  alert: 'M10 3 2.5 16.5h15zM10 8v4M10 14.2v.3',
  drop: 'M10 3.5S5 9 5 12a5 5 0 0 0 10 0c0-3-5-8.5-5-8.5z',
  star: 'M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z',
  qr: 'M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h2v2h-2zM14.5 14.5h2v2h-2z',
};

export function Icon({ name, size = 18, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={P[name] || ''} />
    </svg>
  );
}
