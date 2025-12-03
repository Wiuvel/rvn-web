import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/secure-logger';

// Server-only environment variables (not exposed to client)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  logger.warn('SUPABASE ENVIRONMENT VARIABLES ARE NOT SET');
}

// Client-side Supabase (limited access)
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

// Server-side Supabase (full access with SSL verification)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
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

