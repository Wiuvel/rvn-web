/**
 * Общая схема валидации для клиента и сервера
 * Используется для единообразной валидации данных
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Валидация username
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (!username) {
    errors.push('Username is required');
    return { isValid: false, errors };
  }

  if (typeof username !== 'string') {
    errors.push('Username must be a string');
    return { isValid: false, errors };
  }

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username.length > 20) {
    errors.push('Username must be no more than 20 characters long');
  }

  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    errors.push('Username can only contain English letters and numbers');
  }

  if (/[<>'"&]/.test(username)) {
    errors.push('Username contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Валидация password
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (typeof password !== 'string') {
    errors.push('Password must be a string');
    return { isValid: false, errors };
  }

  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  if (password.length > 50) {
    errors.push('Password must be no more than 50 characters long');
  }

  if (/\s/.test(password)) {
    errors.push('Password cannot contain spaces');
  }

  if (!/^[a-zA-Z0-9!@#$%^&*()_+.\-=\[\]{};':"\\|,<>\/?]+$/.test(password)) {
    errors.push('Password can only contain English letters, numbers and special characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Валидация confirmPassword
 */
export function validateConfirmPassword(password: string, confirmPassword: string): ValidationResult {
  const errors: string[] = [];

  if (password !== confirmPassword) {
    errors.push('Passwords do not match');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Реэкспорт функции перевода ошибок валидации из error-translations
 * @deprecated Используйте translateError() из error-translations напрямую
 */
export { translateValidationError } from './error-translations';

