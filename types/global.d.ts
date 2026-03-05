/**
 * Global types for project
 */

import type { Server as HTTPServer } from 'http';

declare global {
  // HTTP server for initialization WebSocket server
  var __httpServer: HTTPServer | undefined;
}

export {};
