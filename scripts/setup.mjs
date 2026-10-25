// Первый запуск: .env.local со случайным секретом сессий (если ещё нет) + свежая демо-база
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = path.join(root, '.env.local');
if (!fs.existsSync(env)) {
  fs.writeFileSync(env, `# локальные секреты (не в git)\nSESSION_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('Создан .env.local');
}
execSync('npm run db:reset', { cwd: root, stdio: 'inherit' });
console.log('\nГотово. Запуск: npm run dev → http://localhost:3000 (демо-входы — в README)');
