/* Обёртка для функций из файлов 'use server': в браузере они вызываются напрямую.
   redirect() внутри действия — переход на страницу; ждём, пока новая страница отрисуется. */
import { NotFoundSignal, RedirectSignal, navigate, settled } from './nav';

export function wrapAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    try {
      const r = await fn(...args);
      await settled();
      return r;
    } catch (e) {
      if (e instanceof RedirectSignal) {
        navigate(e.url);
        await settled();
        return {} as R; // useActionState ждёт объект состояния
      }
      if (e instanceof NotFoundSignal) { navigate('/'); return {} as R; }
      throw e;
    }
  };
}
