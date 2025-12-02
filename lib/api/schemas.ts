/**
 * Zod схемы для валидации критичных API эндпоинтов
 */
import { z } from 'zod';

/**
 * Схемы для Auth API
 */
export const loginSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
  csrfToken: z.string().optional(),
});

export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  csrfToken: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

/**
 * Схемы для Support API
 */
export const createTicketSchema = z.object({
  subject: z.string()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be at most 200 characters'),
  message: z.string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

export const updateTicketSchema = z.object({
  status: z.enum(['open', 'closed', 'pending']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const sendMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/**
 * Схемы для Admin API
 */
export const adminUserRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.enum(['support', 'admin'], {
    message: 'Role must be either "support" or "admin"',
  }),
});

/**
 * Схемы для Protection API
 */
export const verifyProtectionSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

/**
 * Схемы для query параметров
 */
export const ticketsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'pending', 'all']).optional(),
  statuses: z.string().optional(),
  forUser: z.string().transform((val) => val === 'true').optional(),
});

export const usersQuerySchema = z.object({
  page: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().positive()).optional(),
  limit: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().positive().max(100)).optional(),
  search: z.string().optional(),
});

