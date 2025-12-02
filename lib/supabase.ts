import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env-validation';

// Ленивая валидация env переменных
// В Edge Runtime валидация происходит без process.exit
let env: ReturnType<typeof getEnv> | null = null;

function getValidatedEnv() {
  if (!env) {
    try {
      env = getEnv();
    } catch (error) {
      // Проверяем, происходит ли сборка или это Edge Runtime
      const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                          process.env.NEXT_PHASE === 'phase-development-build';
      const isEdgeRuntime = typeof process === 'undefined' || !('exit' in process);
      
      // В Edge Runtime или во время сборки используем fallback значения
      if (isEdgeRuntime || isBuildTime) {
        // Тихий режим - валидация произойдет в runtime
        // Используем значения из process.env напрямую
        env = {
          SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
          CSRF_SECRET: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
          TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
          ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
          NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
        } as ReturnType<typeof getEnv>;
      } else {
        throw error;
      }
    }
  }
  return env;
}

// Client-side Supabase (использует только NEXT_PUBLIC_ переменные - безопасно для клиента)
export const supabase = (() => {
  const env = getValidatedEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
})();

export const supabaseAdmin = (() => {
  const env = getValidatedEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
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
  });
})();

export interface Admin {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}
