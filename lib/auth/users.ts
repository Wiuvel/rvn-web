/**
 * Операции с пользователями
 */

import { supabaseAdmin } from '../supabase';
import { hashPassword, verifyPassword } from './password';
import { generateRandomGradient } from '../avatar-gradients';
import type { User, UserPublic, UserRole } from './types';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Генерирует публичный ID пользователя (формат: AA0000)
 */
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

/**
 * Генерирует dashboard token (8 цифр)
 */
export function generateDashboardToken(): string {
  const digits = '0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += digits[Math.floor(Math.random() * digits.length)];
  }
  return token;
}

// ============================================================================
// User Creation
// ============================================================================

interface CreateUserResult {
  success: true;
  user: User;
}

interface CreateUserError {
  success: false;
  error: string;
}

/**
 * Создает нового пользователя
 */
export async function createUser(
  username: string,
  password: string
): Promise<CreateUserResult | CreateUserError> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const normalizedUsername = username.toLowerCase();

    // Проверяем существование пользователя
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, username')
      .ilike('username', normalizedUsername);

    if (checkError) {
      return { success: false, error: 'Database error' };
    }

    const exists = existingUsers?.some(
      (u) => u.username.toLowerCase() === normalizedUsername
    );

    if (exists) {
      return { success: false, error: 'Username already exists' };
    }

    // Генерируем уникальный user_id
    let userId = generateUserId();
    let retries = 0;
    while (retries < 10) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!existing) break;
      userId = generateUserId();
      retries++;
    }

    // Хешируем пароль и создаем пользователя
    const passwordHash = await hashPassword(password);
    const dashboardToken = generateDashboardToken();
    const avatarGradient = generateRandomGradient();

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username,
        password_hash: passwordHash,
        dashboard_token: dashboardToken,
        avatar_gradient: avatarGradient,
        token_version: 1,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: 'Failed to create user' };
    }

    return { success: true, user: newUser as User };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// User Authentication
// ============================================================================

interface AuthenticateResult {
  success: true;
  user: User;
}

interface AuthenticateError {
  success: false;
  error: string;
  code: 'INVALID_CREDENTIALS' | 'USER_INACTIVE' | 'DATABASE_ERROR';
}

/**
 * Аутентифицирует пользователя по логину и паролю
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthenticateResult | AuthenticateError> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured', code: 'DATABASE_ERROR' };
  }

  try {
    const normalizedUsername = username.toLowerCase();

    // Ищем пользователя
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', normalizedUsername);

    if (fetchError) {
      return { success: false, error: 'Database error', code: 'DATABASE_ERROR' };
    }

    // Находим точное совпадение
    const user = users?.find(
      (u) => u.username.toLowerCase() === normalizedUsername
    ) as User | undefined;

    if (!user) {
      return { success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
    }

    // Проверяем активность
    if (!user.is_active) {
      return { success: false, error: 'Account is disabled', code: 'USER_INACTIVE' };
    }

    // Проверяем пароль
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
    }

    // Обновляем last_login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'DATABASE_ERROR',
    };
  }
}

// ============================================================================
// User Queries
// ============================================================================

/**
 * Получает пользователя по ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as User;
  } catch {
    return null;
  }
}

/**
 * Получает активного пользователя по ID
 */
export async function getActiveUserById(userId: string): Promise<User | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;
    return data as User;
  } catch {
    return null;
  }
}

/**
 * Получает публичные данные пользователя
 */
export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    user_id: user.user_id,
    username: user.username,
    dashboard_token: user.dashboard_token,
    avatar_gradient: user.avatar_gradient,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

// ============================================================================
// User Token Version
// ============================================================================

/**
 * Увеличивает версию токена пользователя (инвалидирует все токены)
 */
export async function incrementTokenVersion(
  userId: string
): Promise<{ success: boolean; newVersion?: number; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Получаем текущую версию
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('token_version')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return { success: false, error: 'User not found' };
    }

    const newVersion = (user.token_version || 1) + 1;

    // Обновляем версию
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ token_version: newVersion })
      .eq('id', userId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, newVersion };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// User Roles
// ============================================================================

/**
 * Получает роли пользователя
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  if (!supabaseAdmin) return ['user'];

  try {
    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error || !data || data.length === 0) {
      return ['user'];
    }

    const roles = data.map((r) => r.role as UserRole);
    if (!roles.includes('user')) {
      roles.push('user');
    }

    return roles;
  } catch {
    return ['user'];
  }
}

/**
 * Проверяет, есть ли у пользователя определенная роль
 */
export async function hasRole(userId: string, role: UserRole): Promise<boolean> {
  if (role === 'user') return true;

  const roles = await getUserRoles(userId);
  return roles.includes(role);
}

// ============================================================================
// OAuth User Management
// ============================================================================

/**
 * Извлекает username из email (убирает @gmail.com и домен)
 * Например: user@gmail.com -> user
 */
export function extractUsernameFromEmail(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const atIndex = normalizedEmail.indexOf('@');
  if (atIndex === -1) {
    // Если нет @, возвращаем как есть (но это не должно происходить)
    return normalizedEmail;
  }
  return normalizedEmail.substring(0, atIndex);
}

interface CreateOrGetUserByEmailResult {
  success: true;
  user: User;
  isNewUser: boolean;
}

interface CreateOrGetUserByEmailError {
  success: false;
  error: string;
}

/**
 * Создает или получает пользователя по email (для OAuth)
 * Username генерируется из email (без домена)
 */
export async function createOrGetUserByEmail(
  email: string
): Promise<CreateOrGetUserByEmailResult | CreateOrGetUserByEmailError> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const username = extractUsernameFromEmail(email);
    const normalizedUsername = username.toLowerCase();

    // Ищем существующего пользователя по username
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', normalizedUsername);

    if (checkError) {
      return { success: false, error: 'Database error' };
    }

    const existingUser = existingUsers?.find(
      (u) => u.username.toLowerCase() === normalizedUsername
    ) as User | undefined;

    if (existingUser) {
      // Пользователь существует - обновляем last_login
      await supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', existingUser.id);

      return { success: true, user: existingUser, isNewUser: false };
    }

    // Пользователь не существует - создаем нового
    // Генерируем уникальный user_id
    let userId = generateUserId();
    let retries = 0;
    while (retries < 10) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!existing) break;
      userId = generateUserId();
      retries++;
    }

    // Генерируем случайный пароль (для OAuth пользователей пароль не используется)
    // Но поле password_hash обязательное, поэтому создаем случайный хеш
    const randomPassword = Math.random().toString(36).slice(-16) + Date.now().toString(36);
    const passwordHash = await hashPassword(randomPassword);
    const dashboardToken = generateDashboardToken();
    const avatarGradient = generateRandomGradient();

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username, // Сохраняем username без домена
        password_hash: passwordHash, // Случайный пароль (не используется для OAuth)
        dashboard_token: dashboardToken,
        avatar_gradient: avatarGradient,
        token_version: 1,
        last_login: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: 'Failed to create user' };
    }

    return { success: true, user: newUser as User, isNewUser: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

