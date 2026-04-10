# Device Fingerprinting

> **[Русская версия](device-fingerprint.md)**

## Overview

Two-layer device identification system for grouping records in `user_devices`. Prevents duplicates on repeated logins from the same device.

Not used for security — only for UX (device list in profile settings).

## Architecture

```
Login / Register
       ↓
 [Client]
 getOrCreateFpid()  ← IndexedDB
       ↓
 Send to server (tRPC input / cookie for OAuth)
       ↓
 [Server]
 computeDeviceFpHash(ua, ip, fpid)
       ↓
 SELECT ... WHERE userId = ? AND deviceFpHash = ?
       ↓
   ┌───┴───┐
 Found    Not
   ↓       ↓
 UPDATE   INSERT
```

## Layer 1: Client-Side FPID

**File:** `lib/auth/device-fingerprint.client.ts`

### Generation

- Format: `MP_` + 12 random base64 characters (e.g. `MP_x7kL9mN2pQ4r`)
- Source: `crypto.getRandomValues(new Uint8Array(12))`
- Created once, persists in IndexedDB until manually cleared

### Storage

IndexedDB `rvn_device` (v1), two stores:

| Store | Contents | Purpose |
|-------|----------|---------|
| `fpid` | `{ fpid, time, lastSentAt }` | The identifier itself |
| `rb_sync` | `{ hash, lastSentTime }` | Integrity check (hash of `fpid:time`) |

### getOrCreateFpid()

1. Reads FPID from IndexedDB
2. Validates integrity via `rb_sync.hash`
3. If missing or corrupted — regenerates a new FPID
4. Returns `{ fpid, time, lastSentAt }`

### Delivery to Server

**Login/register form** (`components/auth/Form.tsx`):
```
fpid = getOrCreateFpid() → loginMutation({ fpid }) → markFpidSent()
```

**OAuth** (popup → redirect → callback):
```
getOrCreateFpid() → setFpidCookieForOAuth(fpid)
  ↓
cookie "rvn_fpid" (max-age: 5 min)
  ↓
OAuth callback reads cookie → registerDevice(fpid) → deletes cookie
```

Short-lived cookie (5 min) because OAuth redirects lose IndexedDB context.

## Layer 2: Server-Side Hash

**File:** `lib/auth/device-fingerprint.server.ts`

### computeDeviceFpHash(ua, ip, fpid)

Computes SHA256 from normalized components:

**1. User-Agent → `browser:os`**
```
"Mozilla/5.0 (Windows NT 10.0; ...) Chrome/120.0..." → "chrome:windows"
```

Recognized browsers: Chrome, Firefox, Safari, Edge, Opera, Brave, Vivaldi, Yandex.
OS: Windows, Mac, Linux, Android, iOS.

**2. IP → prefix**
```
IPv4: "185.22.174.56"  → "185.22.174"    (first 3 octets)
IPv6: "2001:db8:1::1"  → "2001:db8:1::"  (first 4 segments)
```

Last octet is ignored — same user may change IP within a subnet.

**3. Payload**

| FPID | Payload | Accuracy |
|------|---------|----------|
| Present | `chrome:windows\|185.22.174\|MP_x7kL9m` | High |
| Missing | `chrome:windows\|185.22.174` | Medium |

Result: SHA256 hex (64 chars), stored in `user_devices.device_fp_hash`.

## Grouping in registerDevice()

**File:** `lib/auth/session-manager.ts`

### With FPID (primary path)

1. `deviceFpHash = computeDeviceFpHash(ua, ip, fpid)`
2. `SELECT id FROM user_devices WHERE userId = ? AND deviceFpHash = ?`
3. **Found** → UPDATE (`tokenHash`, `lastActive`, `ipAddress`)
4. **Not found** → INSERT (new device)

### Without FPID (fallback)

When IndexedDB is cleared or unavailable:

1. `SELECT id FROM user_devices WHERE userId = ? AND deviceName = ? AND ipAddress = ?`
2. **Found** → UPDATE (same browser+OS on same IP)
3. **Not found** → INSERT

Less accurate — cannot distinguish two identical browsers on the same IP.

## Deduplication Scenarios

| Scenario | FPID | Match | Result |
|----------|------|-------|--------|
| Same browser, same network | Persistent | `deviceFpHash` | UPDATE |
| Same browser, different network | Persistent | `deviceFpHash` | UPDATE (IP prefix in hash, but FPID same → different hashes → INSERT) |
| IndexedDB cleared | New | No hash match → fallback to `deviceName + IP` | UPDATE or INSERT |
| Private/incognito mode | None | `deviceName + IP` | UPDATE or INSERT |
| Different browser | Different | Different `deviceFpHash` | INSERT (new device) |

> **Note:** When switching networks with a persistent FPID, a new record is created because IP prefix is part of the hash. This is expected — from the server's perspective it could be a different device.

## DB Schema

```sql
user_devices:
  device_fp_hash  TEXT         -- SHA256, nullable, indexed
  -- Index: (user_id, device_fp_hash) WHERE device_fp_hash IS NOT NULL
```

## Security

- FPID is never logged — only the SHA256 hash is stored in DB
- OAuth cookie `rvn_fpid` — max-age 5 minutes, deleted after use
- System is not used for authentication or authorization
- Fingerprint is easily resettable (clear IndexedDB) — this is by design
