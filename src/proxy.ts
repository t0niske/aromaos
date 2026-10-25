/* Быстрая (оптимистичная) проверка: без cookie сессии — сразу на /login.
   Настоящая проверка подписи и роли — на сервере в requireUser(). */
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  if (!req.cookies.has('aos_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // всё, кроме входа, публичного API приёма заявок и статики
  matcher: ['/((?!login|api/public|_next/static|_next/image|favicon.ico).*)'],
};
