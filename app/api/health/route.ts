import { NextResponse } from 'next/server';

/**
 * Healthcheck endpoint for monitoring the application's status
 */
export async function GET() {
  try {
    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'rvnprivate-web'
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'rvnprivate-web'
      },
      { status: 500 }
    );
  }
}


