/**
 * Password strength calculation utility
 */

export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  requirements: {
    minLength: boolean;
    hasUpperCase: boolean;
    hasLowerCase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: '',
      color: '',
      requirements: {
        minLength: false,
        hasUpperCase: false,
        hasLowerCase: false,
        hasNumber: false,
        hasSpecialChar: false,
      },
    };
  }

  const requirements = {
    minLength: password.length >= 6,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+.\-=[\]{};':"\\|,<>/?]/.test(password),
  };

  let score = 0;
  if (requirements.minLength) score++;
  if (requirements.hasUpperCase) score++;
  if (requirements.hasLowerCase) score++;
  if (requirements.hasNumber) score++;
  if (requirements.hasSpecialChar) score++;

  // Normalize score to 0-4 for visualization
  let normalizedScore = 0;
  let label = '';
  let color = '';

  if (score === 0) {
    normalizedScore = 0;
    label = '';
    color = '';
  } else if (score <= 2) {
    normalizedScore = 1;
    label = 'Слабый';
    color = 'bg-red-500';
  } else if (score === 3) {
    normalizedScore = 2;
    label = 'Средний';
    color = 'bg-yellow-500';
  } else if (score === 4) {
    normalizedScore = 3;
    label = 'Хороший';
    color = 'bg-blue-500';
  } else {
    normalizedScore = 4;
    label = 'Отличный';
    color = 'bg-green-500';
  }

  return {
    score: normalizedScore,
    label,
    color,
    requirements,
  };
}
