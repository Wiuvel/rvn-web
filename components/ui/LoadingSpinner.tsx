'use client';

import React from 'react';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export default function LoadingSpinner({ className = '', size, fullScreen }: LoadingSpinnerProps) {
  // If fullScreen is explicitly provided, use it.
  // Otherwise: if size is provided, assume inline (fullScreen=false); else assume fullScreen=true (backward compatibility).
  const isFullScreen = fullScreen ?? (size ? false : true);

  const sizeClasses = {
    sm: '!w-4 !h-4 border-2',
    md: '!w-8 !h-8 border-2',
    lg: '!w-12 !h-12 border-[3px]',
  };

  const appliedSizeClass = size ? sizeClasses[size] : '';

  const spinner = <div className={`spinner ${appliedSizeClass} ${className}`} />;

  if (isFullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">{spinner}</div>
    );
  }

  return spinner;
}
