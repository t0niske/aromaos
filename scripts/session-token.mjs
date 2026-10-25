// Токен сессии для автотестов и снимков экрана: node scripts/session-token.mjs <userId>
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret = fs.readFileSync(path.join(root, '.env.local'), 'utf8').match(/SESSION_SECRET=(\w+)/)[1];
const body = Buffer.from(JSON.stringify({ uid: +process.argv[2] || 1, exp: Date.now() + 3600_000 })).toString('base64url');
process.stdout.write(`aos_session=${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`);
