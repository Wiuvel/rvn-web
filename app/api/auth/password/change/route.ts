import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { validateRequestBody } from '@/lib/api/validation';
import { passwordChangeSchema } from '@/lib/validation/schemas';
import { supabaseAdmin } from '@/lib/database/supabase';
import { logger } from '@/lib/utils/secure-logger';
import { SessionManager } from '@/lib/auth/session-manager';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import bcrypt from 'bcryptjs';
import { ERROR_INTERNAL_SERVER_ERROR } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const user = authResult.user;

    // 2. Validate request body
    const validation = await validateRequestBody(request, passwordChangeSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { oldPassword, newPassword } = validation.data;

    if (!supabaseAdmin) {
      logger.error('Database not configured for password change');
      return setCorsHeaders(NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }));
    }

    // 3. Verify old password
    // Fetch current password hash from DB
    const { data: userData, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData) {
      logger.error('Error fetching user password hash', { error: fetchError?.message });
      return setCorsHeaders(NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }));
    }

    if (!userData.password_hash) {
      return setCorsHeaders(NextResponse.json({ error: 'Cannot change password for OAuth account' }, { status: 400 }));
    }

    const isValidPassword = await bcrypt.compare(oldPassword, userData.password_hash);
    if (!isValidPassword) {
      return setCorsHeaders(NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 }));
    }

    // 4. Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // 5. Update password in DB
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Error updating password', { error: updateError.message });
      return setCorsHeaders(NextResponse.json({ error: 'Failed to update password' }, { status: 500 }));
    }

    // 6. Invalidate other sessions
    // Get current token from cookie or request (it's validated in checkAuth)
    const currentToken = request.cookies.get('token')?.value;
    
    if (currentToken) {
      await SessionManager.revokeOtherDevices(user.id, currentToken);
    }

    logger.info('Password changed successfully', { userId: user.id });

    return setCorsHeaders(NextResponse.json({ message: 'Password changed successfully' }));

  } catch (error) {
    logger.error('Password change error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return setCorsHeaders(NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }));
  }
}
