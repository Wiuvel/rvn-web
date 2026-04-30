'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getStaticUrl } from '@/lib/utils';

export interface ErrorStateProps {
  code?: string | number;
  title?: string;
  description?: string | React.ReactNode;
  showButton?: boolean;
  showImage?: boolean;
  buttonText?: string;
  buttonHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  glowColor?: string; // Tailwind color class for ambient glow (e.g. 'bg-primary-900/20' or 'bg-red-900/20')
}

export default function ErrorState({
  code = '404',
  title = 'Контент не найден',
  description = 'Запрашиваемая страница не существует или была перемещена.',
  showButton = true,
  showImage = false,
  buttonText = 'Вернуться на главную',
  buttonHref = '/',
  imageSrc = '/static/ErrorState_NotFound.webp',
  imageAlt = 'Error Image',
  glowColor = 'bg-primary-900/20',
}: ErrorStateProps) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black p-4 selection:bg-primary-500/30 sm:p-8">
      {/* Background Ambient Glow */}
      <div
        className={`absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 ${glowColor} pointer-events-none -z-10 rounded-full blur-[120px]`}
      />

      <div
        className={`grid w-full max-w-6xl grid-cols-1 ${showImage ? 'lg:grid-cols-12' : 'grid-cols-1'} items-center gap-12`}
      >
        {/* Text Content - Centered if no image, otherwise Left Aligned */}
        <div
          className={`${showImage ? 'items-center text-center lg:col-span-7 lg:items-start lg:text-left' : 'flex w-full flex-col items-center text-center'} z-10 flex flex-col space-y-8`}
        >
          {/* Error Code Console Style */}
          <div className="relative">
            <h1 className="select-none font-mono text-[6rem] font-bold leading-none tracking-tighter sm:text-[9rem] lg:text-[10rem]">
              <span className="bg-gradient-to-b from-white via-neutral-200 to-neutral-600 bg-clip-text text-transparent">
                {code}
              </span>
              <span className="ml-2 inline-block h-[0.7em] w-[0.1em] animate-[blink_1s_step-end_infinite] bg-gradient-to-b from-white via-neutral-200 to-neutral-600 align-baseline" />
            </h1>
          </div>

          <div className="max-w-lg space-y-4">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="text-base leading-relaxed text-neutral-400 sm:text-lg">{description}</p>
          </div>

          {/* Action Button */}
          {showButton && (
            <div className="pt-4">
              <Link
                href={buttonHref}
                prefetch={false}
                className="group relative inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 font-semibold text-black transition-all duration-300 hover:scale-[1.02] hover:bg-neutral-200 active:scale-[0.98]"
              >
                <ArrowLeft className="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-1" />
                <span>{buttonText}</span>
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Image (Optional) */}
        {showImage && imageSrc && (
          <div className="relative order-first hidden justify-center lg:order-last lg:col-span-5 lg:flex lg:justify-end">
            <div className="mx-auto w-full max-w-[280px] animate-fadeIn sm:max-w-[320px] md:max-w-[500px] lg:mr-0">
              <img
                src={getStaticUrl(imageSrc)}
                alt={imageAlt}
                fetchPriority="high"
                decoding="async"
                className="h-auto w-full object-contain drop-shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>

      {/* Keyframes for blink cursor and fadeIn image — global style (no styled-jsx) */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
