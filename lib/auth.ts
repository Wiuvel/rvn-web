import bcrypt from 'bcryptjs';
import { supabaseAdmin, Admin } from './supabase';
import { logger } from './secure-logger';
import { ServerValidator } from './server-validation';
import { timingSafePasswordVerify, addRandomDelay } from './timing-safe';
import { bruteForceProtection, getBruteForceIdentifier } from './brute-force-protection';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await timingSafePasswordVerify(password, hash);
}

export async function createAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'База данных не настроена' };
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

export async function authenticateAdmin(username: string, password: string, request?: Request): Promise<{ success: boolean; admin?: Admin; error?: string; remainingAttempts?: number; blockTimeRemaining?: number }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    // Check brute force protection
    const identifier = request ? getBruteForceIdentifier(request, username) : `user:${username}`;
    const isBlocked = await bruteForceProtection.isBlocked(identifier);
    
    if (isBlocked) {
      const blockTimeRemaining = await bruteForceProtection.getBlockTimeRemaining(identifier);
      logger.warn('Authentication blocked due to brute force protection', {
        username: ServerValidator.sanitizeInput(username),
        identifier: identifier.substring(0, 20) + '...',
        blockTimeRemaining
      });
      return { 
        success: false, 
        error: 'Too many failed attempts. Please try again later.',
        blockTimeRemaining
      };
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
      await bruteForceProtection.recordFailedAttempt(identifier, 'user_not_found');
      const remainingAttempts = await bruteForceProtection.getRemainingAttempts(identifier);
      return { success: false, error: 'Invalid credentials', remainingAttempts };
    }

    if (!admin) {
      await bruteForceProtection.recordFailedAttempt(identifier, 'user_not_found');
      const remainingAttempts = await bruteForceProtection.getRemainingAttempts(identifier);
      return { success: false, error: 'Invalid credentials', remainingAttempts };
    }

    // Use timing-safe password verification
    const isValidPassword = await verifyPassword(password, admin.password_hash);
    
    if (!isValidPassword) {
      await bruteForceProtection.recordFailedAttempt(identifier, 'invalid_password');
      const remainingAttempts = await bruteForceProtection.getRemainingAttempts(identifier);
      return { success: false, error: 'Invalid credentials', remainingAttempts };
    }

    // Clear brute force protection on successful login
    await bruteForceProtection.recordSuccessfulAttempt(identifier);

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
