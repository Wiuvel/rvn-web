'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/index';

const inputClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

interface FieldProps {
  label: string;
  /** Optional helper / description under the label. */
  hint?: React.ReactNode;
  /** Validation error message, shown in red under the control. */
  error?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + optional hint + control slot with consistent spacing/typography.
 * The visible label is also wired to the control via `aria-label` on the inputs
 * below, so the admin forms stay free of jsx-a11y warnings.
 */
export function Field({ label, hint, error, icon, className, children }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-300">
        {icon}
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

type TextFieldProps = Omit<FieldProps, 'children'> &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    inputClassName?: string;
  };

/** Text input wrapped in a `Field`. Forwards a ref so RHF `register` works. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, icon, className, inputClassName, ...input }, ref) => (
    <Field label={label} hint={hint} error={error} icon={icon} className={className}>
      <input ref={ref} aria-label={label} className={cn(inputClass, inputClassName)} {...input} />
    </Field>
  ),
);
TextField.displayName = 'TextField';

/** Number input wrapped in a `Field`. */
export const NumberField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, icon, className, inputClassName, ...input }, ref) => (
    <Field label={label} hint={hint} error={error} icon={icon} className={className}>
      <input
        ref={ref}
        type="number"
        aria-label={label}
        className={cn(inputClass, inputClassName)}
        {...input}
      />
    </Field>
  ),
);
NumberField.displayName = 'NumberField';

export { inputClass };
