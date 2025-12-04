import { z } from 'zod';

/**
 * Validation schemas for forms using Zod
 */

// Username validation schema
export const usernameSchema = z
  .string()
  .min(3, 'Логин должен быть не короче 3 символов')
  .max(20, 'Логин должен содержать максимум 20 символов')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Логин может содержать только латиницу, цифры и подчеркивание'
  );

// Password validation schema
export const passwordSchema = z
  .string()
  .min(6, 'Пароль должен быть не менее 6 символов')
  .max(50, 'Пароль должен содержать максимум 50 символов')
  .regex(
    /^[a-zA-Z0-9!@#$%^&*()_+.\-=\[\]{};':"\\|,<>\/?]+$/,
    'Пароль может содержать только латиницу, цифры и спецсимволы'
  );

// Login form schema
export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  csrfToken: z.string().optional(),
});

// Registration form schema
export const registerSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    csrfToken: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

// Admin password schema (no spaces allowed)
export const adminPasswordSchema = z
  .string()
  .min(6, 'Пароль должен быть не менее 6 символов')
  .max(50, 'Пароль должен содержать максимум 50 символов')
  .regex(
    /^[a-zA-Z0-9!@#$%^&*()_+.\-=\[\]{};':"\\|,<>\/?]+$/,
    'Пароль может содержать только латиницу, цифры и спецсимволы'
  )
  .refine((password) => !/\s/.test(password), {
    message: 'Пароль не должен содержать пробелы',
  });

// Admin auth form schema
export const adminAuthSchema = z.object({
  username: usernameSchema,
  password: adminPasswordSchema,
  confirmPassword: z.string().optional(),
  csrfToken: z.string().optional(),
});

// Admin registration schema (with confirmPassword required)
export const adminRegisterSchema = adminAuthSchema.extend({
  confirmPassword: z.string().min(1, 'Подтверждение пароля обязательно'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
});

// Type exports
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type AdminAuthFormData = z.infer<typeof adminAuthSchema>;
export type AdminRegisterFormData = z.infer<typeof adminRegisterSchema>;

