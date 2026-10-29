/* Расписание бота: таймеры systemd на сервере дёргают
   POST /api/telegram/cron?kind=morning — сводка в 9:00, kind=tick — каждые 5 минут (заявка ждёт 15 минут).
   Доступ — заголовок X-Cron-Key = CRON_KEY из .env, снаружи (через nginx) адрес закрыт. */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { runCron } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const want = process.env.CRON_KEY || '', got = req.headers.get('x-cron-key') || '';
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const kind = req.nextUrl.searchParams.get('kind') === 'morning' ? 'morning' : 'tick';
  return NextResponse.json({ ok: true, ...(await runCron(kind)) });
}
