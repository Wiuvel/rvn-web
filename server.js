/**
 * Кастомный сервер для Next.js с поддержкой WebSocket
 * Запускает Next.js приложение и WebSocket сервер на одном порту
 */

const { createServer } = require('http');
const { parse } = require('url');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

let app, handle;

// В production standalone режиме не используем next({ dev: false }), так как это требует webpack
if (!dev) {
  // В standalone режиме Next.js создает готовую сборку в .next/standalone
  // которая не требует webpack. Но нам нужен кастомный сервер для WebSocket.
  // 
  // Проблема: next({ dev: false }) требует webpack, которого нет в standalone
  // 
  // Решение: используем готовый сервер из standalone или загружаем handler напрямую
  // В Next.js 15 standalone режиме можно использовать готовый сервер из .next/standalone/server.js
  // или загрузить handler из .next/standalone/.next/server
  
  const path = require('path');
  const fs = require('fs');
  
  // Пытаемся использовать готовый сервер из standalone
  const standaloneServerPath = path.join(process.cwd(), '.next/standalone/server.js');
  const standaloneNextPath = path.join(process.cwd(), '.next/standalone/.next');
  
  if (fs.existsSync(standaloneServerPath)) {
    // Используем готовый сервер из standalone
    try {
      delete require.cache[require.resolve(standaloneServerPath)];
      const standaloneServer = require(standaloneServerPath);
      
      if (standaloneServer && typeof standaloneServer.getRequestHandler === 'function') {
        handle = standaloneServer.getRequestHandler();
        app = { prepare: () => Promise.resolve() };
        console.log('✓ Using standalone server handler');
      } else {
        throw new Error('Standalone server does not have getRequestHandler');
      }
    } catch (err) {
      console.warn('⚠ Failed to use standalone server:', err.message);
      throw new Error('Cannot use standalone server: ' + err.message);
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
      console.log('✓ Using Next.js from standalone node_modules');
    } catch (err) {
      console.error('❌ Failed to initialize Next.js:', err.message);
      throw err;
    }
  } else {
    // Standalone сборка не найдена
    throw new Error('Standalone build not found. Make sure you built with output: "standalone"');
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
      console.error('Error occurred handling', req.url, err);
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
                console.log('✓ WebSocket server initialized from:', modulePath);
                return true;
              }
            }
          } catch (e) {
            console.warn('⚠ Failed to load WebSocket module from:', modulePath, e.message);
            continue;
          }
        }
        
        // Если не удалось загрузить напрямую, пробуем через API route
        console.warn('⚠ Could not load WebSocket module directly, trying API route...');
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
                    console.log('✓ WebSocket server initialized via API route (production)');
                    resolve(true);
                  } else {
                    console.warn('⚠ WebSocket server initialization failed via API route:', result.error);
                    resolve(false);
                  }
                } catch (e) {
                  console.warn('⚠ Failed to parse WebSocket init response');
                  resolve(false);
                }
              });
            });
            
            req.on('error', (err) => {
              console.warn('⚠ Failed to call WebSocket init API:', err.message);
              resolve(false);
            });
            
            req.setTimeout(5000, () => {
              req.destroy();
              console.warn('⚠ WebSocket init API timeout');
              resolve(false);
            });
          });
        } catch (err) {
          console.warn('⚠ WebSocket initialization via API route failed:', err.message);
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
                    console.log('✓ WebSocket server initialized via API route');
                    resolve(true);
                  } else {
                    console.warn('⚠ WebSocket server initialization failed via API route:', result.error);
                    resolve(false);
                  }
                } catch (e) {
                  console.warn('⚠ Failed to parse WebSocket init response');
                  resolve(false);
                }
              });
            });
            
            req.on('error', (err) => {
              console.warn('⚠ Failed to call WebSocket init API:', err.message);
              resolve(false);
            });
            
            req.setTimeout(5000, () => {
              req.destroy();
              console.warn('⚠ WebSocket init API timeout');
              resolve(false);
            });
          });
        } catch (err) {
          console.warn('⚠ WebSocket initialization via API route failed:', err.message);
          return false;
        }
      }

      return false;
    } catch (err) {
      console.warn('⚠ WebSocket server initialization failed:', err.message);
      return false;
    }
  };

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      
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
