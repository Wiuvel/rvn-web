/**
 * A custom server for Next.js with WebSocket support;
 * Runs a Next.js application and a WebSocket server on the same port.
 */

const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* Dynamic logger import with TypeScript support in dev mode */
let logger;
const dev = process.env.NODE_ENV !== 'production';

if (dev) {
  logger = {
    error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
    warn: (msg, ctx) => {
      if (msg.startsWith('Redis:')) {
        const status = ctx?.status || 'unknown';
        const icon = status === 'connected' ? '✓' : status === 'disconnected' ? '✗' : '⚠';
        console.log(`  ${icon} ${msg}`, ctx || '');
      } else {
        console.warn(`[WARN] ${msg}`, ctx || '');
      }
    },
    info: (msg, ctx) => {
      if (msg === 'Server: Ready.') {
        const network = ctx?.network;
        console.log('\n  ✓ Server started. Access the application at:');
        console.log(`  Local:   ${ctx?.local || 'N/A'}`);
        if (network && network !== ctx?.local) {
          console.log(`  Network: ${network}`);
        }
      } else if (msg.startsWith('Redis:')) {
        const status = ctx?.status || 'unknown';
        const icon = status === 'connected' ? '✓' : '⚠';
        console.log(`  ${icon} ${msg}`, ctx || '');
      } else {
        console.log(`[INFO] ${msg}`, ctx || '');
      }
    },
    debug: (msg, ctx) => console.log(`[DEBUG] ${msg}`, ctx || ''),
  };
} else {
  const possiblePaths = [
    './lib/utils/secure-logger',
    './.next/standalone/lib/utils/secure-logger',
    path.join(process.cwd(), 'lib/utils/secure-logger'),
    path.join(process.cwd(), '.next/standalone/lib/utils/secure-logger'),
  ];

  let loaded = false;
  for (const modulePath of possiblePaths) {
    try {
      const jsPath = modulePath.endsWith('.js') ? modulePath : modulePath + '.js';
      if (fs.existsSync(jsPath) || fs.existsSync(modulePath + '.mjs')) {
        logger = require(modulePath).logger;
        loaded = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!loaded) {
    /* Fallback Logger */
    logger = {
      error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
      warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx || ''),
      info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx || ''),
      debug: (msg, ctx) => console.log(`[DEBUG] ${msg}`, ctx || ''),
    };
  }
}

const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

let app, handle;

/* In Production Standalone, we don't use next({ dev: false }), bypassing webpack */
if (!dev) {
  const path = require('path');
  const fs = require('fs');
  const standaloneServerPath = path.join(process.cwd(), '.next/standalone/server.js');
  const standaloneNextPath = path.join(process.cwd(), '.next/standalone/.next');
  const standaloneDir = path.join(process.cwd(), '.next/standalone');

  /* Checking if the standalone directory exists */
  if (fs.existsSync(standaloneDir)) {
    /* Standalone build found - not logging */

    if (fs.existsSync(standaloneServerPath)) {
      try {
        delete require.cache[require.resolve(standaloneServerPath)];
        const standaloneServer = require(standaloneServerPath);

        if (standaloneServer && typeof standaloneServer.getRequestHandler === 'function') {
          handle = standaloneServer.getRequestHandler();
          app = { prepare: () => Promise.resolve() };
          /* We use a standalone handler - no logging */
        } else {
          throw new Error('Standalone server does not have getRequestHandler');
        }
      } catch (err) {
        /**
         * Standalone error - trying fallback;
         * Fallback to using Next.js from node_modules.
         */
        throw err;
      }
    } else if (fs.existsSync(standaloneNextPath)) {
      /**
       * A standalone build was found, but there is no ready-made server.js;
       * Using Next.js from standalone node_modules with the correct configuration.
       */
      const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
        ? path.join(process.cwd(), 'node_modules/next')
        : 'next';

      try {
        const next = require(nextPath);
        /* In standalone mode, Next.js should automatically detect the mode and not load webpack if it is not needed */
        app = next({
          dev: false,
          hostname,
          port,
          dir: process.cwd(),
        });
        handle = app.getRequestHandler();
        /* We use Next.js from standalone - no logging */
      } catch (err) {
        /* Critical initialization error */
        throw err;
      }
    } else {
      /**
       * Standalone directory found, but unexpected structure;
       * Unexpected structure - using fallback;
       * Fallback: using Next.js from node_modules.
       */
      const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
        ? path.join(process.cwd(), 'node_modules/next')
        : 'next';

      try {
        const next = require(nextPath);
        app = next({
          dev: false,
          hostname,
          port,
          dir: process.cwd(),
        });
        handle = app.getRequestHandler();
        /* We use fallback - no logging */
      } catch (err) {
        /* Critical initialization error */
        throw err;
      }
    }
  } else {
    /**
     * Standalone build not found - using fallback;
     * Standalone not found - using fallback.
     */
    const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
      ? path.join(process.cwd(), 'node_modules/next')
      : 'next';

    try {
      const next = require(nextPath);
      app = next({
        dev: false,
        hostname,
        port,
        dir: process.cwd(),
      });
      handle = app.getRequestHandler();
      /* We use fallback - no logging */
    } catch (err) {
      console.error('❌ Failed to initialize Next.js:', err.message);
      throw new Error('Cannot initialize Next.js server: ' + err.message);
    }
  }
} else {
  /* In dev mode, we use the usual Nex */
  const next = require('next');
  app = next({ dev: true, hostname, port });
  handle = app.getRequestHandler();
}

