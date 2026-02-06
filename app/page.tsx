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
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    if (lightRaysLoaded) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lightRaysLoaded]);

  return (
    <>
      {/* Loader */}
      {isLoading && <LogoLoader />}
      
      <div ref={containerRef} className="relative">
        {/* Content */}
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
