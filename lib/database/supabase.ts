import { createClient } from '@supabase/supabase-js';

/**
 * Supabase клиенты с новыми API ключами
 * 
 * Требуемые переменные окружения:
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Publishable Key: sb_publishable_...)
 * - SUPABASE_SECRET_KEY (Secret Key: sb_secret_...)
 * 
 * См. SUPABASE_MIGRATION.md для инструкций
 */

// Server-only environment variables (not exposed to client)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Новый Publishable Key (sb_publishable_...)
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

// Новый Secret Key (sb_secret_...)
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  // Не логируем отсутствие переменных при инициализации модуля
}

// Client-side Supabase (limited access)
// Использует Publishable Key - безопасен при включенном RLS
export const supabase = supabaseUrl && supabasePublishableKey 
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

// Server-side Supabase (full access with SSL verification)
// Использует Secret Key - обходит RLS, только для сервера!
export const supabaseAdmin = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'X-Client-Info': 'raven-admin-panel'
        }
      }
    })
  : null;

export interface Admin {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