/* Initializing the server */
const initPromise = app && typeof app.prepare === 'function' ? app.prepare() : Promise.resolve();

initPromise.then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);
    /* WebSocket upgrade for /api/socket handles Socket.IO - do not expose to Next.js */
    if (req.headers.upgrade === 'websocket' && parsedUrl.pathname?.startsWith('/api/socket')) {
      return;
    }
    try {
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error handling request', {
        url: req.url,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  /* Store the HTTP server in a global variable for access from the routes API */
  global.__httpServer = httpServer;

  /* Initializing the WebSocket server */
  const initWebSocket = async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const cwd = process.cwd();

      /* List of possible paths to search for a module (production) */
      const possiblePaths = [
        /* Standalone mode (production Docker) - files are copied to the root */
        path.join(cwd, 'lib/websocket/server.js'),
        /* Production build - compiled files */
        path.join(cwd, '.next/server/chunks/lib/websocket/server.js'),
        path.join(cwd, '.next/server/app/lib/websocket/server.js'),
        path.join(cwd, '.next/server/lib/websocket/server.js'),
        /* Relative paths */
        './lib/websocket/server.js',
        './.next/server/chunks/lib/websocket/server.js',
      ];

      /* In production, we try to load directly */
      if (!dev) {
        for (const modulePath of possiblePaths) {
          try {
            if (fs.existsSync(modulePath)) {
              delete require.cache[require.resolve(modulePath)];
              const websocketModule = require(modulePath);
              if (websocketModule && websocketModule.initWebSocketServer) {
                websocketModule.initWebSocketServer(httpServer);
                logger.info('WebSocket: Initialized (direct module)');
                return true;
              }
            }
          } catch (e) {
            continue;
          }
        }

        /* If you can't download it directly, try using the API route */
        try {
          const http = require('http');
          const initUrl = `http://localhost:${port}/api/websocket/init`;

          return new Promise((resolve) => {
            const req = http.get(initUrl, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                try {
                  const result = JSON.parse(data);
                  if (result.initialized) {
                    logger.info('WebSocket: Initialized (via /api/websocket/init)');
                    resolve(true);
                  } else {
                    logger.warn('WebSocket: /api/websocket/init returned not initialized');
                    resolve(false);
                  }
                } catch (e) {
                  resolve(false);
                }
              });
            });

            req.on('error', (err) => {
              logger.warn('WebSocket: /api/websocket/init request failed', {
                error: err instanceof Error ? err.message : 'Unknown',
              });
              resolve(false);
            });

            req.setTimeout(5000, () => {
              req.destroy();
              logger.warn('WebSocket: /api/websocket/init timed out');
              resolve(false);
            });
          });
        } catch (err) {
          return false;
        }
      }

      /* In dev mode, we use the API route for initialization */
      if (dev) {
        try {
          /* We make an HTTP request to the API route to initialize */
          const http = require('http');
          const initUrl = `http://localhost:${port}/api/websocket/init`;

          return new Promise((resolve) => {
            const req = http.get(initUrl, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                try {
                  const result = JSON.parse(data);
                  if (result.initialized) {
                    logger.info('WebSocket: Initialized (via /api/websocket/init)');
                    resolve(true);
                  } else {
                    logger.warn('WebSocket: /api/websocket/init returned not initialized');
                    resolve(false);
                  }
                } catch (e) {
                  resolve(false);
                }
              });
            });

            req.on('error', (err) => {
              logger.warn('WebSocket: /api/websocket/init request failed', {
                error: err instanceof Error ? err.message : 'Unknown',
              });
              resolve(false);
            });

            req.setTimeout(5000, () => {
              req.destroy();
              logger.warn('WebSocket: /api/websocket/init timed out');
              resolve(false);
            });
          });
        } catch (err) {
          return false;
        }
      }

      return false;
    } catch (err) {
      return false;
    }
  };

  httpServer
    .once('error', (err) => {
      logger.error('Server error', { error: err instanceof Error ? err.message : 'Unknown error' });
      process.exit(1);
    })
    .listen(port, hostname, () => {
      const protocol = 'http';
      const localUrl = `${protocol}://localhost:${port}`;

      /* We get all network interfaces to display available IPs */
      const networkInterfaces = os.networkInterfaces();
      const addresses = [];
      const seenAddresses = new Set();

      /* Interface priority (we prefer Ethernet and Wi-Fi) */
      const interfacePriority = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet'];

      /* First, we collect all addresses with priorities */
      const allAddresses = [];
      Object.keys(networkInterfaces).forEach((interfaceName) => {
        const interfaces = networkInterfaces[interfaceName];
        if (interfaces) {
          interfaces.forEach((iface) => {
            /* We show only IPv4 addresses, excluding internal ones */
            if (iface.family === 'IPv4' && !iface.internal) {
              /*  Check if the interface name contains a priority value */
              const priority = interfacePriority.findIndex((p) => interfaceName.includes(p));
              allAddresses.push({
                address: `${protocol}://${iface.address}:${port}`,
                interface: interfaceName,
                priority: priority >= 0 ? priority : 999,
              });
            }
          });
        }
      });

      /* Sort by priority and remove duplicates */
      allAddresses.sort((a, b) => a.priority - b.priority);
      allAddresses.forEach((item) => {
        if (!seenAddresses.has(item.address)) {
          addresses.push(item.address);
          seenAddresses.add(item.address);
        }
      });

      /* We show only the first (highest priority) address */
      const primaryAddress = addresses.length > 0 ? addresses[0] : localUrl;

      logger.info('Server: Ready.', {
        local: localUrl,
        network: primaryAddress,
        port,
        hostname,
      });

      /* Checking the connection to Redis */
      const checkRedis = async () => {
        let redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
          logger.warn('Redis: REDIS_URL not set');
          return;
        }

        /**
         * Correct the URL if the password contains special characters (for example +);
         * Format: redis://:password@host:port.
         */
        try {
          const passwordMatch = redisUrl.match(/redis:\/\/:([^@]+)@/);
          if (passwordMatch && passwordMatch[1]) {
            const password = passwordMatch[1];
            /* Если пароль содержит + и не закодирован (нет %) */
            if (password.includes('+') && !password.includes('%')) {
              const encodedPassword = encodeURIComponent(password);
              redisUrl = redisUrl.replace(`:${password}@`, `:${encodedPassword}@`);
            }
          }
        } catch (e) {
          /* Ignoring URL parsing errors */
        }

        /* Masking the password in logs */
        const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':****@');

        try {
          /**
           * We use an existing Redis module that is properly configured;
           * This module is already included in the standalone build via outputFileTracingIncludes.
           */
          let redisModule;
          let moduleError = null;
          const redisPaths = [
            './lib/database/redis',
            './.next/standalone/lib/database/redis',
            path.join(process.cwd(), 'lib/database/redis'),
            path.join(process.cwd(), '.next/standalone/lib/database/redis'),
          ];

          for (const modulePath of redisPaths) {
            try {
              const jsPath = modulePath.endsWith('.js') ? modulePath : modulePath + '.js';
              const exists = fs.existsSync(jsPath) || fs.existsSync(modulePath + '.mjs');

              if (exists) {
                try {
                  redisModule = require(modulePath);
                  if (redisModule && redisModule.getRedisClient) {
                    break;
                  }
                } catch (requireError) {
                  moduleError = requireError;
                  /* Let's continue the search */
                  continue;
                }
              }
            } catch (e) {
              moduleError = e;
              continue;
            }
          }

          if (!redisModule || !redisModule.getRedisClient) {
            /* Let's try loading ioredis directly as a fallback */
            try {
              const Redis = require('ioredis');
              /* If ioredis is available, create the client directly */
              const testClient = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                connectTimeout: 5000,
                lazyConnect: false,
                enableReadyCheck: true,
                showFriendlyErrorStack: true,
              });

              /* We use a direct client for verification */
              const pingResult = await Promise.race([
                testClient.ping(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Ping timeout')), 3000),
                ),
              ]);

              if (pingResult === 'PONG') {
                try {
                  await testClient.set('server:health:check', 'ok', 'EX', 10);
                  const testValue = await testClient.get('server:health:check');

                  if (testValue === 'ok') {
                    logger.info(`Redis: Connected (direct ioredis, ${maskedUrl})`, {
                      status: 'connected',
                    });
                  }
                } catch (opError) {
                  logger.warn('Redis: Connected but operations failed', {
                    status: 'connected',
                    ping: 'ok',
                    operations: 'error',
                    error: opError instanceof Error ? opError.message : 'Unknown',
                    url: maskedUrl,
                  });
                }
              }

              try {
                await testClient.quit();
              } catch {
                /* Ignoring errors when closing */
              }
              return;
            } catch (ioredisError) {
              logger.warn('Redis: Module not found', {
                status: 'error',
                message: 'Redis module (lib/database/redis) not found and ioredis not available.',
                moduleError: moduleError instanceof Error ? moduleError.message : 'Unknown',
                ioredisError: ioredisError instanceof Error ? ioredisError.message : 'Unknown',
                searchedPaths: redisPaths,
                url: maskedUrl,
              });
              return;
            }
          }

          /* Using an existing module */
          const testClient = redisModule.getRedisClient();

          if (!testClient) {
            logger.warn('Redis: Client not initialized', {
              status: 'not_initialized',
              message: 'Redis client returned null. Check REDIS_URL environment variable.',
              url: maskedUrl,
            });
            return;
          }

          /* Checking the connection with a timeout */
          const pingResult = await Promise.race([
            testClient.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 3000)),
          ]);

          if (pingResult === 'PONG') {
            /* Additional SET/GET check */
            try {
              await testClient.set('server:health:check', 'ok', 'EX', 10);
              const testValue = await testClient.get('server:health:check');

              if (testValue === 'ok') {
                logger.info(`Redis: Connected (${maskedUrl})`, { status: 'connected' });
              } else {
                logger.warn('Redis: Connected but operations failed', {
                  status: 'connected',
                  ping: 'ok',
                  operations: 'failed',
                  url: maskedUrl,
                });
              }
            } catch (opError) {
              logger.warn('Redis: Connected but operations failed', {
                status: 'connected',
                ping: 'ok',
                operations: 'error',
                error: opError instanceof Error ? opError.message : 'Unknown',
                url: maskedUrl,
              });
            }
          } else {
            logger.warn('Redis: Unexpected ping response', {
              status: 'connected',
              ping: pingResult,
              url: maskedUrl,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (errorMessage.includes('Timeout') || errorMessage.includes('Ping timeout')) {
            logger.warn('Redis: Connection timeout', {
              status: 'timeout',
              message: 'Redis server did not respond in time',
              url: maskedUrl,
            });
          } else if (errorMessage.includes('ECONNREFUSED')) {
            logger.warn('Redis: Connection refused', {
              status: 'disconnected',
              message:
                'Cannot connect to Redis server. Check if Redis is running and REDIS_URL is correct.',
              url: maskedUrl,
            });
          } else if (errorMessage.includes('ENOTFOUND')) {
            logger.warn('Redis: Host not found', {
              status: 'disconnected',
              message: `Redis host not found. Check REDIS_URL: ${maskedUrl}`,
            });
          } else if (errorMessage.includes('Cannot find module')) {
            logger.warn('Redis: ioredis module not found', {
              status: 'error',
              message: 'ioredis package is not installed. Run: npm install ioredis',
              url: maskedUrl,
            });
          } else {
            logger.warn('Redis: Connection check failed', {
              status: 'error',
              message: errorMessage,
              url: maskedUrl,
            });
          }
        }
      };

      setTimeout(() => {
        checkRedis();
      }, 500);

      if (dev) {
        initWebSocket().catch(() => {});
      } else {
        const initialized = initWebSocket();
        if (!initialized) {
          setTimeout(() => initWebSocket(), 1000);
        }
      }
    });
});
