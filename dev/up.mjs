#!/usr/bin/env node
/*
 * Local dev stack orchestrator for rvn-web.
 *
 *   node dev/up.mjs            bring everything up
 *   node dev/up.mjs --fresh    regenerate secrets (logs sessions out)
 *
 * Steps: check docker → clone/pull WS server → generate env files →
 * back up & write rvn-web/.env.local → docker compose up --wait →
 * run drizzle migrations → print summary.
 *
 * rvn-web itself is NOT started here — run `pnpm dev` separately for HMR.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnv, serializeEnv, parseEnv } from './lib/env.mjs';

const DEV_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DEV_DIR, '..'); // rvn-web/
const COMPOSE = join(DEV_DIR, 'docker-compose.dev.yml');
const WS_DIR = join(DEV_DIR, '.ws-server');
const WS_REPO = 'https://github.com/Wiuvel/rvn-socketio-server';
const WEB_ENV = join(ROOT, '.env.local');
const WEB_ENV_BAK = join(ROOT, '.env.local.bak');
const WS_ENV = join(DEV_DIR, '.ws.env');

const fresh = process.argv.includes('--fresh');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

function runQuiet(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'pipe', shell: false, encoding: 'utf8', ...opts });
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// 1. Docker present?
step('Checking Docker');
if (runQuiet('docker', ['version']).status !== 0) {
  fail('Docker is not available. Install Docker Desktop and make sure it is running.');
}
console.log('  Docker OK');

// 2. WS server: clone or update
step('Preparing rvn-socketio-server');
if (!existsSync(WS_DIR)) {
  console.log(`  Cloning ${WS_REPO}`);
  if (run('git', ['clone', '--depth', '1', WS_REPO, WS_DIR]) !== 0) {
    fail('git clone of the WS server failed.');
  }
} else {
  console.log('  Already cloned, pulling latest');
  const r = runQuiet('git', ['-C', WS_DIR, 'pull', '--ff-only']);
  if (r.status !== 0) {
    console.warn('  warn: git pull failed (using existing checkout):', (r.stderr || '').trim());
  }
}

// 3. Generate env files (reuse existing secrets unless --fresh).
// buildEnv re-validates reused secrets — hand-edited/broken values are
// regenerated, so a corrupted dev .env.local self-heals on the next up.
step('Generating env files');
const existing = parseEnv(WEB_ENV);
const { web, ws, regenerated } = buildEnv({ existing, fresh });
if (regenerated.length > 0) {
  console.warn(
    `  warn: invalid secrets in .env.local regenerated: ${regenerated.join(', ')} (sessions using them are reset)`,
  );
}

// 4. Back up the user's real .env.local once, then write the dev one.
if (existsSync(WEB_ENV) && !existsSync(WEB_ENV_BAK)) {
  copyFileSync(WEB_ENV, WEB_ENV_BAK);
  console.log('  Backed up existing .env.local → .env.local.bak');
}
writeFileSync(WEB_ENV, serializeEnv(web, 'rvn-web local dev stack'), 'utf8');
writeFileSync(WS_ENV, serializeEnv(ws, 'rvn-socketio-server local dev'), 'utf8');
console.log('  Wrote .env.local and dev/.ws.env');
if (fresh) console.log('  (--fresh: regenerated CSRF/USER_DATA/INTERNAL secrets)');

// 5. Bring the stack up and wait for health.
// minio-setup is one-shot (exits 0), and `up --wait` treats any exited
// container as failure — so start the long-running services first, then run
// the setup container separately.
step('Starting containers (docker compose up --wait)');
const services = ['postgres', 'redis', 'minio', 'ws-server'];
if (run('docker', ['compose', '-f', COMPOSE, 'up', '-d', '--build', '--wait', ...services]) !== 0) {
  fail(
    'docker compose failed to reach a healthy state. Check: docker compose -f dev/docker-compose.dev.yml logs',
  );
}

step('Setting up MinIO bucket');
if (run('docker', ['compose', '-f', COMPOSE, 'run', '--rm', 'minio-setup']) !== 0) {
  fail('MinIO bucket setup failed.');
}

// 6. Run migrations against the local Postgres (reuse the existing runner)
step('Applying database migrations');
const migrate = run('node', ['scripts/db-migrate.mjs'], {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: web.DATABASE_URL },
});
if (migrate !== 0) fail('Migrations failed.');

// 7. Summary
console.log(`
✓ Dev stack is up.

  rvn-web        http://localhost:3000   (start it: pnpm dev)
  WS server      http://localhost:3002
  Postgres       postgresql://rvn:rvn@localhost:5432/rvn
  Redis          redis://localhost:6379
  MinIO API      http://localhost:9000
  MinIO console  http://localhost:9001   (minioadmin / minioadmin)

  Next:  pnpm dev
  Stop:  node dev/down.mjs        (add --fresh to wipe data, --restore to bring back your real .env.local)
`);
