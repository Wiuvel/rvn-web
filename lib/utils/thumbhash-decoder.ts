/**
 * ThumbHash decoder utility for client-side blur placeholder generation.
 * Decodes base64-encoded ThumbHash to a data URL for use as image placeholder.
 */

import { thumbHashToDataURL } from 'thumbhash';

/**
 * Decodes a base64-encoded ThumbHash string to a data URL.
 * Can be used directly as an image src for blur placeholder.
 * 
 * @param base64Hash - The base64-encoded ThumbHash string from the server
 * @returns A data URL string that can be used as an image src, or null if decoding fails
 * 
 * @example
 * const blurDataUrl = decodeThumbHash('1QcSHQRnh493V4dIh4eXh1h4kJUI');
 * // Use as: <img src={blurDataUrl} />
 */
export function decodeThumbHash(base64Hash: string): string | null {
  if (!base64Hash || typeof base64Hash !== 'string') {
    return null;
  }

  try {
    // Decode base64 to binary string
    const binary = atob(base64Hash);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Generate data URL from ThumbHash bytes
    return thumbHashToDataURL(bytes);
  } catch (error) {
    // Log error in development, return null for graceful fallback
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ThumbHash] Failed to decode hash:', error);
    }
    return null;
  }
}

/**
 * Checks if a string is a valid base64-encoded ThumbHash.
 * 
 * @param hash - The string to validate
 * @returns true if the string appears to be a valid base64 ThumbHash
 */
export function isValidThumbHash(hash: string | undefined | null): hash is string {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  
  // ThumbHash is typically 20-30 bytes, so base64 would be ~27-40 characters
  // Also check for valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return hash.length >= 10 && hash.length <= 50 && base64Regex.test(hash);
}
