/* Вебхук Telegram-бота: Telegram шлёт сюда сообщения и нажатия кнопок.
   Подлинность — заголовок X-Telegram-Bot-Api-Secret-Token (секрет задаётся при подключении бота в «Настройках»). */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSetting, handleUpdate } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const want = await getSetting('tg_secret');
  const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!want || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try { await handleUpdate(await req.json()); } catch (e) { console.error('telegram update', e); }
  return NextResponse.json({ ok: true }); // всегда 200, иначе Telegram будет повторять то же сообщение
}
