import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip =
    forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'Не удалось определить';

  return NextResponse.json(
    { ip },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
