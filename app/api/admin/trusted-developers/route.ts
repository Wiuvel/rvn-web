import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/database/supabase';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';
import { validateRequestBody } from '@/lib/api/validation';
import { z } from 'zod';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

const trustedDeveloperSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  github_username: z.string().min(1, 'GitHub username is required'),
});

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Get current admin ID from session
async function getCurrentAdminId(request: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  
  if (!sessionId) {
    return null;
  }

  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const validation = SessionManager.validateSession(sessionId, ipAddress, userAgent);
  
  if (!validation.valid || !validation.session) {
    return null;
  }

  return validation.session.userId;
}

// GET - List all trusted developers
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for trusted developers listing', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      );
    }

    const { data: developers, error } = await supabaseAdmin
      .from('trusted_github_developers')
      .select('id, email, github_username, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching trusted developers', {
        error: error.message,
        code: error.code,
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Failed to fetch developers' }, { status: 500 }),
      );
    }

    return setCorsHeaders(
      NextResponse.json({ developers: developers || [] }),
    );
  } catch (error) {
    logger.error('Error in GET trusted developers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}

// POST - Add new trusted developer
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for adding trusted developer', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      );
    }

    const adminId = await getCurrentAdminId(request);
    if (!adminId) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid session' }, { status: 401 }),
      );
    }

    const validation = await validateRequestBody(request, trustedDeveloperSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { email, github_username } = validation.data;
    const normalizedEmail = email && email.trim() !== '' ? email.trim().toLowerCase() : null;
    const normalizedUsername = github_username.trim().toLowerCase();

    // Check if developer already exists
    const { data: existing } = await supabaseAdmin
      .from('trusted_github_developers')
      .select('id')
      .or(
        normalizedEmail
          ? `email.eq.${normalizedEmail},github_username.eq.${normalizedUsername}`
          : `github_username.eq.${normalizedUsername}`
      )
      .limit(1)
      .single();

    if (existing) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Developer already exists' },
          { status: 409 },
        ),
      );
    }

    const { data: newDeveloper, error: insertError } = await supabaseAdmin
      .from('trusted_github_developers')
      .insert({
        email: normalizedEmail,
        github_username: normalizedUsername,
        created_by: adminId,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error adding trusted developer', {
        error: insertError.message,
        code: insertError.code,
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Failed to add developer' },
          { status: 500 },
        ),
      );
    }

    logger.info('Trusted developer added', {
      github_username: normalizedUsername,
      email: normalizedEmail || 'not provided',
      adminId,
    });

    return setCorsHeaders(
      NextResponse.json(
        { message: 'Developer added successfully', developer: newDeveloper },
        { status: 201 },
      ),
    );
  } catch (error) {
    logger.error('Error in POST trusted developer', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}

// DELETE - Remove trusted developer
export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for deleting trusted developer', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Developer ID is required' }, { status: 400 }),
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('trusted_github_developers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('Error deleting trusted developer', {
        error: deleteError.message,
        code: deleteError.code,
        id,
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Failed to delete developer' },
          { status: 500 },
        ),
      );
    }

    logger.info('Trusted developer deleted', { id });

    return setCorsHeaders(
      NextResponse.json({ message: 'Developer deleted successfully' }),
    );
  } catch (error) {
    logger.error('Error in DELETE trusted developer', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}

