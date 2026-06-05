#!/usr/bin/env node
/*
 * Tear down the local dev stack.
 *
 *   node dev/down.mjs            stop containers (keep data volumes)
 *   node dev/down.mjs --fresh    stop and delete Postgres/MinIO volumes
 *   node dev/down.mjs --restore  also restore your real .env.local from backup
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DEV_DIR, '..');
const COMPOSE = join(DEV_DIR, 'docker-compose.dev.yml');
const DATA_DIR = join(DEV_DIR, '.data');
const WEB_ENV = join(ROOT, '.env.local');
const WEB_ENV_BAK = join(ROOT, '.env.local.bak');

const fresh = process.argv.includes('--fresh');
const restore = process.argv.includes('--restore');

const args = ['compose', '-f', COMPOSE, 'down'];
if (fresh) args.push('-v');

console.log(`▶ docker ${args.join(' ')}`);
const r = spawnSync('docker', args, { stdio: 'inherit', shell: false });
if ((r.status ?? 1) !== 0) {
  console.error('✗ docker compose down failed.');
  process.exit(1);
}

if (fresh && existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('  Removed dev/.data (Postgres + MinIO volumes)');
}

// Restore the real .env.local: forced by --restore, otherwise ask (only when
// a backup exists and we're in an interactive terminal).
let doRestore = restore;
if (!doRestore && existsSync(WEB_ENV_BAK) && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('? Restore your real .env.local from .env.local.bak? [Y/N] '))
    .trim()
    .toLowerCase();
  rl.close();
  doRestore = answer === 'y' || answer === 'yes';
}

if (doRestore) {
  if (existsSync(WEB_ENV_BAK)) {
    // move (not copy): иначе устаревший .bak блокирует свежий бэкап при следующем up.mjs
    rmSync(WEB_ENV, { force: true });
    renameSync(WEB_ENV_BAK, WEB_ENV);
    console.log('  Restored .env.local from .env.local.bak (backup consumed)');
  } else {
    console.warn('  warn: no .env.local.bak to restore');
  }
}

console.log('✓ Dev stack stopped.');
