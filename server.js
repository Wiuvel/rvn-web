/**
 * Кастомный сервер для Next.js с поддержкой WebSocket
 * Запускает Next.js приложение и WebSocket сервер на одном порту
 */

const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Динамический импорт logger с поддержкой TypeScript в dev режиме
let logger;
const dev = process.env.NODE_ENV !== 'production';

if (dev) {
  // В dev режиме используем простой logger, так как TypeScript файлы не компилируются для require()
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
    debug: (msg, ctx) => console.log(`[DEBUG] ${msg}`, ctx || '')
  };
} else {
  // В production пробуем разные пути
  const possiblePaths = [
    './lib/utils/secure-logger',
    './.next/standalone/lib/utils/secure-logger',
    path.join(process.cwd(), 'lib/utils/secure-logger'),
    path.join(process.cwd(), '.next/standalone/lib/utils/secure-logger')
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
    // Fallback logger
    logger = {
      error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
      warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx || ''),
      info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx || ''),
      debug: (msg, ctx) => console.log(`[DEBUG] ${msg}`, ctx || '')
    };
  }
}

const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

let app, handle;

// В production standalone режиме не используем next({ dev: false }), так как это требует webpack
if (!dev) {

  const path = require('path');
  const fs = require('fs');
  const standaloneServerPath = path.join(process.cwd(), '.next/standalone/server.js');
  const standaloneNextPath = path.join(process.cwd(), '.next/standalone/.next');
  const standaloneDir = path.join(process.cwd(), '.next/standalone');
  
  // Проверяем, существует ли standalone директория
  if (fs.existsSync(standaloneDir)) {
    // Standalone build найден - не логируем
    
    if (fs.existsSync(standaloneServerPath)) {
      // Используем готовый сервер из standalone
      try {
        delete require.cache[require.resolve(standaloneServerPath)];
        const standaloneServer = require(standaloneServerPath);
        
        if (standaloneServer && typeof standaloneServer.getRequestHandler === 'function') {
          handle = standaloneServer.getRequestHandler();
          app = { prepare: () => Promise.resolve() };
          // Используем standalone handler - не логируем
        } else {
          throw new Error('Standalone server does not have getRequestHandler');
        }
      } catch (err) {
        // Ошибка standalone - пробуем fallback
        // Fallback к использованию Next.js из node_modules
        throw err;
      }
    } else if (fs.existsSync(standaloneNextPath)) {
      // Standalone сборка найдена, но нет готового server.js
      // Используем Next.js из standalone node_modules с правильной конфигурацией
      const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
        ? path.join(process.cwd(), 'node_modules/next')
        : 'next';
      
      try {
        const next = require(nextPath);
        // В standalone режиме Next.js должен автоматически определять режим
        // и не загружать webpack, если он не нужен
        app = next({ 
          dev: false,
          hostname,
          port,
          dir: process.cwd()
        });
        handle = app.getRequestHandler();
        // Используем Next.js из standalone - не логируем
      } catch (err) {
        // Критическая ошибка инициализации
        throw err;
      }
    } else {
      // Standalone директория найдена, но структура неожиданная
      // Неожиданная структура - используем fallback
      // Fallback: используем Next.js из node_modules
      const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
        ? path.join(process.cwd(), 'node_modules/next')
        : 'next';
      
      try {
        const next = require(nextPath);
        app = next({ 
          dev: false,
          hostname,
          port,
          dir: process.cwd()
        });
        handle = app.getRequestHandler();
        // Используем fallback - не логируем
      } catch (err) {
        // Критическая ошибка инициализации
        throw err;
      }
    }
  } else {
    // Standalone сборка не найдена - используем fallback
    // Standalone не найден - используем fallback
    const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
      ? path.join(process.cwd(), 'node_modules/next')
      : 'next';
    
    try {
      const next = require(nextPath);
      app = next({ 
        dev: false,
        hostname,
        port,
        dir: process.cwd()
      });
      handle = app.getRequestHandler();
      // Используем fallback - не логируем
    } catch (err) {
      console.error('❌ Failed to initialize Next.js:', err.message);
      throw new Error('Cannot initialize Next.js server: ' + err.message);
    }
  }
} else {
  // В dev режиме используем обычный next
  const next = require('next');
  app = next({ dev: true, hostname, port });
  handle = app.getRequestHandler();
}

// Инициализируем сервер
const initPromise = app && typeof app.prepare === 'function' 
  ? app.prepare() 
  : Promise.resolve();

