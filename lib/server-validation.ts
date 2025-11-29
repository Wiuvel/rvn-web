// Реэкспорт из общей схемы валидации для обратной совместимости
import {
  validateUsername as validateUsernameImpl,
  validatePassword as validatePasswordImpl,
  validateConfirmPassword as validateConfirmPasswordImpl,
  type ValidationResult
} from './validation-schema';

export type { ValidationResult };

/**
 * ServerValidator - обертка для обратной совместимости
 * @deprecated Используйте функции напрямую из validation-schema
 */
export class ServerValidator {
  static validateUsername(username: string): ValidationResult {
    return validateUsernameImpl(username);
  }

  static validatePassword(password: string): ValidationResult {
    return validatePasswordImpl(password);
  }

  static validateConfirmPassword(password: string, confirmPassword: string): ValidationResult {
    return validateConfirmPasswordImpl(password, confirmPassword);
  }

  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .replace(/[<>'"&]/g, '')
      .slice(0, 1000);
  }

  static validateRequestData(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid request data');
      return { isValid: false, errors };
    }

    for (const key in data) {
      if (typeof (data as Record<string, unknown>)[key] !== 'string') {
        errors.push(`Field '${key}' must be a string`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Реэкспорт функций для прямого использования
export const validateUsername = validateUsernameImpl;
export const validatePassword = validatePasswordImpl;
export const validateConfirmPassword = validateConfirmPasswordImpl;
