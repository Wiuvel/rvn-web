import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { supabaseAdmin } from '@/lib/database/supabase';
import { logger } from '@/lib/utils/secure-logger';
import { createHash } from 'crypto';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuth({ headers: request.headers });
    if (!auth.isAuthenticated || !auth.user) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    if (!supabaseAdmin) {
      return setCorsHeaders(NextResponse.json({ error: 'Database error' }, { status: 500 }));
    }

    // Fetch devices
    const { data: devices, error } = await supabaseAdmin
      .from('user_devices')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('last_active', { ascending: false });

    if (error) {
      logger.error('Failed to fetch devices', { error: error.message, userId: auth.user.id });
      return setCorsHeaders(
        NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 }),
      );
    }

    // Calculate current device
    const currentToken = request.cookies.get('token')?.value;
    const currentTokenHash = currentToken
      ? createHash('sha256').update(currentToken).digest('hex')
      : null;

    const devicesWithCurrent = devices.map((d) => ({
      id: d.id,
      device_name: d.device_name,
      ip_address: d.ip_address,
      location: d.location,
      last_active: d.last_active,
      created_at: d.created_at,
      is_current: d.token_hash === currentTokenHash,
    }));

    return setCorsHeaders(NextResponse.json({ devices: devicesWithCurrent }));
  } catch (error) {
    logger.error('Error fetching devices', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