initPromise.then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error handling request', { url: req.url, error: err instanceof Error ? err.message : 'Unknown error' });
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Сохраняем HTTP сервер в глобальной переменной для доступа из API routes
  global.__httpServer = httpServer;

  // Инициализируем WebSocket сервер
  const initWebSocket = async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const cwd = process.cwd();
      
      // Список возможных путей для поиска модуля (production)
      const possiblePaths = [
        // Standalone режим (production Docker) - файлы копируются в корень
        path.join(cwd, 'lib/websocket/server.js'),
        // Production build - скомпилированные файлы
        path.join(cwd, '.next/server/chunks/lib/websocket/server.js'),
        path.join(cwd, '.next/server/app/lib/websocket/server.js'),
        path.join(cwd, '.next/server/lib/websocket/server.js'),
        // Относительные пути
        './lib/websocket/server.js',
        './.next/server/chunks/lib/websocket/server.js',
      ];

      // В production пробуем загрузить напрямую
      if (!dev) {
        for (const modulePath of possiblePaths) {
          try {
            if (fs.existsSync(modulePath)) {
              delete require.cache[require.resolve(modulePath)];
              const websocketModule = require(modulePath);
              if (websocketModule && websocketModule.initWebSocketServer) {
                websocketModule.initWebSocketServer(httpServer);
                return true;
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        // Если не удалось загрузить напрямую, пробуем через API route
        try {
          const http = require('http');
          const initUrl = `http://localhost:${port}/api/websocket/init`;
          
          return new Promise((resolve) => {
            const req = http.get(initUrl, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  const result = JSON.parse(data);
                  if (result.initialized) {
                    resolve(true);
                  } else {
                    resolve(false);
                  }
                } catch (e) {
                  resolve(false);
                }
              });
            });
            
            req.on('error', () => {
              resolve(false);
            });
            
            req.setTimeout(5000, () => {
              req.destroy();
              resolve(false);
            });
          });
        } catch (err) {
          return false;
        }
      }

      // В dev режиме используем API route для инициализации
      if (dev) {
        try {
          // Делаем HTTP запрос к API route для инициализации
          const http = require('http');
          const initUrl = `http://localhost:${port}/api/websocket/init`;
          
          return new Promise((resolve) => {
            const req = http.get(initUrl, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  const result = JSON.parse(data);
                  if (result.initialized) {
                    resolve(true);
                  } else {
                    resolve(false);
                  }
                } catch (e) {
                  resolve(false);
                }
              });
            });
            
            req.on('error', () => {
              resolve(false);
            });
            
            req.setTimeout(5000, () => {
              req.destroy();
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
      
      // Получаем все сетевые интерфейсы для отображения доступных IP
      const networkInterfaces = os.networkInterfaces();
      const addresses = [];
      const seenAddresses = new Set();
      
      // Приоритет интерфейсов (предпочитаем Ethernet и Wi-Fi)
      const interfacePriority = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet'];
      
      // Сначала собираем все адреса с приоритетами
      const allAddresses = [];
      Object.keys(networkInterfaces).forEach((interfaceName) => {
        const interfaces = networkInterfaces[interfaceName];
        if (interfaces) {
          interfaces.forEach((iface) => {
            // Показываем только IPv4 адреса, исключая внутренние
            if (iface.family === 'IPv4' && !iface.internal) {
              // Проверяем, содержит ли имя интерфейса приоритетное значение
              const priority = interfacePriority.findIndex(p => interfaceName.includes(p));
              allAddresses.push({
                address: `${protocol}://${iface.address}:${port}`,
                interface: interfaceName,
                priority: priority >= 0 ? priority : 999
              });
            }
          });
        }
      });
      
      // Сортируем по приоритету и убираем дубликаты
      allAddresses.sort((a, b) => a.priority - b.priority);
      allAddresses.forEach((item) => {
        if (!seenAddresses.has(item.address)) {
          addresses.push(item.address);
          seenAddresses.add(item.address);
        }
      });
      
      // Показываем только первый (наиболее приоритетный) адрес
      const primaryAddress = addresses.length > 0 ? addresses[0] : localUrl;
      
      logger.info('Server: Ready.', { 
        local: localUrl,
        network: primaryAddress,
        port,
        hostname
      });
      
      // Проверка подключения к Redis
      const checkRedis = async () => {
        try {
          // Пробуем загрузить модуль Redis
          let redisModule;
          const redisPaths = [
            './lib/database/redis',
            './.next/standalone/lib/database/redis',
            path.join(process.cwd(), 'lib/database/redis'),
            path.join(process.cwd(), '.next/standalone/lib/database/redis')
          ];
          
          for (const modulePath of redisPaths) {
            try {
              const jsPath = modulePath.endsWith('.js') ? modulePath : modulePath + '.js';
              if (fs.existsSync(jsPath) || fs.existsSync(modulePath + '.mjs')) {
                redisModule = require(modulePath);
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          if (!redisModule || !redisModule.getRedisClient) {
            logger.warn('Redis: Module not found or getRedisClient not available');
            return;
          }
          
          const client = redisModule.getRedisClient();
          
          if (!client) {
            logger.warn('Redis: Client not initialized. REDIS_URL may not be set.');
            return;
          }
          
          // Проверяем подключение
          const pingResult = await Promise.race([
            client.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
          
          if (pingResult === 'PONG') {
            // Дополнительная проверка SET/GET
            await client.set('server:health:check', 'ok', 'EX', 10);
            const testValue = await client.get('server:health:check');
            
            if (testValue === 'ok') {
              logger.info('Redis: Connected and operational', {
                status: 'connected',
                ping: 'ok',
                operations: 'ok'
              });
            } else {
              logger.warn('Redis: Connected but operations failed', {
                status: 'connected',
                ping: 'ok',
                operations: 'failed'
              });
            }
          } else {
            logger.warn('Redis: Unexpected ping response', {
              status: 'connected',
              ping: pingResult
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('Timeout')) {
            logger.warn('Redis: Connection timeout (5s)', {
              status: 'timeout',
              message: 'Redis server did not respond in time'
            });
          } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            logger.warn('Redis: Connection refused or host not found', {
              status: 'disconnected',
              message: errorMessage
            });
          } else {
            logger.warn('Redis: Connection check failed', {
              status: 'error',
              message: errorMessage
            });
          }
        }
      };
      
      // Выполняем проверку Redis после небольшой задержки
      setTimeout(() => {
        checkRedis();
      }, 500);
      
      if (dev) {
        setTimeout(async () => {
          await initWebSocket();
        }, 1000);
      } else {
        const initialized = initWebSocket();
        if (!initialized) {
          setTimeout(() => initWebSocket(), 1000);
        }
      }
    });
});
