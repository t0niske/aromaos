// Запуск `next dev` из папки проекта, откуда бы ни вызвали (предпросмотр запускает из корня сессии)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
process.argv = [process.argv[0], 'next', 'dev', '-p', process.env.PORT || '3100'];
await import('next/dist/bin/next');
