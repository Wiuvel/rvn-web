import { calculatePasswordStrength } from '@/lib/auth/password-strength';

interface PasswordStrengthIndicatorProps {
  password?: string;
}

export const PasswordStrengthIndicator = ({ password }: PasswordStrengthIndicatorProps) => {
  if (!password) return null;

  const strength = calculatePasswordStrength(password);
  const widthPercent = strength.score === 0 ? 0 : (strength.score / 4) * 100;

  return (
    <div className="mt-2 animate-fadeIn space-y-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-neutral-400">Надёжность пароля:</span>
        {strength.label && (
          <span
            className={`text-xs font-medium ${
              strength.score === 1
                ? 'text-red-400'
                : strength.score === 2
                  ? 'text-yellow-400'
                  : strength.score === 3
                    ? 'text-blue-400'
                    : 'text-green-400'
            }`}
          >
            {strength.label}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            strength.score === 0
              ? 'bg-neutral-700'
              : strength.score === 1
                ? 'bg-red-500'
                : strength.score === 2
                  ? 'bg-yellow-500'
                  : strength.score === 3
                    ? 'bg-blue-500'
                    : 'bg-green-500'
          }`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
};
