import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { randomBytes } from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Генерирует случайный session ID
 * Используется для CSRF токенов и сессий
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

