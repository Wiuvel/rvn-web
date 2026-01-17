'use client';

import { useState, useEffect } from 'react';
import HeroSection from "@/components/sections/Hero";
import FeaturesSection from "@/components/sections/Features";
import PricingSection from "@/components/sections/Pricing";
import AdvantagesSection from "@/components/sections/Advantages";
import DashboardPreviewSection from "@/components/sections/DashboardPreview";
import AppsSection from "@/components/sections/Apps";
import FAQSection from "@/components/sections/FAQ";
import { useGSAP } from "@/hooks/useGSAP";
import LogoLoader from '@/components/ui/LogoLoader';

export default function Home() {
  const containerRef = useGSAP();
  const [isLoading, setIsLoading] = useState(true);
  const [lightRaysLoaded, setLightRaysLoaded] = useState(false);

  useEffect(() => {
    // Сбрасываем скролл в начало при загрузке
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  // Ждем загрузки LightRays перед показом контента
  useEffect(() => {
    if (lightRaysLoaded) {
      // Небольшая задержка для плавного появления
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lightRaysLoaded]);

  return (
    <>
      {/* Лоадер - показывается пока не загружен LightRays */}
      {isLoading && <LogoLoader />}
      
      <div ref={containerRef} className="relative">
        {/* Контент страницы - всегда рендерится, но скрыт/прозрачен при загрузке */}
        <div className={isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-300'}>
          <HeroSection onLightRaysLoad={() => setLightRaysLoaded(true)} />
          <FeaturesSection />
          <PricingSection />
          <DashboardPreviewSection />
          <AdvantagesSection />
          <AppsSection />
          <FAQSection />
        </div>
      </div>
    </>
  );
}
