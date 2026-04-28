'use client';

import { useState, useEffect } from 'react';
import HeroSection from '@/components/sections/Hero';
import FeaturesSection from '@/components/sections/Features';
import PricingSection from '@/components/sections/Pricing';
import AdvantagesSection from '@/components/sections/Advantages';
import DashboardPreviewSection from '@/components/sections/DashboardPreview';
import AppsSection from '@/components/sections/Apps';
import FAQSection from '@/components/sections/FAQ';
import { useGSAP } from '@/hooks/useGSAP';
import LogoLoader from '@/components/ui/LogoLoader';

export default function Home() {
  const containerRef = useGSAP();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {isLoading && <LogoLoader />}
      
      <div ref={containerRef} className="relative z-10">
        <div
          className={
            isLoading
              ? 'pointer-events-none opacity-0'
              : 'opacity-100 transition-opacity duration-300'
          }
        >
          <HeroSection />
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
