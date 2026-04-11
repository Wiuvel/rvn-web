import { randomBytes, createHash } from 'crypto';
import { hash as argon2Hash } from '@node-rs/argon2';
import { db } from '../database/db';
import { admins, users, userDevices } from '../database/schema';
import type { Admin } from '../database/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { logger } from '../utils/secure-logger';
import { timingSafePasswordVerify, addRandomDelay } from '../security/timing-safe';
import { ERROR_DATABASE_NOT_CONFIGURED } from '../utils/constants';
import { generateRandomAvatar } from '../utils/avatar-gradients';
import { getRedisClient } from '../database/redis';

export type { Admin };

// Hash password with Argon2id (OWASP 2025 recommended)
export async function hashPassword(password: string): Promise<string> {
  return await argon2Hash(password, {
    memoryCost: 8192,
    timeCost: 2,
    parallelism: 1,
  });
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
    if (!db) {
      logger.error('Database not configured');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    const existingRows = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.username, username))
      .limit(1);

    if (existingRows[0]) {
      return { success: false, error: 'Администратор с таким именем уже существует' };
    }

    // Check if any root admin exists
    const rootRows = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.isRoot, true))
      .limit(1);

    // If no root admin exists, this will be the root admin
    const isRoot = !rootRows[0];

    const passwordHash = await hashPassword(password);
    await db.insert(admins).values({
      username,
      passwordHash,
      isRoot,
    });

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
    if (!db) {
      logger.error('Database not configured');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Always perform the same operations to prevent timing attacks
    const rows = await db.select().from(admins).where(eq(admins.username, username)).limit(1);
    const admin = rows[0];

    // Always add random delay regardless of result
    await addRandomDelay(50, 150);

    if (!admin) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Use timing-safe password verification
    const isValidPassword = await verifyPassword(password, admin.passwordHash!);

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
    if (!db) {
      return false;
    }

    const rows = await db.select({ id: admins.id }).from(admins).limit(1);
    return rows.length > 0;
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
  userId: string;
  username: string;
  passwordHash: string | null;
  avatar?: string | null;
  banner?: string | null;
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  balance?: number;
}

/** Генерирует user_id: 7 цифр (0000000–9999999) */
export function generateUserId(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 10000000;
  return num.toString().padStart(7, '0');
}

// Create new user account
export async function createUser(
  username: string,
  password: string,
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!db) {
      logger.error('Database not configured');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Normalize username to lowercase for comparison
    const normalizedUsername = username.toLowerCase();

    // Check if user exists (case-insensitive)
    const existingUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(ilike(users.username, normalizedUsername));

    // Check exact match (case-insensitive)
    const existingUser = existingUsers.find((u) => u.username.toLowerCase() === normalizedUsername);

    if (existingUser) {
      return { success: false, error: 'User with this username already exists' };
    }

    const passwordHash = await hashPassword(password);
    let visibleUserId = generateUserId();

    let retryCount = 0;
    while (retryCount < 10) {
      const idRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.userId, visibleUserId))
        .limit(1);

      if (!idRows[0]) {
        break;
      }

      visibleUserId = generateUserId();
      retryCount++;
    }

    // Generate random avatar
    const avatar = generateRandomAvatar();

    // Save username in original case, but check by lowercase
    const [newUser] = await db
      .insert(users)
      .values({
        userId: visibleUserId,
        username: username,
        passwordHash,
        avatar,
      })
      .returning();

    if (!newUser) {
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
    if (!db) {
      logger.error('Database not configured');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    // Normalize username to lowercase for search
    const normalizedUsername = username.toLowerCase();

    // Always perform same operations to prevent timing attacks
    const userRows = await db.select().from(users).where(ilike(users.username, normalizedUsername));

    // Always add random delay regardless of result
    await addRandomDelay(50, 150);

    // Find exact match (case-insensitive)
    const user = userRows.find((u) => u.username.toLowerCase() === normalizedUsername) || null;

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account is disabled' };
    }

    // OAuth users don't have passwords - they can't login with username/password
    if (!user.passwordHash) {
      return {
        success: false,
        error: 'This account uses OAuth authentication. Please sign in with your OAuth provider.',
      };
    }

    // Verify password with timing-safe comparison
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Update last login timestamp
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

    return { success: true, user: user as User };
  } catch (error) {
    logger.error('Unexpected error authenticating user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Resolves a user by auth token.
 * Uses Redis cache (5m TTL) with DB fallback.
 */
export async function getUserByToken(authToken: string): Promise<User | null> {
  try {
    if (!db) {
      return null;
    }

    const tokenHash = createHash('sha256').update(authToken).digest('hex');
    const redisCacheKey = `auth:user:${tokenHash}`;

    /* Check Redis cache first */
    const redis = getRedisClient();
    if (redis) {
      try {
        const cachedUser = await redis.get(redisCacheKey);
        if (cachedUser) {
          return JSON.parse(cachedUser) as User;
        }
      } catch {
        /* Redis unavailable — fallback to DB */
      }
    }

    /* Query DB: device → user */
    const deviceRows = await db
      .select({ userId: userDevices.userId })
      .from(userDevices)
      .where(eq(userDevices.tokenHash, tokenHash))
      .limit(1);

    const device = deviceRows[0];
    if (!device) {
      return null;
    }

    const userRows = await db
      .select()
      .from(users)
      .where(and(eq(users.id, device.userId), eq(users.isActive, true)))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      return null;
    }

    /* Write to Redis (5m TTL) */
    if (redis) {
      try {
        await redis.set(redisCacheKey, JSON.stringify(user), 'EX', 300);
      } catch {
        /* Ignore write errors */
      }
    }

    return user as User;
  } catch {
    return null;
  }
}

/** Invalidates Redis cache for a specific auth token */
export async function invalidateUserTokenCache(authToken: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const tokenHash = createHash('sha256').update(authToken).digest('hex');
    await redis.del(`auth:user:${tokenHash}`);
  } catch {
    /* Ignore errors */
  }
}

