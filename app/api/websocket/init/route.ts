/**
 * API route для инициализации WebSocket сервера
 * Используется в dev режиме для ленивой инициализации
 */

import { NextResponse } from 'next/server';
import { getWebSocketServer, initWebSocketServer } from '@/lib/websocket/server';
import { logger } from '@/lib/utils/secure-logger';

/**
 * GET - Проверить статус WebSocket сервера и инициализировать при необходимости
 */
export async function GET() {
  try {
    const httpServer = global.__httpServer;
    
    if (!httpServer) {
      return NextResponse.json(
        { error: 'HTTP server not available', initialized: false },
        { status: 503 }
      );
    }

    // Проверяем, инициализирован ли уже WebSocket сервер
    const existingServer = getWebSocketServer();
    if (existingServer) {
      return NextResponse.json({
        initialized: true,
        message: 'WebSocket server already initialized',
      });
    }

    // Инициализируем WebSocket сервер
    initWebSocketServer(httpServer);
    
    logger.info('WebSocket server initialized via API route');
    
    return NextResponse.json({
      initialized: true,
      message: 'WebSocket server initialized successfully',
    });
  } catch (error) {
    logger.error('Failed to initialize WebSocket server via API route', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return NextResponse.json(
      {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

