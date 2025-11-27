import { createClient } from '@supabase/supabase-js';

// Server-only environment variables (not exposed to client)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set');
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

// Log database configuration status (only in server environment)
if (typeof window === 'undefined') {
  if (!supabaseAdmin) {
    console.error('⚠️ Supabase Admin client not initialized. Missing environment variables:');
    if (!supabaseUrl) {
      console.error('  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!supabaseServiceKey) {
      console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    }
  } else {
    console.log('✅ Supabase Admin client initialized successfully');
  }
}

export interface Admin {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}
