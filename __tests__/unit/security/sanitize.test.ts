import { describe, it, expect } from 'vitest';
import { sanitizeInput } from '@/lib/security/sanitize';

describe('sanitizeInput', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
    expect(sanitizeInput(42 as unknown as string)).toBe('');
    expect(sanitizeInput({} as unknown as string)).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('strips angle brackets to defuse HTML/XML injection', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('strips quotes that could break out of attribute contexts', () => {
    expect(sanitizeInput(`it"s 'fine'`)).toBe('its fine');
  });

  it('strips ampersands to prevent entity smuggling', () => {
    expect(sanitizeInput('a & b')).toBe('a  b');
  });

  it('preserves safe punctuation and whitespace inside the string', () => {
    expect(sanitizeInput('hello, world! 42 — yes.')).toBe('hello, world! 42 — yes.');
  });

  it('keeps unicode (cyrillic, emoji) intact', () => {
    expect(sanitizeInput('Привет 👋')).toBe('Привет 👋');
  });

  it('truncates output to 1000 characters', () => {
    const long = 'x'.repeat(2000);
    expect(sanitizeInput(long)).toHaveLength(1000);
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(sanitizeInput('   ')).toBe('');
  });

  it('removes all forbidden characters in mixed input', () => {
    expect(sanitizeInput(`<a href="x">"bad"&'evil'</a>`)).toBe('a href=xbadevil/a');
  });
});
