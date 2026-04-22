/**
 * Remnawave Panel API client.
 * Wraps the panel REST API for managing VPN subscriptions.
 */

import { db } from '@/lib/database/db';
import { panelSettings } from '@/lib/database/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/utils/secure-logger';

/* Remnawave API types */
export type RemnawaveUserStatus = 'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED';
export type TrafficLimitStrategy = 'NO_RESET' | 'DAY' | 'WEEK' | 'MONTH' | 'MONTH_ROLLING';

export interface RemnawaveUserTraffic {
  usedTrafficBytes: number;
  lifetimeUsedTrafficBytes: number;
  onlineAt: string | null;
  firstConnectedAt: string | null;
  lastConnectedNodeUuid: string | null;
}

export interface RemnawaveUser {
  uuid: string;
  id: number;
  shortUuid: string;
  username: string;
  status: RemnawaveUserStatus;
  trafficLimitBytes: number;
  trafficLimitStrategy: TrafficLimitStrategy;
  expireAt: string;
  telegramId: number | null;
  email: string | null;
  description: string | null;
  tag: string | null;
  hwidDeviceLimit: number | null;
  trojanPassword: string;
  vlessUuid: string;
  ssPassword: string;
  subRevokedAt: string | null;
  lastTrafficResetAt: string | null;
  createdAt: string;
  updatedAt: string;
  subscriptionUrl: string;
  userTraffic: RemnawaveUserTraffic;
}

export interface CreateUserParams {
  username: string;
  expireAt: string;
  status?: RemnawaveUserStatus;
  trafficLimitBytes?: number;
  trafficLimitStrategy?: TrafficLimitStrategy;
  description?: string;
  tag?: string;
}

export interface RemnawaveHealthMetrics {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  uptime: number;
  pid: number;
  instanceId: string;
  instanceType: string;
}

/* Panel settings (stored in DB) */
let settingsCache: { endpoint: string; apiKey: string; cachedAt: number } | null = null;
const SETTINGS_CACHE_TTL = 60_000;

/**
 * Fetch Remnawave endpoint and API key from the `panel_settings` table.
 * Results are cached for 1 minute to avoid repeated DB lookups.
 */
async function getPanelSettings(): Promise<{ endpoint: string; apiKey: string } | null> {
  if (settingsCache && Date.now() - settingsCache.cachedAt < SETTINGS_CACHE_TTL) {
    return { endpoint: settingsCache.endpoint, apiKey: settingsCache.apiKey };
  }

  if (!db) return null;

  const rows = await db
    .select()
    .from(panelSettings)
    .where(eq(panelSettings.key, 'remnawave_endpoint'))
    .limit(1);

  const keyRow = await db
    .select()
    .from(panelSettings)
    .where(eq(panelSettings.key, 'remnawave_api_key'))
    .limit(1);

  const endpoint = rows[0]?.value;
  const apiKey = keyRow[0]?.value;

  if (!endpoint || !apiKey) return null;

  settingsCache = { endpoint, apiKey, cachedAt: Date.now() };
  return { endpoint, apiKey };
}

/**
 * Invalidate the in-memory settings cache.
 * Call after updating panel settings in the admin UI.
 */
export function invalidateSettingsCache() {
  settingsCache = null;
}

/* HTTP client */

/**
 * Generic HTTP request to the Remnawave Panel API.
 * @param method - HTTP method (GET, POST, etc.)
 * @param path   - API path (e.g. `/api/users`)
 * @param body   - Optional JSON body
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const settings = await getPanelSettings();
  if (!settings) {
    return { ok: false, error: 'Remnawave panel is not configured' };
  }

  const url = `${settings.endpoint.replace(/\/$/, '')}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('Remnawave API error', { status: res.status, path, body: text.slice(0, 200) });
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status };
    }

    const json = await res.json();
    return { ok: true, data: json.response ?? json };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Remnawave API request failed', { path, error: message });
    return { ok: false, error: message };
  }
}

/** Check panel connectivity via the system health endpoint. */
export async function healthCheck(): Promise<
  { ok: true; data: { runtimeMetrics: RemnawaveHealthMetrics[] } } | { ok: false; error: string }
> {
  return request('GET', '/api/system/health');
}

/** Create a new VPN user in the Remnawave panel. */
export async function createUser(
  params: CreateUserParams,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('POST', '/api/users', params);
}

/** Retrieve a user by their Remnawave UUID. */
export async function getUserByUuid(
  uuid: string,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('GET', `/api/users/${uuid}`);
}

/** Disable a user (status → DISABLED, VPN access revoked). */
export async function disableUser(
  uuid: string,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('POST', `/api/users/${uuid}/actions/disable`);
}

/** Enable a previously disabled user (status → ACTIVE). */
export async function enableUser(
  uuid: string,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('POST', `/api/users/${uuid}/actions/enable`);
}

/** Reset the user's consumed traffic counters. */
export async function resetUserTraffic(
  uuid: string,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('POST', `/api/users/${uuid}/actions/reset-traffic`);
}

