import { NextRequest } from 'next/server';

/**
 * Возвращает IP запроса из заголовков (для страницы /protection без динамического рендера).
 */
export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  const ip = forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || null;
  return Response.json({ ip });
}
