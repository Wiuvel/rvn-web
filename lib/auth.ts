import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { supabaseAdmin, Admin } from './supabase';
import { logger } from './secure-logger';
import { ServerValidator } from './server-validation';
import { timingSafePasswordVerify, addRandomDelay } from './timing-safe';
import { ERROR_DATABASE_NOT_CONFIGURED } from './constants';
import { generateRandomGradient } from './avatar-gradients';

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password with timing-safe comparison
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await timingSafePasswordVerify(password, hash);
}

export async function createAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured - supabaseAdmin is null', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    const { data: existingAdmin, error: checkError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('username', username)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking existing admin', {
        error: checkError.message,
        code: checkError.code
      });
      return { success: false, error: 'Database ERROR' };
    }

    if (existingAdmin) {
      return { success: false, error: 'Администратор с таким именем уже существует' };
    }

    const passwordHash = await hashPassword(password);
    const { error: insertError } = await supabaseAdmin
      .from('admins')
      .insert({
        username,
        password_hash: passwordHash
      });

    if (insertError) {
      logger.error('Error creating admin', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: 'Не удалось создать аккаунт' };
    }

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error creating admin', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Непредвиденная ошибка' };
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<{ success: boolean; admin?: Admin; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured - supabaseAdmin is null', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Always perform the same operations to prevent timing attacks
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('username', username)
      .single();

    // Always add random delay regardless of result
    await addRandomDelay(50, 150);

    if (fetchError) {
      logger.error('Error fetching admin', {
        error: fetchError.message,
        code: fetchError.code,
        username: ServerValidator.sanitizeInput(username)
      });
      return { success: false, error: 'Invalid credentials' };
    }

    if (!admin) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Use timing-safe password verification
    const isValidPassword = await verifyPassword(password, admin.password_hash);
    
    if (!isValidPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    return { success: true, admin };
  } catch (error) {
    logger.error('Unexpected error authenticating admin', {
      error: error instanceof Error ? error.message : 'Unknown error',
      username: ServerValidator.sanitizeInput(username)
    });
    return { success: false, error: 'Unexpected error' };
  }
}

export async function checkAdminExists(): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      return false;
    }

    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('id')
      .limit(1);

    if (error) {
      logger.error('Error checking admin existence', {
        error: error.message,
        code: error.code
      });
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    logger.error('Unexpected error checking admin existence', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

// User authentication types and functions
export interface User {
  id: string;
  user_id: string;
  username: string;
  password_hash: string;
  avatar_gradient?: string | null;
  dashboard_token: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

// Generate 8-digit dashboard token
export function generateDashboardToken(): string {
  const digits = '0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += digits[Math.floor(Math.random() * digits.length)];
  }
  return token;
}

// Generate unique user ID (2 letters + 4 digits)
export function generateUserId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  
  let id = '';
  for (let i = 0; i < 2; i++) {
    id += letters[Math.floor(Math.random() * letters.length)];
  }
  for (let i = 0; i < 4; i++) {
    id += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return id;
}

// Create new user account
export async function createUser(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured - supabaseAdmin is null', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Normalize username to lowercase for comparison
    const normalizedUsername = username.toLowerCase();

    // Check if user exists (case-insensitive)
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, username')
      .ilike('username', normalizedUsername);

    if (checkError) {
      logger.error('Error checking existing user', {
        error: checkError.message,
        code: checkError.code
      });
      return { success: false, error: 'Database ERROR' };
    }

    // Check exact match (case-insensitive)
    const existingUser = existingUsers?.find(
      (u: { username: string }) => u.username.toLowerCase() === normalizedUsername
    );
    
    if (existingUser) {
      return { success: false, error: 'User with this username already exists' };
    }

    const passwordHash = await hashPassword(password);
    const dashboardToken = generateDashboardToken();
    let userId = generateUserId();
    
    let retryCount = 0;
    while (retryCount < 10) {
      const { data: existingUserId } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (!existingUserId) {
        break;
      }
      
      userId = generateUserId();
      retryCount++;
    }

    // Generate random avatar gradient
    const avatarGradient = generateRandomGradient();

    // Save username in original case, but check by lowercase
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: username,
        password_hash: passwordHash,
        dashboard_token: dashboardToken,
        avatar_gradient: avatarGradient
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error creating user', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: 'Failed to create account' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('Unexpected error creating user', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}

// Authenticate user with username and password
export async function authenticateUser(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured - supabaseAdmin is null', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Normalize username to lowercase for search
    const normalizedUsername = username.toLowerCase();

    // Always perform same operations to prevent timing attacks
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', normalizedUsername);

    // Always add random delay regardless of result
    await addRandomDelay(50, 150);

    if (fetchError) {
      logger.error('Error fetching user', {
        error: fetchError.message,
        code: fetchError.code,
        username: ServerValidator.sanitizeInput(username)
      });
      return { success: false, error: 'Invalid credentials' };
    }

    // Find exact match (case-insensitive)
    const user = users?.find(
      (u: User) => u.username.toLowerCase() === normalizedUsername
    ) || null;

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (!user.is_active) {
      return { success: false, error: 'Account is disabled' };
    }

    // Verify password with timing-safe comparison
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Update last login timestamp
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    return { success: true, user: user as User };
  } catch (error) {
    logger.error('Unexpected error authenticating user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      username: ServerValidator.sanitizeInput(username)
    });
    return { success: false, error: 'Unexpected error' };
  }
}

export async function getUserByToken(dashboardToken: string): Promise<User | null> {
  try {
    if (!supabaseAdmin) {
      return null;
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('dashboard_token', dashboardToken)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return null;
    }

    return user as User;
  } catch (error) {
    logger.error('Error fetching user by token', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

// Get user by email (for OAuth)
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    if (!supabaseAdmin) {
      return null;
    }

    // Extract username from email (before @)
    const username = email.split('@')[0];
    
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', username);

    if (error || !users || users.length === 0) {
      return null;
    }

    // Return first match (should be unique)
    return users[0] as User;
  } catch (error) {
    logger.error('Error fetching user by email', {
      error: error instanceof Error ? error.message : 'Unknown error',
      email: email.substring(0, 3) + '***'
    });
    return null;
  }
}

// Create user from OAuth (email-based, no password)
export async function createUserFromOAuth(email: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured - supabaseAdmin is null');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Extract username from email
    const username = email.split('@')[0];
    const normalizedUsername = username.toLowerCase();

    // Check if user already exists
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, username')
      .ilike('username', normalizedUsername);

    if (checkError) {
      logger.error('Error checking existing user for OAuth', {
        error: checkError.message,
        code: checkError.code
      });
      return { success: false, error: 'Database ERROR' };
    }

    const existingUser = existingUsers?.find(
      (u: { username: string }) => u.username.toLowerCase() === normalizedUsername
    );
    
    if (existingUser) {
      return { success: false, error: 'User already exists' };
    }

    // Generate unique user_id
    let userId = generateUserId();
    let retryCount = 0;
    while (retryCount < 10) {
      const { data: existingUserId } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (!existingUserId) {
        break;
      }
      
      userId = generateUserId();
      retryCount++;
    }

    // Generate dashboard token and avatar gradient
    const dashboardToken = generateDashboardToken();
    const avatarGradient = generateRandomGradient();

    // Create user with placeholder password hash (OAuth users don't need password)
    const placeholderHash = await hashPassword(randomBytes(32).toString('hex'));

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: username,
        password_hash: placeholderHash,
        dashboard_token: dashboardToken,
        avatar_gradient: avatarGradient,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error creating user from OAuth', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: 'Failed to create account' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('Unexpected error creating user from OAuth', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}
