import { describe, it, expect } from 'vitest';
import {
  POPUP_SPECIFIC_ERRORS,
  OAUTH_ERROR_MESSAGES,
  GOOGLE_ERROR_MAP,
  getOAuthErrorMessage,
  isPopupSpecificError,
  getErrorRedirectUrl,
} from '@/lib/auth/oauth-errors';

describe('getOAuthErrorMessage', () => {
  it('returns the unknown_error fallback for null/undefined input', () => {
    expect(getOAuthErrorMessage(null)).toBe(OAUTH_ERROR_MESSAGES['unknown_error']);
    expect(getOAuthErrorMessage(undefined)).toBe(OAUTH_ERROR_MESSAGES['unknown_error']);
    expect(getOAuthErrorMessage('')).toBe(OAUTH_ERROR_MESSAGES['unknown_error']);
  });

  it('resolves a known error code directly', () => {
    expect(getOAuthErrorMessage('rate_limit')).toBe('Превышен лимит запросов');
    expect(getOAuthErrorMessage('popup_closed')).toBe('Окно закрыто');
  });

  it('translates Google-specific codes through GOOGLE_ERROR_MAP', () => {
    expect(getOAuthErrorMessage('access_denied')).toBe(OAUTH_ERROR_MESSAGES['oauth_denied']);
    expect(getOAuthErrorMessage('temporarily_unavailable')).toBe(
      OAUTH_ERROR_MESSAGES['rate_limit'],
    );
    expect(getOAuthErrorMessage('server_error')).toBe(OAUTH_ERROR_MESSAGES['internal_error']);
  });

  it('falls back to unknown_error for unrecognized codes', () => {
    expect(getOAuthErrorMessage('totally_unknown_code')).toBe(
      OAUTH_ERROR_MESSAGES['unknown_error'],
    );
  });

  it('every value in GOOGLE_ERROR_MAP points to a real OAUTH_ERROR_MESSAGES key', () => {
    for (const target of Object.values(GOOGLE_ERROR_MAP)) {
      expect(OAUTH_ERROR_MESSAGES[target]).toBeDefined();
    }
  });
});

describe('isPopupSpecificError', () => {
  it('returns true for the documented popup error codes', () => {
    expect(isPopupSpecificError('popup_blocked')).toBe(true);
    expect(isPopupSpecificError('popup_closed')).toBe(true);
    expect(isPopupSpecificError('popup_timeout')).toBe(true);
  });

  it('returns false for non-popup error codes', () => {
    expect(isPopupSpecificError('rate_limit')).toBe(false);
    expect(isPopupSpecificError('access_denied')).toBe(false);
  });

  it('returns false for null/undefined/empty input', () => {
    expect(isPopupSpecificError(null)).toBe(false);
    expect(isPopupSpecificError(undefined)).toBe(false);
    expect(isPopupSpecificError('')).toBe(false);
  });

  it('the POPUP_SPECIFIC_ERRORS set is exposed and matches the helper', () => {
    expect(POPUP_SPECIFIC_ERRORS.size).toBe(3);
    for (const code of POPUP_SPECIFIC_ERRORS) {
      expect(isPopupSpecificError(code)).toBe(true);
    }
  });
});

describe('getErrorRedirectUrl', () => {
  const ORIGIN = 'https://rvn.market';

  it('routes popup-specific errors to /auth regardless of popup flag', () => {
    const url = getErrorRedirectUrl('popup_closed', ORIGIN, true);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('error')).toBe('popup_closed');
    expect(url.searchParams.get('popup')).toBeNull();
  });

  it('routes non-popup errors to /auth/oauth-handler when isPopup is true', () => {
    const url = getErrorRedirectUrl('rate_limit', ORIGIN, true);
    expect(url.pathname).toBe('/auth/oauth-handler');
    expect(url.searchParams.get('error')).toBe('rate_limit');
    expect(url.searchParams.get('popup')).toBe('true');
  });

  it('routes non-popup errors to /auth when isPopup is false', () => {
    const url = getErrorRedirectUrl('rate_limit', ORIGIN, false);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('error')).toBe('rate_limit');
    expect(url.searchParams.get('popup')).toBeNull();
  });

  it('URL-encodes error codes that contain reserved characters', () => {
    const url = getErrorRedirectUrl('weird/code with spaces', ORIGIN, false);
    expect(url.searchParams.get('error')).toBe('weird/code with spaces');
    expect(url.toString()).toContain('weird%2Fcode%20with%20spaces');
  });
});
