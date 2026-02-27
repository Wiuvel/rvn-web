import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getMaintenanceConfig,
  setMaintenanceConfig,
  MaintenanceConfig,
} from '@/lib/utils/maintenance';
import { logger } from '@/lib/utils/secure-logger';
import { SessionManager } from '@/lib/auth/session-manager';

async function validateAdminSession(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('admin_sid')?.value;
  const token = cookieStore.get('admin_token')?.value;

  if (!sessionId) return false;

  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const validation = await SessionManager.validateSession(
    sessionId,
    token || '',
    ipAddress,
    userAgent,
  );
  return validation.valid;
}

export async function GET(request: NextRequest) {
  if (!(await validateAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const config = await getMaintenanceConfig();
    return NextResponse.json(config);
  } catch (error) {
    logger.error('Failed to get maintenance config', { error });
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await validateAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();

    const config: MaintenanceConfig = {
      isActive: Boolean(body.isActive),
      scheduledStart: body.scheduledStart || null,
      scheduledEnd: body.scheduledEnd || null,
      message: body.message || '',
    };

    await setMaintenanceConfig(config);
    logger.info('Maintenance config updated', { config });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    logger.error('Failed to update maintenance config', { error });
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
