/**
 * Global types for project
 */

import type { Server as HTTPServer } from 'http';

declare global {
  // HTTP server for initialization WebSocket server
  // eslint-disable-next-line no-var
  var __httpServer: HTTPServer | undefined;
}

export {};


