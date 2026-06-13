'use client';

import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/index';

interface PlanPreviewCardProps {
  name: string;
  description: string;
  features: string[];
  priceKopecks: number;
  durationDays: number;
  isStub: boolean;
  /** First real plan gets the "Популярный" ribbon, matching /subscription. */
  highlighted?: boolean;
}

/**
 * Read-only preview of a subscription plan, rendered in the same visual style
 * as the public /subscription page (app/subscription/page.tsx). Lets an admin
 * see exactly how a plan will look to users while editing it.
 */
export function PlanPreviewCard({
  name,
  description,
  features,
  priceKopecks,
  durationDays,
  isStub,
  highlighted = false,
}: PlanPreviewCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border transition-all',
        highlighted
          ? 'border-primary-500/30 bg-gradient-to-b from-primary-500/5 to-neutral-900/80 shadow-[0_0_40px_rgba(22,163,255,0.08)]'
          : 'border-neutral-800 bg-neutral-900/60',
        isStub && 'opacity-70',
      )}
    >
      {highlighted && !isStub && (
        <div className="absolute -right-8 top-6 rotate-45 bg-primary-500 px-10 py-1 text-xs font-semibold text-white shadow-lg">
          Популярный
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4">
          <h3 className="mb-2 text-xl font-bold text-white">{name || 'Без названия'}</h3>
          {description && <p className="text-sm leading-relaxed text-neutral-400">{description}</p>}
        </div>

        {isStub ? (
          <div className="mb-6">
            <span className="inline-flex rounded bg-neutral-700/50 px-2 py-0.5 text-xs font-medium text-neutral-400">
              Скоро
            </span>
          </div>
        ) : (
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">
                {(priceKopecks / 100).toFixed(0)}
              </span>
              <span className="text-lg text-neutral-400">₽</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
              <Clock className="h-3.5 w-3.5" />
              <span>{durationDays} дней</span>
            </div>
          </div>
        )}

        {features.length > 0 && (
          <ul className="mb-2 flex-1 space-y-2.5">
            {features.map((feature, fi) => (
              <li key={fi} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-sm text-neutral-300">{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
