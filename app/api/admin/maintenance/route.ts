import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMaintenanceConfig, setMaintenanceConfig, MaintenanceConfig } from '@/lib/utils/maintenance';
import { logger } from '@/lib/utils/secure-logger';

async function isAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_authenticated')?.value === 'true';
}

export async function GET() {
  if (!(await isAdmin())) {
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

export async function POST(request: Request) {
  if (!(await isAdmin())) {
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
