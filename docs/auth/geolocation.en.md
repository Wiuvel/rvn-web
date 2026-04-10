# Device IP Geolocation

> **[Русская версия](geolocation.md)**

## Overview

The `lib/utils/geolocation.ts` module resolves user location by IP address during device registration/update. The result is stored in `user_devices.location` as a Russian-language string (e.g. `"Moscow, Russia"`).

Location is purely informational, displayed in profile settings. Not used for security.

## Architecture

```
registerDevice() / createSession()
  └→ resolveAndStoreLocation(deviceId, ip)  [fire-and-forget]
       └→ lookupIP(ip)
            ├─ 1. Private IP? → null
            ├─ 2. Cache (Map, 10K entries, TTL 24h) → hit? → return
            ├─ 3. MaxMind GeoLite2-City.mmdb → found? → return
            └─ 4. ip-api.com/json/{ip}?lang=ru → return
```

## Data Sources

### MaxMind GeoLite2 (primary)

- Local .mmdb database, ~70MB
- Lazy-loaded on first request (or eagerly via startup check)
- Built-in localization: `result.city.names.ru`, `result.country.names.ru`
- Falls back to `.names.en` when Russian translation is unavailable

**Production (Docker)**: downloaded at build time from [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) — a mirror updated daily via CI.

**Dev**: .mmdb is absent, module automatically switches to the fallback.

### ip-api.com (fallback)

- Free HTTP API, no key required
- Rate limit: 45 req/min (we throttle to 40 req/min via 1.5s interval)
- Timeout: 3 seconds
- `?lang=ru` — Russian localization
- Used in dev mode and as a fallback when MaxMind fails

## Storage Format

Stored in `user_devices.location` (TEXT) as a ready-to-display Russian string:

| Example | When |
|---------|------|
| `Москва, Россия` | Both city and country resolved |
| `Россия` | Country only |
| `NULL` | Private IP / lookup failed |

### Why plain text instead of codes

- UI displays as-is with no additional requests
- No need for multilingual support (project UI is in Russian)
- No lookup tables, mappings, or client-side dependencies
- Easy to migrate later: add a `country_code` column and backfill

## Caching

In-memory `Map<ip, {value, expiresAt}>`:
- Max 10,000 entries (FIFO eviction)
- TTL: 24 hours
- Both positive and negative results (`null`) are cached

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAXMIND_DB_PATH` | `./data/GeoLite2-City.mmdb` | Path to .mmdb file |

## Startup Check

In `instrumentation.ts` on server start:
```
[startup] GeoIP: MaxMind ready (./data/GeoLite2-City.mmdb)
[startup] GeoIP: ip-api.com fallback (no .mmdb found)
```

## Call Sites

`session-manager.ts` — 4 locations:

1. `registerDevice()` — update existing device by fpid match
2. `registerDevice()` — insert new device with fpid
3. `registerDevice()` — insert/update device without fpid (by deviceName + IP)
4. `createSession()` — fire-and-forget during lastActive update

All calls via `resolveAndStoreLocation()` — fire-and-forget, never blocking the main flow, never throwing exceptions.
