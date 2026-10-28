import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // сервер: самодостаточная сборка в .next-prod/standalone, собирает и выкладывает deploy.sh
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR, output: "standalone" as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  // без плавающего значка Next в режиме разработки (мешает на демо и скриншотах)
  devIndicators: false,
  // встроенный PostgreSQL (wasm) и драйвер pg не бандлим — грузим как есть из node_modules
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
