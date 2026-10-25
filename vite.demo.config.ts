/* Сборка браузерной демо-версии (npm run demo / demo:build): те же страницы src/app, но без сервера —
   база PGlite в браузере, серверные модули подменяются файлами из demo/. Результат — статика для GitHub Pages. */
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const r = (p: string) => path.resolve(__dirname, p).replace(/\\/g, '/');

// серверные модули приложения → браузерные замены
const SWAP: Record<string, string> = {
  [r('src/db/index.ts')]: r('demo/runtime/db.ts'),
  [r('src/db/client.ts')]: r('demo/runtime/db.ts'),
  [r('src/lib/auth.ts')]: r('demo/runtime/auth.ts'),
  [r('src/lib/password.ts')]: r('demo/runtime/password.ts'),
};

function swapServerModules(): Plugin {
  return {
    name: 'aromaos-swap', enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null;
      const res = await this.resolve(source, importer, { ...options, skipSelf: true });
      const id = res?.id.replace(/\\/g, '/').split('?')[0];
      return id && SWAP[id] ? SWAP[id] : null;
    },
  };
}

/* 'use server' — функции вызываются напрямую, обёрнутые в wrapAction (redirect → переход);
   'use client' — экспортам ставится флаг $$client, чтобы рендерер отдал их React как есть */
function directives(): Plugin {
  return {
    name: 'aromaos-directives', enforce: 'pre',
    transform(code, id) {
      if (!/\.(t|j)sx?$/.test(id) || id.includes('node_modules')) return null;
      const head = code.replace(/^(\s|\/\*[\s\S]*?\*\/|\/\/.*\n)*/, '');
      if (head.startsWith("'use server'") || head.startsWith('"use server"')) {
        const names: string[] = [];
        const out = code.replace(/^export async function (\w+)/gm, (_, n) => { names.push(n); return `async function ${n}`; });
        return out + `\nimport { wrapAction as __wrapAction } from '${r('demo/runtime/actions.ts')}';\n`
          + names.map(n => `const __w_${n} = __wrapAction(${n});`).join('\n')
          + `\nexport { ${names.map(n => `__w_${n} as ${n}`).join(', ')} };\n`;
      }
      if (head.startsWith("'use client'") || head.startsWith('"use client"')) {
        const names = [...code.matchAll(/^export (?:default )?(?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]);
        if (!names.length) return null;
        return code + `\nfor (const __c of [${names.join(', ')}]) if (typeof __c === 'function') (__c as { $$client?: boolean }).$$client = true;\n`;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: r('demo'),
  base: './',
  publicDir: r('public'),
  plugins: [swapServerModules(), directives(), react(), tailwind()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: r('src') + '/' },
      { find: /^next\/link$/, replacement: r('demo/shims/next-link.ts') },
      { find: /^next\/form$/, replacement: r('demo/shims/next-form.ts') },
      { find: /^next\/image$/, replacement: r('demo/shims/next-image.ts') },
      { find: /^next\/navigation$/, replacement: r('demo/shims/next-navigation.ts') },
      { find: /^next\/cache$/, replacement: r('demo/shims/next-cache.ts') },
      { find: /^next\/headers$/, replacement: r('demo/shims/next-headers.ts') },
      { find: /^next\/server$/, replacement: r('demo/shims/next-server.ts') },
      { find: /^server-only$/, replacement: r('demo/shims/empty.ts') },
    ],
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: { port: 3200, fs: { allow: [r('.')] } },
  build: { outDir: r('dist-demo'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 6000 },
});
