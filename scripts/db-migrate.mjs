#!/usr/bin/env node
/*
 * Apply pending Drizzle migrations from ./database/drizzle to DATABASE_URL.
 * Tracks applied migrations in the __drizzle_migrations table managed by Drizzle.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);

try {
  console.log('Running migrations from ./database/drizzle ...');
  await migrate(db, { migrationsFolder: './database/drizzle' });
  console.log('Migrations applied');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  await client.end({ timeout: 5 });
}
