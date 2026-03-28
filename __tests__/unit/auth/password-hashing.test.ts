import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/index';

describe('password hashing (Argon2id)', () => {
  it('hashPassword() возвращает хеш с префиксом $argon2id$', async () => {
    const hash = await hashPassword('test-password');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifyPassword() подтверждает правильный пароль', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('verifyPassword() отклоняет неправильный пароль', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });
});