/**
 * Revoke subscription — regenerates VPN credentials (passwords, UUIDs).
 * @param uuid                - Remnawave user UUID
 * @param revokeOnlyPasswords - When true, only passwords are rotated (shortUuid kept)
 */
export async function revokeSubscription(
  uuid: string,
  revokeOnlyPasswords = false,
): Promise<{ ok: true; data: RemnawaveUser } | { ok: false; error: string }> {
  return request('POST', `/api/users/${uuid}/actions/revoke`, { revokeOnlyPasswords });
}

/* ─── Internal Squads ─── */

export interface RemnawaveInternalSquadInbound {
  uuid: string;
  tag: string;
  type: string;
}

export interface RemnawaveInternalSquad {
  uuid: string;
  squadName: string;
  membersCount: number;
  inboundsCount: number;
  inbounds: RemnawaveInternalSquadInbound[];
}

/** Raw shape returned by Remnawave API after `json.response` unwrap */
interface RawInternalSquadsResponse {
  total: number;
  internalSquads: {
    uuid: string;
    name: string;
    info?: { membersCount: number; inboundsCount: number };
    inbounds?: RemnawaveInternalSquadInbound[];
  }[];
}

/** Fetch all internal squads from Remnawave panel. */
export async function getInternalSquads(): Promise<
  { ok: true; data: RemnawaveInternalSquad[] } | { ok: false; error: string }
> {
  const result = await request<RawInternalSquadsResponse>('GET', '/api/internal-squads');
  if (!result.ok) return result;

  const squads = (result.data.internalSquads ?? []).map((s) => ({
    uuid: s.uuid,
    squadName: s.name,
    membersCount: s.info?.membersCount ?? 0,
    inboundsCount: s.info?.inboundsCount ?? 0,
    inbounds: s.inbounds ?? [],
  }));

  return { ok: true, data: squads };
}

/** Assign users to internal squad(s) via bulk update. */
export async function addUsersToSquad(
  squadUuid: string,
  userUuids: string[],
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  return request('POST', '/api/users/bulk/update-squads', {
    uuids: userUuids,
    activeInternalSquads: [squadUuid],
  });
}

/* ─── Nodes ─── */

export interface RemnawaveNode {
  uuid: string;
  name: string;
  address: string;
  port: number | null;
  isConnected: boolean;
  isDisabled: boolean;
  isConnecting: boolean;
  countryCode: string;
  viewPosition: number;
  trafficLimitBytes: number | null;
  trafficUsedBytes: number | null;
  lastStatusChange: string | null;
  lastStatusMessage: string | null;
}

/** Parsed node for the client — public-safe fields only. */
export interface ServerNode {
  id: string;
  label: string;
  countryCode: string;
  isOnline: boolean;
}

/** In-memory cache for parsed nodes. */
let nodesCache: { nodes: ServerNode[]; cachedAt: number } | null = null;
const NODES_CACHE_TTL = 5 * 60_000; // 5 min

/** Invalidate the nodes cache (e.g. after admin action). */
export function invalidateNodesCache() {
  nodesCache = null;
}

/**
 * Fetch all nodes from Remnawave panel, parse into country-labeled list.
 * Caches result for 5 minutes to avoid spamming the panel.
 * Nodes are labeled as: NL-1, NL-2, RU-1 (country code + sequence number).
 */
export async function getServerNodes(): Promise<
  { ok: true; data: ServerNode[] } | { ok: false; error: string }
> {
  if (nodesCache && Date.now() - nodesCache.cachedAt < NODES_CACHE_TTL) {
    return { ok: true, data: nodesCache.nodes };
  }

  const result = await request<RemnawaveNode[]>('GET', '/api/nodes');
  if (!result.ok) return result;

  const rawNodes = result.data;

  /** Sort by viewPosition for deterministic ordering. */
  const sorted = [...rawNodes]
    .filter((n) => !n.isDisabled)
    .sort((a, b) => a.viewPosition - b.viewPosition);

  /** Count per country to build labels like NL-1, NL-2. */
  const countryCount = new Map<string, number>();
  const countryTotals = new Map<string, number>();

  for (const node of sorted) {
    const cc = (node.countryCode || 'XX').toUpperCase();
    countryTotals.set(cc, (countryTotals.get(cc) ?? 0) + 1);
  }

  const nodes: ServerNode[] = sorted.map((node) => {
    const cc = (node.countryCode || 'XX').toUpperCase();
    const idx = (countryCount.get(cc) ?? 0) + 1;
    countryCount.set(cc, idx);

    const total = countryTotals.get(cc) ?? 1;
    const label = total > 1 ? `${cc}-${idx}` : cc;

    return {
      id: node.uuid,
      label,
      countryCode: cc,
      isOnline: node.isConnected,
    };
  });

  nodesCache = { nodes, cachedAt: Date.now() };
  return { ok: true, data: nodes };
}
