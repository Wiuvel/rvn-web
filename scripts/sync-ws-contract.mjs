#!/usr/bin/env node
/**
 * WebSocket contract sync / drift detection.
 *
 * Fetches `Wiuvel/rvn-socketio-server/src/types.ts` from GitHub and compares
 * it to our pinned snapshot at `lib/websocket/__upstream__/server-types.ts`.
 *
 * Modes:
 *   - default (`pnpm run ws:contract:sync`): show diff vs HEAD of `main`,
 *     update the snapshot, and rewrite the pinned commit SHA in the banner.
 *   - `--check` (`pnpm run ws:contract:check`): exit non-zero if our snapshot
 *     drifts from the pinned upstream commit. Network-free — only re-reads
 *     the local snapshot and re-checks the embedded SHA matches what we
 *     fetched the last time. Used by CI.
 *
 * Notes:
 *   - We compare against a *pinned* commit (not `main`) so a fast-moving
 *     server repo doesn't break our CI between sync runs. The pinned SHA
 *     lives in the snapshot's banner.
 *   - The body of the snapshot below the banner MUST stay byte-identical
 *     to upstream's `src/types.ts` — that's what the contract-check uses
 *     to assert structural equality with `lib/websocket/types.ts`.
 *
 * @module scripts/sync-ws-contract
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const SNAPSHOT_PATH = resolve(REPO_ROOT, 'lib/websocket/__upstream__/server-types.ts');
const UPSTREAM_OWNER = 'Wiuvel';
const UPSTREAM_REPO = 'rvn-socketio-server';
const UPSTREAM_PATH = 'src/types.ts';
const BANNER_END_MARKER = '// ============================================================================';

const BODY_START_MARKER_RE = /^\/\*\*\s*$/m;

const args = new Set(process.argv.slice(2));
const isCheckMode = args.has('--check');

/* ------------------------------------------------------------------------- */
/* Utils                                                                      */
/* ------------------------------------------------------------------------- */

/** Split snapshot file into (banner, body, pinnedSha). Body is upstream source. */
function splitSnapshot(snapshot) {
  const lines = snapshot.split('\n');
  let bannerEndIdx = -1;
  let bannerCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === BANNER_END_MARKER) {
      bannerCount++;
      if (bannerCount === 3) {
        bannerEndIdx = i;
        break;
      }
    }
  }
  if (bannerEndIdx === -1) {
    throw new Error('Failed to locate banner terminator in snapshot file.');
  }

  const banner = lines.slice(0, bannerEndIdx + 1).join('\n');
  const rest = lines.slice(bannerEndIdx + 1).join('\n');
  const bodyMatch = rest.match(BODY_START_MARKER_RE);
  if (!bodyMatch) {
    throw new Error('Failed to locate body start in snapshot file.');
  }
  const body = rest.slice(bodyMatch.index);

  const pinnedShaMatch = banner.match(/^\/\/ Pinned\s*:\s*([0-9a-f]{40})\s*$/m);
  if (!pinnedShaMatch) {
    throw new Error('Failed to locate pinned commit SHA in snapshot banner.');
  }

  return { banner, body, pinnedSha: pinnedShaMatch[1] };
}

/** GitHub Contents API raw fetch. Returns { content, sha } where sha is the file blob SHA. */
async function fetchUpstream(ref) {
  const url = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/${UPSTREAM_PATH}?ref=${ref}`;
  const headers = { Accept: 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
  }
  const json = await res.json();
  if (!json.content || json.encoding !== 'base64') {
    throw new Error(`Unexpected GitHub API response for ${url}`);
  }
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  return { content, sha: json.sha };
}

/** Get the latest commit SHA on `main`. */
async function fetchHeadCommit() {
  const url = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/main`;
  const headers = { Accept: 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
  }
  const json = await res.json();
  if (!json.sha) throw new Error(`No commit sha in response for ${url}`);
  return json.sha;
}

/** Render a unified diff between two strings. */
function unifiedDiff(a, b, aLabel, bLabel) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const out = [`--- ${aLabel}`, `+++ ${bLabel}`];
  let i = 0;
  let j = 0;
  while (i < aLines.length || j < bLines.length) {
    if (i < aLines.length && j < bLines.length && aLines[i] === bLines[j]) {
      i++;
      j++;
      continue;
    }
    let aEnd = i;
    let bEnd = j;
    while (aEnd < aLines.length && (bEnd >= bLines.length || aLines[aEnd] !== bLines[bEnd])) aEnd++;
    while (bEnd < bLines.length && (aEnd >= aLines.length || aLines[aEnd] !== bLines[bEnd])) bEnd++;
    out.push(`@@ -${i + 1},${aEnd - i} +${j + 1},${bEnd - j} @@`);
    for (let k = i; k < aEnd; k++) out.push('-' + aLines[k]);
    for (let k = j; k < bEnd; k++) out.push('+' + bLines[k]);
    i = aEnd;
    j = bEnd;
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------------- */
/* Modes                                                                      */
/* ------------------------------------------------------------------------- */

async function runCheck() {
  const snapshot = await readFile(SNAPSHOT_PATH, 'utf8');
  const { body, pinnedSha } = splitSnapshot(snapshot);

  const { content: upstream } = await fetchUpstream(pinnedSha);

  if (body.trimEnd() !== upstream.trimEnd()) {
    process.stderr.write(
      `[ws:contract:check] Snapshot drift detected at pinned commit ${pinnedSha}.\n`,
    );
    process.stderr.write(unifiedDiff(upstream, body, 'upstream@pinned', 'snapshot') + '\n');
    process.exit(1);
  }
  process.stdout.write(`[ws:contract:check] Snapshot byte-identical to upstream@${pinnedSha}.\n`);
}

async function runSync() {
  const snapshot = await readFile(SNAPSHOT_PATH, 'utf8');
  const { banner, body, pinnedSha } = splitSnapshot(snapshot);

  const headSha = await fetchHeadCommit();
  const { content: upstream } = await fetchUpstream(headSha);

  if (body.trimEnd() === upstream.trimEnd() && pinnedSha === headSha) {
    process.stdout.write(
      `[ws:contract:sync] Already up-to-date with upstream@${headSha}. No changes.\n`,
    );
    return;
  }

  if (body.trimEnd() !== upstream.trimEnd()) {
    process.stdout.write(
      `[ws:contract:sync] Diff vs upstream@${headSha}:\n` +
        unifiedDiff(body, upstream, `snapshot@${pinnedSha}`, `upstream@${headSha}`) +
        '\n',
    );
  }

  const newBanner = banner.replace(
    /^\/\/ Pinned\s*:\s*[0-9a-f]{40}\s*$/m,
    `// Pinned : ${headSha}`,
  );
  const next = `${newBanner}\n\n${upstream.startsWith('\n') ? upstream.slice(1) : upstream}`;
  await writeFile(SNAPSHOT_PATH, next, 'utf8');

  process.stdout.write(
    `[ws:contract:sync] Snapshot updated: pinned ${pinnedSha} -> ${headSha}.\n` +
      `  Now run \`pnpm run type:check\` to verify our local types still match.\n`,
  );
}

/* ------------------------------------------------------------------------- */
/* Entry                                                                      */
/* ------------------------------------------------------------------------- */

try {
  if (isCheckMode) {
    await runCheck();
  } else {
    await runSync();
  }
} catch (err) {
  process.stderr.write(`[ws:contract] ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
}
