export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ServerValidator {
  static validateUsername(username: string): ValidationResult {
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

    // Check for potentially dangerous characters
    if (/[<>'"&]/.test(username)) {
      errors.push('Username contains invalid characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validatePassword(password: string): ValidationResult {
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

    if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/.test(password)) {
      errors.push('Password can only contain English letters, numbers and special characters');
    }

    // Check for weak passwords
    if (password === password.toLowerCase() || password === password.toUpperCase()) {
      errors.push('Password must contain both uppercase and lowercase letters');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common passwords
    const commonPasswords = [
      'password', '123456', 'admin', 'root', 'user', 'test',
      'qwerty', 'abc123', 'password123', 'admin123'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common, please choose a stronger password');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateConfirmPassword(password: string, confirmPassword: string): ValidationResult {
    const errors: string[] = [];

    if (password !== confirmPassword) {
      errors.push('Passwords do not match');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
      .slice(0, 1000); // Limit length
  }

  static validateRequestData(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid request data');
      return { isValid: false, errors };
    }

    // Check that all values are strings
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
