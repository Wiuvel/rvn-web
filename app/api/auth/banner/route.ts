/**
 * API endpoint for uploading and updating user banner
 * Deletes old banner from S3 when uploading a new one
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { checkAuth } from '@/lib/auth/helper';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import {
  ERROR_INTERNAL_SERVER_ERROR,
  ERROR_NOT_AUTHENTICATED,
  ERROR_TOO_MANY_REQUESTS,
} from '@/lib/utils/constants';
import { db } from '@/lib/database/db';
import { users } from '@/lib/database/schema';
import { eq } from 'drizzle-orm';
import {
  uploadAvatarToS3,
  deleteFileFromS3,
  validateFile,
  validateFileWithContent,
} from '@/lib/storage/s3-client';
import { getExtensionFromMime } from '@/lib/validation/magic-bytes';
import { setMediaCache } from '@/lib/storage/media-cache';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { BANNER_MAX_BYTES } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Upload/update user banner
 */
export async function POST(request: NextRequest) {
  try {
    /* Rate limiting */
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      return setCorsHeaders(NextResponse.json({ error: ERROR_TOO_MANY_REQUESTS }, { status: 429 }));
    }

    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(NextResponse.json({ error: ERROR_NOT_AUTHENTICATED }, { status: 401 }));
    }
    const user = authResult.user;

    /* Validate userId (protection against vulnerabilities) */
    if (!isValidUUID(user.id)) {
      logger.error('Invalid user ID format', { userId: user.id });
      return setCorsHeaders(NextResponse.json({ error: 'Invalid user ID' }, { status: 400 }));
    }

    /* Get file from FormData */
    const formData = await request.formData();
    const file = formData.get('banner') as File;

    if (!file) {
      return setCorsHeaders(NextResponse.json({ error: 'No file provided' }, { status: 400 }));
    }

    /* Validate file */
    const validation = validateFile({
      size: file.size,
      type: file.type,
      name: file.name,
    });

    if (!validation.valid) {
      return setCorsHeaders(
        NextResponse.json({ error: validation.error || 'Invalid file' }, { status: 400 }),
      );
    }

    /* Additional validation: only images for banners (no GIF) */
    if (!file.type.startsWith('image/')) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Only image files are allowed for banners' }, { status: 400 }),
      );
    }

    /* Disallow GIF for banners */
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      return setCorsHeaders(
        NextResponse.json({ error: 'GIF files are not allowed for banners' }, { status: 400 }),
      );
    }

    /* Limit file size (limit from config) */
    if (file.size > BANNER_MAX_BYTES) {
      return setCorsHeaders(
        NextResponse.json({ error: 'File size must not exceed 2MB' }, { status: 400 }),
      );
    }

    /* Read file into Buffer and validate content before DB access */
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    /* Validate content by magic bytes */
    const contentCheck = validateFileWithContent(
      { size: file.size, type: file.type, name: file.name },
      buffer,
    );

    if (!contentCheck.valid) {
      return setCorsHeaders(
        NextResponse.json({ error: contentCheck.error || 'File content invalid' }, { status: 400 }),
      );
    }

    const verifiedType = contentCheck.detectedType || file.type;

    /* Ensure real type is an image (not GIF) */
    if (verifiedType === 'image/gif') {
      return setCorsHeaders(
        NextResponse.json({ error: 'GIF files are not allowed for banners' }, { status: 400 }),
      );
    }

    /* Get current user banner for deletion */
    if (!db) {
      logger.error('Database client not available');
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    const userRows = await db
      .select({ banner: users.banner })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const currentUser = userRows[0];
    if (!currentUser) {
      logger.error('Error fetching current user banner', {
        userId: user.id,
      });
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    /* Determine extension from real file type */
    const extension = getExtensionFromMime(verifiedType);

    /* Generate storage path for new banner */
    const timestamp = Date.now();
    const storagePath = `banners/${user.id}/${timestamp}.${extension}`;

    /* Upload new banner to S3 with public access (verified type) */
    try {
      await uploadAvatarToS3(buffer, storagePath, verifiedType);
      /* Cache warm-up: first image request will be HIT */
      await setMediaCache(storagePath, buffer, verifiedType, { isAvatarOrBanner: true });
    } catch (error) {
      logger.error('Error uploading banner to S3', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
      });
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    /* Update banner in database */
    const newBannerPath = `s3:${storagePath}`;
    try {
      await db.update(users).set({ banner: newBannerPath }).where(eq(users.id, user.id));
    } catch (updateError) {
      logger.error('Error updating banner in database', {
        error: updateError,
        userId: user.id,
      });
      /* Attempt to delete uploaded file from S3 on DB update failure */
      try {
        await deleteFileFromS3(storagePath);
      } catch (deleteError) {
        logger.error('Error deleting uploaded banner after DB update failure', {
          error: deleteError,
        });
      }
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    /* Delete old banner from S3 if it exists and differs from the new one */
    if (currentUser.banner && currentUser.banner.startsWith('s3:banners/')) {
      const oldStoragePath = currentUser.banner.substring(3); /* Remove 's3:' prefix */

      /* Additional security check: ensure path belongs to current user */
      /* This protects against path traversal vulnerabilities */
      if (oldStoragePath.startsWith(`banners/${user.id}/`)) {
        try {
          await deleteFileFromS3(oldStoragePath);
        } catch (deleteError) {
          /* Log error but don't block response (old file can be deleted later) */
          logger.warn('Error deleting old banner from S3', {
            error: deleteError,
            oldPath: oldStoragePath,
            userId: user.id,
          });
        }
      } else {
        /* Log attempt to delete another user's file (vulnerability protection) */
        logger.warn('Attempted to delete banner of different user', {
          oldPath: oldStoragePath,
          userId: user.id,
        });
      }
    }

    /* Update user_data cookie with new banner */
    const hostname = request.nextUrl?.hostname ?? request.headers.get('host') ?? '';
    const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');

    /* Get current pex from cookie or database */
    const {
      parseUserDataCookie,
      createUserDataCookie,
      USER_DATA_COOKIE_NAME,
      getUserDataCookieOptions,
    } = await import('@/lib/auth/user-cookie.server');
    const currentCookie = request.cookies.get(USER_DATA_COOKIE_NAME)?.value;
    const currentData = parseUserDataCookie(currentCookie);
    const pex = currentData?.pex || 'u';

    const userDataValue = createUserDataCookie({
      user_id: user.userId,
      username: user.username,
      avatar: user.avatar ?? null,
      banner: newBannerPath,
      pex,
    });
    revalidateTag(`user-profile:${user.userId}`, 'max');

    const response = NextResponse.json({
      success: true,
      banner: newBannerPath,
      bannerUrl: `/images/users/banners/${user.id}/${timestamp}.${extension}`,
    });
    response.cookies.set(
      USER_DATA_COOKIE_NAME,
      userDataValue,
      getUserDataCookieOptions(isLocalhost),
    );

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Error uploading banner', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
    );
  }
}