/** Invalidates Redis auth cache for all active devices of a user (e.g. after role change) */
export async function invalidateUserAuthCacheByUserId(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !db) return;
  try {
    const devices = await db
      .select({ tokenHash: userDevices.tokenHash })
      .from(userDevices)
      .where(eq(userDevices.userId, userId));

    if (devices.length > 0) {
      const keys = devices.map((d) => `auth:user:${d.tokenHash}`);
      await redis.del(...keys);
    }
  } catch {
    /* Ignore errors */
  }
}

export async function getUserById(visibleUserId: string): Promise<User | null> {
  try {
    if (!db) return null;

    const userRows = await db
      .select()
      .from(users)
      .where(and(eq(users.userId, visibleUserId), eq(users.isActive, true)))
      .limit(1);

    const user = userRows[0];
    if (!user) return null;
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
    if (!db) {
      return null;
    }

    // Extract username from email (before @)
    const username = email.split('@')[0];

    const userRows = await db.select().from(users).where(ilike(users.username, username!));

    if (userRows.length === 0) {
      return null;
    }
    return userRows[0] as User;
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
    if (!db) {
      logger.error('Database not configured');
      return { success: false, error: ERROR_DATABASE_NOT_CONFIGURED };
    }

    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return { success: true, user: existingUserByEmail };
    }

    // Use preferred username or extract from email
    let username = preferredUsername || email.split('@')[0]!;

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
    const existingUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(ilike(users.username, normalizedUsername));

    const existingUser = existingUsers.find((u) => u.username.toLowerCase() === normalizedUsername);

    // If username is taken, append random suffix
    if (existingUser) {
      const baseUsername = username;
      let suffix = 1;
      let uniqueUsername = `${baseUsername}_${suffix}`;

      while (suffix < 100) {
        const checkRows = await db
          .select({ id: users.id })
          .from(users)
          .where(ilike(users.username, uniqueUsername.toLowerCase()));

        if (checkRows.length === 0) {
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
    let visibleUserId = generateUserId();
    let retryCount = 0;
    while (retryCount < 10) {
      const idRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.userId, visibleUserId))
        .limit(1);

      if (!idRows[0]) {
        break;
      }

      visibleUserId = generateUserId();
      retryCount++;
    }

    // Попытка загрузить аватар из OAuth провайдера
    let avatar: string = generateRandomAvatar(); // Fallback на случайный градиент
    if (avatarUrl) {
      try {
        const { uploadAvatarFromUrl } = await import('@/lib/storage/s3-client');
        const uploadedAvatarPath = await uploadAvatarFromUrl(avatarUrl, visibleUserId);
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

    const [newUser] = await db
      .insert(users)
      .values({
        userId: visibleUserId,
        username: username,
        passwordHash: null,
        avatar: avatar,
        isActive: true,
      })
      .returning();

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
