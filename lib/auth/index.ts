import bcrypt from 'bcryptjs';
import { supabaseAdmin, Admin } from '../database/supabase';
import { logger } from '../utils/secure-logger';
import { sanitizeInput } from '../security/sanitize';
import { timingSafePasswordVerify, addRandomDelay } from '../security/timing-safe';
import { ERROR_DATABASE_NOT_CONFIGURED } from '../utils/constants';
import { generateRandomGradient } from '../utils/avatar-gradients';

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
      logger.error('DATABASE NOT CONFIGURED - SUPABASEADMIN IS NULL', {
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
      logger.error('ERROR CHECKING EXISTING ADMIN', {
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
      logger.error('ERROR CREATING ADMIN', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: 'Не удалось создать аккаунт' };
    }

    return { success: true };
  } catch (error) {
    logger.error('UNEXPECTED ERROR CREATING ADMIN', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Непредвиденная ошибка' };
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<{ success: boolean; admin?: Admin; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('DATABASE NOT CONFIGURED - SUPABASEADMIN IS NULL', {
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
      logger.error('ERROR FETCHING ADMIN', {
        error: fetchError.message,
        code: fetchError.code,
        username: sanitizeInput(username)
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
    logger.error('UNEXPECTED ERROR AUTHENTICATING ADMIN', {
      error: error instanceof Error ? error.message : 'Unknown error',
      username: sanitizeInput(username)
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
      logger.error('ERROR CHECKING ADMIN EXISTENCE', {
        error: error.message,
        code: error.code
      });
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    logger.error('UNEXPECTED ERROR CHECKING ADMIN EXISTENCE', {
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
  password_hash: string | null;
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
      logger.error('DATABASE NOT CONFIGURED - SUPABASEADMIN IS NULL', {
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
      logger.error('ERROR CHECKING EXISTING USER', {
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
      logger.error('ERROR CREATING USER', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: 'Failed to create account' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('UNEXPECTED ERROR CREATING USER', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}

// Authenticate user with username and password
export async function authenticateUser(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('DATABASE NOT CONFIGURED - SUPABASEADMIN IS NULL', {
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
      logger.error('ERROR FETCHING USER', {
        error: fetchError.message,
        code: fetchError.code,
        username: sanitizeInput(username)
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

    // OAuth users don't have passwords - they can't login with username/password
    if (!user.password_hash) {
      return { success: false, error: 'This account uses OAuth authentication. Please sign in with your OAuth provider.' };
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
    logger.error('UNEXPECTED ERROR AUTHENTICATING USER', {
      error: error instanceof Error ? error.message : 'Unknown error',
      username: sanitizeInput(username)
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
    logger.error('ERROR FETCHING USER BY TOKEN', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

// Get user by email (for OAuth)
// Note: Since we don't have an email field in the database, we use email as a unique identifier
// by extracting the username part and matching it. For Telegram: telegram_{id}@telegram.local -> telegram_{id}
// For Google: user@gmail.com -> user
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    if (!supabaseAdmin) {
      logger.warn('supabase admin is null');
      return null;
    }

    // Extract username from email (before @)
    const username = email.split('@')[0];
    
    
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', username);

    if (error) {
      logger.error('error fetching user by email', { error: error.message, code: error.code });
      return null;
    }

    if (!users || users.length === 0) {
      return null;
    }
    return users[0] as User;
  } catch (error) {
    logger.error('exception in getUserByEmail', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    return null;
  }
}

// Create user from OAuth (email-based, no password)
export async function createUserFromOAuth(email: string, preferredUsername?: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('DATABASE NOT CONFIGURED - SUPABASEADMIN IS NULL');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return { success: true, user: existingUserByEmail };
    }

    // Use preferred username or extract from email
    let username = preferredUsername || email.split('@')[0];
    
    // Sanitize username: remove invalid characters, limit length
    // Only allow alphanumeric, underscore, and hyphen
    username = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Limit to 30 characters (database constraint)
    if (username.length > 30) {
      username = username.substring(0, 30);
    }
    // Ensure username is not empty
    if (!username || username.trim().length === 0) {
      username = `user_${Date.now().toString().slice(-8)}`;
    }
    
    const normalizedUsername = username.toLowerCase();

    // Check if username is already taken, if so, generate unique one
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, username')
      .ilike('username', normalizedUsername);

    if (checkError) {
      logger.error('error checking existing user', {
        error: checkError.message,
        code: checkError.code
      });
      return { success: false, error: 'Database ERROR' };
    }

    const existingUser = existingUsers?.find(
      (u: { username: string }) => u.username.toLowerCase() === normalizedUsername
    );
    
    // If username is taken, append random suffix
    if (existingUser) {
      const baseUsername = username;
      let suffix = 1;
      let uniqueUsername = `${baseUsername}_${suffix}`;
      
      while (suffix < 100) {
        const { data: checkUsers } = await supabaseAdmin
          .from('users')
          .select('id')
          .ilike('username', uniqueUsername.toLowerCase());
        
        if (!checkUsers || checkUsers.length === 0) {
          username = uniqueUsername;
          break;
        }
        
        suffix++;
        uniqueUsername = `${baseUsername}_${suffix}`;
      }
      
      if (suffix >= 100) {
        // Fallback: use timestamp
        username = `${baseUsername}_${Date.now().toString().slice(-6)}`;
      }
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

    // OAuth users don't need password - set password_hash to null
    // This distinguishes OAuth users from password-based users


    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: username,
        password_hash: null, // OAuth users don't have passwords
        dashboard_token: dashboardToken,
        avatar_gradient: avatarGradient,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      logger.error('error creating user from oauth', {
        error: insertError.message,
        code: insertError.code
      });
      return { success: false, error: `Failed to create account: ${insertError.message}` };
    }

    if (!newUser) {
      logger.error('user creation returned null');
      return { success: false, error: 'User creation returned null' };
    }


    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('unexpected error creating user from oauth', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}

