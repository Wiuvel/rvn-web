import { describe, it, expect } from 'vitest';
import {
  usernameSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  adminPasswordSchema,
  adminAuthSchema,
  adminRegisterSchema,
  passwordChangeSchema,
} from '@/lib/validation/schemas';

describe('usernameSchema', () => {
  it('принимает валидный логин', () => {
    expect(usernameSchema.safeParse('user_123').success).toBe(true);
    expect(usernameSchema.safeParse('abc').success).toBe(true);
  });
  it('отклоняет слишком короткий или длинный логин', () => {
    const r = usernameSchema.safeParse('ab');
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toContain('не короче 3');
    expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false);
  });
  it('отклоняет недопустимые символы', () => {
    expect(usernameSchema.safeParse('user name').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('принимает валидный пароль', () => {
    expect(passwordSchema.safeParse('Passw0rd!').success).toBe(true);
  });
  it('отклоняет короткий или длинный пароль', () => {
    expect(passwordSchema.safeParse('abc').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('принимает валидные данные', () => {
    expect(loginSchema.safeParse({ username: 'testuser', password: 'Password123' }).success).toBe(
      true,
    );
  });
  it('отклоняет невалидный логин или пароль', () => {
    expect(loginSchema.safeParse({ username: 'ab', password: 'Password123' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('принимает валидные данные', () => {
    expect(
      registerSchema.safeParse({
        username: 'newuser',
        password: 'Password123',
        confirmPassword: 'Password123',
      }).success,
    ).toBe(true);
  });
  it('отклоняет несовпадающие пароли', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      password: 'Password123',
      confirmPassword: 'DifferentPass1',
    });
    expect(r.success).toBe(false);
  });
});

describe('adminPasswordSchema', () => {
  it('принимает пароль без пробелов', () => {
    expect(adminPasswordSchema.safeParse('Admin123!').success).toBe(true);
  });
  it('отклоняет пароль с пробелами', () => {
    expect(adminPasswordSchema.safeParse('Admin 123').success).toBe(false);
  });
});

describe('adminAuthSchema и adminRegisterSchema', () => {
  it('принимают валидные данные админа', () => {
    expect(
      adminAuthSchema.safeParse({ username: 'adminuser', password: 'Admin123!' }).success,
    ).toBe(true);
    expect(
      adminRegisterSchema.safeParse({
        username: 'adminuser',
        password: 'Admin123!',
        confirmPassword: 'Admin123!',
      }).success,
    ).toBe(true);
  });
});

describe('passwordChangeSchema', () => {
  it('принимает валидную смену пароля', () => {
    expect(
      passwordChangeSchema.safeParse({
        oldPassword: 'OldPass123',
        newPassword: 'NewPass456',
        confirmNewPassword: 'NewPass456',
      }).success,
    ).toBe(true);
  });
  it('отклоняет несовпадающие новые пароли', () => {
    expect(
      passwordChangeSchema.safeParse({
        oldPassword: 'OldPass123',
        newPassword: 'NewPass456',
        confirmNewPassword: 'NewPass789',
      }).success,
    ).toBe(false);
  });
});
