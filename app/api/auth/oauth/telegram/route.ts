import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/utils/oauth-errors';
import { getTelegramBotId } from '@/lib/utils/telegram-bot';
import { domains } from '@/lib/utils';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Telegram OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') 
      ? domains.mainUrl.slice(0, -1) 
      : domains.mainUrl;

    // Check if request is from popup (oauth-handler page opens in popup)
    // This must be determined early as it's used in error handling
    const referer = request.headers.get('referer') || '';
    const isPopup = referer.includes('/auth/oauth-handler') || 
                    referer.includes('popup') ||
                    request.nextUrl.searchParams.get('popup') === 'true';

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      // Rate limit - не логируем
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('Telegram OAuth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get bot ID from bot token
    const botId = await getTelegramBotId(env.TELEGRAM_BOT_TOKEN);
    if (!botId) {
      logger.error('Failed to get Telegram bot ID');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');

    // OAuth инициирован - не логируем

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // Store popup flag in state cookie for callback
    const stateWithPopup = isPopup ? `${state}:popup` : state;

    // Build callback URL
    const callbackUrl = `${origin}/api/auth/oauth/telegram/callback`;

    // Redirect to Telegram OAuth
    const telegramOAuthUrl = `https://oauth.telegram.org/auth?${new URLSearchParams({
      bot_id: botId.toString(),
      origin: origin,
      request_access: 'write',
      return_to: callbackUrl,
      state: stateWithPopup,
    }).toString()}`;

    const response = NextResponse.redirect(telegramOAuthUrl);

    // Store state in cookie for CSRF protection (with popup flag if needed)
    response.cookies.set('oauth_state', stateWithPopup, {
      maxAge: 10 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/',
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Telegram OAuth initiation error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    try {
      const env = getEnv();
      if (domains.mainUrl) {
        const origin = domains.mainUrl.endsWith('/') 
          ? domains.mainUrl.slice(0, -1) 
          : domains.mainUrl;
        // Determine if popup from error context
        const referer = request.headers.get('referer') || '';
        const isPopup = referer.includes('/auth/oauth-handler') || 
                        referer.includes('popup') ||
                        request.nextUrl.searchParams.get('popup') === 'true';
        const errorUrl = getErrorRedirectUrl('oauth_init_error', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

