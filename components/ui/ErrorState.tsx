'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { getStaticUrl } from "@/lib/utils";

export interface ErrorStateProps {
  code?: string | number;
  title?: string;
  description?: string;
  showButton?: boolean;
  showImage?: boolean;
  buttonText?: string;
  buttonHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  glowColor?: string; // Tailwind color class for ambient glow (e.g. 'bg-primary-900/20' or 'bg-red-900/20')
}

export default function ErrorState({
  code = "404",
  title = "Контент не найден",
  description = "Запрашиваемая страница не существует или была перемещена.",
  showButton = true,
  showImage = false,
  buttonText = "Вернуться на главную",
  buttonHref = "/",
  imageSrc = "/static/ErrorState_NotFound.png",
  imageAlt = "Error Image",
  glowColor = "bg-primary-900/20"
}: ErrorStateProps) {
  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center p-4 sm:p-8 overflow-hidden relative selection:bg-primary-500/30">
      {/* Background Ambient Glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] ${glowColor} blur-[120px] rounded-full -z-10 pointer-events-none`} />

      <div className={`w-full max-w-6xl grid grid-cols-1 ${showImage ? 'lg:grid-cols-12' : 'grid-cols-1'} gap-12 items-center`}>
        
        {/* Text Content - Centered if no image, otherwise Left Aligned */}
        <div className={`${showImage ? 'lg:col-span-7 lg:items-start lg:text-left' : 'w-full flex flex-col items-center text-center'} flex flex-col items-center space-y-8 z-10`}>
          {/* Error Code Console Style */}
          <div className="relative">
            <h1 className="text-[6rem] sm:text-[9rem] lg:text-[10rem] font-bold leading-none tracking-tighter select-none font-mono">
              <span className="bg-gradient-to-b from-white via-neutral-200 to-neutral-600 bg-clip-text text-transparent">
                {code}
              </span>
              <span className="inline-block w-[0.1em] h-[0.7em] bg-gradient-to-b from-white via-neutral-200 to-neutral-600 ml-2 align-baseline animate-[blink_1s_step-end_infinite]" />
            </h1>
          </div>

          <div className="space-y-4 max-w-lg">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {title}
            </h2>
            <p className="text-neutral-400 text-base sm:text-lg leading-relaxed">
              {description}
            </p>
          </div>

          {/* Action Button */}
          {showButton && (
            <div className="pt-4">
              <Link 
                href={buttonHref}
                className="group relative inline-flex items-center gap-2 px-8 py-4 bg-white text-black rounded-xl font-semibold transition-all duration-300 hover:bg-neutral-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
                <span>{buttonText}</span>
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Image (Optional) */}
        {showImage && imageSrc && (
          <div className="lg:col-span-5 relative hidden lg:flex justify-center lg:justify-end order-first lg:order-last">
            <div className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[500px] aspect-square animate-fadeIn mx-auto lg:mr-0">
              <Image
                src={getStaticUrl(imageSrc)}
                alt={imageAlt}
                fill
                className="object-contain drop-shadow-2xl"
                priority
                unoptimized
              />
            </div>
          </div>
        )}
      </div>

      {/* Custom Keyframe for Blink */}
      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(-1deg); }
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
