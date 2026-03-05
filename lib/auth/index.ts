import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin, Admin } from '../database/supabase';
import { logger } from '../utils/secure-logger';
import { timingSafePasswordVerify, addRandomDelay } from '../security/timing-safe';
import { ERROR_DATABASE_NOT_CONFIGURED } from '../utils/constants';
import { generateRandomAvatar } from '../utils/avatar-gradients';

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password with timing-safe comparison
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await timingSafePasswordVerify(password, hash);
}

export async function createAdmin(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SECRET_KEY,
      });
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    const { data: existingAdmin, error: checkError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking existing admin', {
        error: checkError.message,
        code: checkError.code,
      });
      return { success: false, error: 'Database ERROR' };
    }

    if (existingAdmin) {
      return { success: false, error: 'Администратор с таким именем уже существует' };
    }

    // Check if any root admin exists
    const { data: rootAdmin, error: rootCheckError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('is_root', true)
      .limit(1)
      .maybeSingle();

    if (rootCheckError && rootCheckError.code !== 'PGRST116') {
      logger.error('Error checking root admin', {
        error: rootCheckError.message,
        code: rootCheckError.code,
      });
      return { success: false, error: 'Database ERROR' };
    }

    // If no root admin exists, this will be the root admin
    const isRoot = !rootAdmin;

    const passwordHash = await hashPassword(password);
    const { error: insertError } = await supabaseAdmin.from('admins').insert({
      username,
      password_hash: passwordHash,
      is_root: isRoot,
    });

    if (insertError) {
      logger.error('Error creating admin', {
        error: insertError.message,
        code: insertError.code,
      });
      return { success: false, error: 'Не удалось создать аккаунт' };
    }

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error creating admin', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Непредвиденная ошибка' };
  }
}

export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<{ success: boolean; admin?: Admin; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SECRET_KEY,
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
      // Не логируем ошибки аутентификации для безопасности
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
    });
    return { success: false, error: 'Unexpected error' };
  }
}

export async function checkAdminExists(): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      return false;
    }

    const { data, error } = await supabaseAdmin.from('admins').select('id').limit(1);

    if (error) {
      logger.error('Error checking admin existence', {
        error: error.message,
        code: error.code,
      });
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    logger.error('Unexpected error checking admin existence', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
  avatar?: string | null;
  banner?: string | null;
  token: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
  balance?: number;
}

/** Base64url alphabet (без +, /, =) */
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Генерирует auth token: 15 символов base64url (crypto random) */
export function generateAuthToken(): string {
  const bytes = randomBytes(15);
  let result = '';
  for (let i = 0; i < 15; i++) {
    result += BASE64URL_ALPHABET[bytes[i]! % 64];
  }
  return result;
}

/** Генерирует user_id: 6 цифр (000000–999999) */
export function generateUserId(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, '0');
}

// Create new user account
export async function createUser(
  username: string,
  password: string,
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SECRET_KEY,
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
        code: checkError.code,
      });
      return { success: false, error: 'Database ERROR' };
    }

    // Check exact match (case-insensitive)
    const existingUser = existingUsers?.find(
      (u: { username: string }) => u.username.toLowerCase() === normalizedUsername,
    );

    if (existingUser) {
      return { success: false, error: 'User with this username already exists' };
    }

    const passwordHash = await hashPassword(password);
    const authToken = generateAuthToken();
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

    // Generate random avatar
    const avatar = generateRandomAvatar();

    // Save username in original case, but check by lowercase
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: username,
        password_hash: passwordHash,
        token: authToken,
        avatar: avatar,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error creating user', {
        error: insertError.message,
        code: insertError.code,
      });
      return { success: false, error: 'Failed to create account' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('Unexpected error creating user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Unexpected error' };
  }
}

// Authenticate user with username and password
export async function authenticateUser(
  username: string,
  password: string,
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SECRET_KEY,
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
      // Не логируем ошибки аутентификации для безопасности
      return { success: false, error: 'Invalid credentials' };
    }

    // Find exact match (case-insensitive)
    const user = users?.find((u: User) => u.username.toLowerCase() === normalizedUsername) || null;

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (!user.is_active) {
      return { success: false, error: 'Account is disabled' };
    }

    // OAuth users don't have passwords - they can't login with username/password
    if (!user.password_hash) {
      return {
        success: false,
        error: 'This account uses OAuth authentication. Please sign in with your OAuth provider.',
      };
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
    });
    return { success: false, error: 'Unexpected error' };
  }
}

