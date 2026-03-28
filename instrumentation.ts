/**
 * Startup checks for server-side services.
 * Runs once when the Node.js runtime initializes.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // WASM Image Processor check
    try {
      const { checkWasmReady } = await import('./lib/wasm/image-processor');
      const ok = await checkWasmReady();
      console.log(
        ok
          ? '[startup] WASM image processor: ready'
          : '[startup] WASM image processor: unavailable (fallback to passthrough)',
      );
    } catch {
      console.log('[startup] WASM image processor: failed to load (fallback to passthrough)');
    }

    /* S3 Object Storage check (HeadBucket — lightweight API call to verify connectivity) */
    try {
      const endpoint = process.env.S3_ENDPOINT;
      const accessKey = process.env.S3_ACCESS_KEY;
      const secretKey = process.env.S3_SECRET_KEY;
      const bucket = process.env.S3_BUCKET;

      if (endpoint && accessKey && secretKey && bucket) {
        const { getS3Client } = await import('./lib/storage/s3-client');
        const client = getS3Client();
        if (client) {
          const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
          const start = Date.now();
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
          const ms = Date.now() - start;
          const maskedEndpoint = endpoint.replace(/^(https?:\/\/)(.+)/, (_, proto, rest) => {
            const parts = rest.split('.');
            return parts.length > 2
              ? `${proto}***.${parts.slice(-2).join('.')}`
              : `${proto}${rest}`;
          });
          console.log(
            `[startup] S3 storage: ready (bucket: ${bucket}, endpoint: ${maskedEndpoint}, ping: ${ms}ms)`,
          );
        } else {
          console.log('[startup] S3 storage: client creation failed');
        }
      } else {
        const missing = [
          !endpoint && 'S3_ENDPOINT',
          !accessKey && 'S3_ACCESS_KEY',
          !secretKey && 'S3_SECRET_KEY',
          !bucket && 'S3_BUCKET',
        ].filter(Boolean);
        console.log(`[startup] S3 storage: not configured (missing: ${missing.join(', ')})`);
      }
    } catch (err) {
      console.log(
        `[startup] S3 storage: unavailable (${err instanceof Error ? err.message : 'unknown error'})`,
      );
    }

    /* Redis check */
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        const { getRedisClient } = await import('./lib/database/redis');
        const client = getRedisClient();
        if (client) {
          const start = Date.now();
          const pong = await Promise.race([
            client.ping(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Ping timeout')), 3000),
            ),
          ]);
          const ms = Date.now() - start;
          const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':****@');
          if (pong === 'PONG') {
            console.log(`[startup] Redis: ready (${maskedUrl}, ping: ${ms}ms)`);
          } else {
            console.log(`[startup] Redis: unexpected response (${pong})`);
          }
        } else {
          console.log('[startup] Redis: client creation failed');
        }
      } else {
        console.log('[startup] Redis: not configured (missing REDIS_URL)');
      }
    } catch (err) {
      console.log(
        `[startup] Redis: unavailable (${err instanceof Error ? err.message : 'unknown error'})`,
      );
    }

    /* GeoIP check */
    try {
      const { checkGeoReady } = await import('./lib/utils/geolocation');
      const geo = await checkGeoReady();
      if (geo?.source === 'maxmind') {
        console.log(`[startup] GeoIP: MaxMind ready (${geo.dbPath})`);
      } else {
        console.log('[startup] GeoIP: ip-api.com fallback (no .mmdb found)');
      }
    } catch (err) {
      console.log(
        `[startup] GeoIP: unavailable (${err instanceof Error ? err.message : 'unknown error'})`,
      );
    }

    /* Database check (Drizzle) */
    try {
      const { db } = await import('./lib/database/db');
      const { sql } = await import('drizzle-orm');

      if (db) {
        const start = Date.now();
        await db.execute(sql`SELECT 1`);
        const ms = Date.now() - start;
        console.log(`[startup] Database: ready (ping: ${ms}ms)`);
      } else {
        console.log('[startup] Database: client creation failed');
      }
    } catch (err) {
      console.log(
        `[startup] Database: unavailable (${err instanceof Error ? err.message : 'unknown error'})`,
      );
    }
  }
}
