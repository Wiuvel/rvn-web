import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/database/schema.ts',
  out: './database/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
