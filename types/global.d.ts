/**
 * Глобальные типы для проекта
 */

import type { Server as HTTPServer } from 'http';

declare global {
  // HTTP сервер для инициализации WebSocket сервера
  // eslint-disable-next-line no-var
  var __httpServer: HTTPServer | undefined;
}

export {};


