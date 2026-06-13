'use client';

import { cn } from '@/lib/utils/index';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label — required, since the control has no text content. */
  label: string;
  disabled?: boolean;
  /** Visual size of the switch. */
  size?: 'sm' | 'md';
}

/**
 * Controlled on/off switch shared across the admin settings UI.
 * Replaces the hand-rolled toggle markup that was duplicated between the
 * Remnawave and subscription-plan forms. Carries `aria-pressed` + `aria-label`.
 */
export function Toggle({ checked, onChange, label, disabled = false, size = 'md' }: ToggleProps) {
  const dims =
    size === 'sm'
      ? { track: 'h-5 w-9', thumb: 'h-4 w-4', on: 'translate-x-4' }
      : { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'translate-x-5' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50',
        dims.track,
        checked ? 'bg-primary-600' : 'bg-neutral-700',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow ring-0 transition-transform duration-200',
          dims.thumb,
          checked ? dims.on : 'translate-x-0',
        )}
      />
    </button>
  );
}
