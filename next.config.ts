import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
