import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { SessionManager } from '@/lib/auth/session-manager';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const auth = await checkAuth({ headers: request.headers });

    if (!auth.isAuthenticated || !auth.user) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    await SessionManager.revokeDeviceById(deviceId, auth.user.id);

    return setCorsHeaders(NextResponse.json({ success: true }));
  } catch (error) {
    logger.error('Error revoking device', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
