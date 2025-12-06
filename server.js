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
  // В standalone режиме Next.js создает готовый сервер
  // Проблема: next({ dev: false }) требует webpack, которого нет в standalone
  // Решение: используем готовый сервер из standalone или создаем свой HTTP сервер
  
  // В standalone режиме Next.js компилирует все в .next/standalone
  // и создает готовый сервер, который не требует webpack
  // Но нам нужен кастомный сервер для WebSocket
  
  // Правильное решение: в standalone режиме не вызываем next() вообще
  // Вместо этого используем готовый сервер из standalone или создаем свой
  // и загружаем handler из standalone сборки
  
  // Но проще всего: проверить, есть ли в standalone готовый сервер
  // и если да, использовать его. Если нет, создать свой HTTP сервер
  
  // В Next.js 15 standalone режиме можно использовать готовый сервер
  // который находится в .next/standalone/server.js
  // Но структура может быть разной
  
  // Временное решение: используем стандартный Next.js, но с правильной конфигурацией
  // В production standalone режиме Next.js должен работать без webpack
  // если правильно настроен
  
  // В standalone режиме Next.js создает готовый сервер в .next/standalone
  // который не требует webpack. Но нам нужен кастомный сервер для WebSocket.
  // Проблема: next({ dev: false }) требует webpack, которого нет в standalone
  // Решение: используем готовый сервер из standalone или создаем свой HTTP сервер
  
  const path = require('path');
  const fs = require('fs');
  
  // В standalone режиме Next.js компилирует все в .next/standalone
  // и создает готовый сервер, который не требует webpack
  // Но нам нужен кастомный сервер для WebSocket
  
  // Правильное решение: используем готовый сервер из standalone
  // который находится в .next/standalone/server.js
  // Но структура может быть разной, поэтому используем универсальный подход
  
  // Проверяем, есть ли Next.js в standalone node_modules (скопированы в корень)
  const nextPath = fs.existsSync(path.join(process.cwd(), 'node_modules/next'))
    ? path.join(process.cwd(), 'node_modules/next')
    : 'next';
  
  try {
    const next = require(nextPath);
    
    // В standalone режиме Next.js должен работать без webpack
    // если правильно настроен. Но next({ dev: false }) все равно требует webpack.
    // Поэтому используем другой подход: указываем, что мы в production
    // и Next.js должен использовать готовую сборку из .next/standalone
    
    // В Next.js 15 standalone режиме можно использовать минимальную конфигурацию
    // которая не требует webpack, если правильно настроена
    app = next({ 
      dev: false,
      hostname,
      port,
      // Указываем, что мы в standalone режиме
      // Это должно предотвратить загрузку webpack
      conf: {
        // Минимальная конфигурация для standalone
        output: 'standalone'
      }
    });
    handle = app.getRequestHandler();
  } catch (err) {
    // Если не удалось инициализировать Next.js, значит проблема в конфигурации
    console.error('❌ Failed to initialize Next.js:', err.message);
    console.error('⚠ Error details:', err.stack);
    console.error('⚠ Make sure node_modules from standalone are copied to root');
    throw err;
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