export async function getUserByToken(authToken: string): Promise<User | null> {
  try {
    if (!supabaseAdmin) {
      return null;
    }

    const tokenHash = createHash('sha256').update(authToken).digest('hex');

    // Check user_devices first
    const { data: device, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('user_id')
      .eq('token_hash', tokenHash)
      .single();

    if (deviceError || !device) {
      // Legacy support: check users table directly (optional, can be removed)
      // For now, let's keep it STRICT as per "Update auth logic... to use 'user_devices' table"
      return null;
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', device.user_id)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return null;
    }

    return user as User;
  } catch {
    return null;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    if (!supabaseAdmin) return null;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !user) return null;
    return user as User;
  } catch (error) {
    logger.error('Error getting user by id', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
      // Не логируем - это нормальная ситуация при отсутствии конфигурации
      return null;
    }

    // Extract username from email (before @)
    const username = email.split('@')[0];

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', username);

    if (error) {
      logger.error('Error fetching user by email', { error: error.message, code: error.code });
      return null;
    }

    if (!users || users.length === 0) {
      return null;
    }
    return users[0] as User;
  } catch (error) {
    logger.error('Exception in getUserByEmail', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

// Create user from OAuth (email-based, no password)
export async function createUserFromOAuth(
  email: string,
  preferredUsername?: string,
  avatarUrl?: string,
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured');
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
    // Remove leading/trailing underscores and collapse multiple underscores
    username = username.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
    // Limit to 30 characters (database constraint)
    if (username.length > 30) {
      username = username.substring(0, 30);
    }
    // Ensure username is not empty and meets minimum length requirement (3 chars)
    if (!username || username.trim().length === 0 || username.length < 3) {
      username = `user_${Date.now().toString().slice(-8)}`;
    }
    // If username consists only of underscores after sanitization, generate a new one
    if (username.replace(/_/g, '').length === 0) {
      username = `user_${Date.now().toString().slice(-8)}`;
    }

    const normalizedUsername = username.toLowerCase();

    // Check if username is already taken, if so, generate unique one
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, username')
      .ilike('username', normalizedUsername);

    if (checkError) {
      logger.error('Error checking existing user', {
        error: checkError.message,
        code: checkError.code,
      });
      return { success: false, error: 'Database ERROR' };
    }

    const existingUser = existingUsers?.find(
      (u: { username: string }) => u.username.toLowerCase() === normalizedUsername,
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

    // Generate auth token and avatar
    const authToken = generateAuthToken();

    // Попытка загрузить аватар из OAuth провайдера
    let avatar: string = generateRandomAvatar(); // Fallback на случайный градиент
    if (avatarUrl) {
      try {
        const { uploadAvatarFromUrl } = await import('@/lib/storage/s3-client');
        const uploadedAvatarPath = await uploadAvatarFromUrl(avatarUrl, userId);
        if (uploadedAvatarPath) {
          // Сохраняем путь к файлу в S3 в формате `s3:avatars/userId/timestamp.ext`
          avatar = `s3:${uploadedAvatarPath}`;
        }
      } catch (error) {
        // Если загрузка не удалась, используем случайный градиент
        logger.warn('Failed to upload avatar from OAuth provider', {
          error: error instanceof Error ? error.message : 'Unknown error',
          email,
        });
      }
    }

    // OAuth users don't need password - set password_hash to null
    // This distinguishes OAuth users from password-based users

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: username,
        password_hash: null, // OAuth users don't have passwords
        token: authToken,
        avatar: avatar,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error creating user from OAuth', {
        error: insertError.message,
        code: insertError.code,
      });
      return { success: false, error: `Failed to create account: ${insertError.message}` };
    }

    if (!newUser) {
      logger.error('User creation returned null');
      return { success: false, error: 'User creation returned null' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    logger.error('Unexpected error creating user from OAuth', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Unexpected error' };
  }
}
