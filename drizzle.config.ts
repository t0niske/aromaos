import { defineConfig } from 'drizzle-kit';

// npx drizzle-kit generate — новая миграция в drizzle/ после правки src/db/schema.ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
