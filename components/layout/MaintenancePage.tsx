'use client';

import React from 'react';
import { Settings } from 'lucide-react';
import Image from 'next/image';

interface MaintenancePageProps {
  message?: string;
}

export default function MaintenancePage({ message }: MaintenancePageProps) {
  return (
    <div className="min-h-screen w-full bg-neutral-950 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 max-w-md w-full">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
            <div className="relative w-24 h-24 bg-neutral-900 border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl">
              <Settings className="w-12 h-12 text-blue-500 animate-[spin_10s_linear_infinite]" />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-neutral-900 border border-white/10 p-2 rounded-xl shadow-lg">
               <Image src="/static/logo.svg" alt="Raven" width={24} height={24} className="w-6 h-6" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">
          Технические работы
        </h1>
        
        <p className="text-neutral-400 text-lg mb-8 leading-relaxed">
          {message || 'Мы проводим плановое обновление системы, чтобы сделать её лучше для вас. Пожалуйста, зайдите позже.'}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-sm text-neutral-400">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span>Скоро вернемся</span>
        </div>
      </div>

      <div className="absolute bottom-8 text-neutral-600 text-sm">
        &copy; {new Date().getFullYear()} RVN
      </div>
    </div>
  );
}
