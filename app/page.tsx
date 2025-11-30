'use client';

import { useEffect, useState } from 'react';
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import AdvantagesSection from "@/components/AdvantagesSection";
import DashboardPreviewSection from "@/components/DashboardPreviewSection";
import AppsSection from "@/components/AppsSection";
import FAQSection from "@/components/FAQSection";
import { useGSAP } from "@/hooks/useGSAP";

export default function Home() {
  const containerRef = useGSAP();
  const [isPageReady, setIsPageReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isCancelled = false;
    let rafId: number | null = null;

    const resolveReadyState = () => {
      if (isCancelled) return;
      setIsPageReady(true);
    };

    if (document.readyState === 'complete') {
      rafId = window.requestAnimationFrame(resolveReadyState);
    } else {
      window.addEventListener('load', resolveReadyState, { once: true });
    }

    const fallbackTimeout = window.setTimeout(resolveReadyState, 2000);

    return () => {
      isCancelled = true;
      window.removeEventListener('load', resolveReadyState);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(fallbackTimeout);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {!isPageReady && (
        <div className="home-loading-overlay" role="status" aria-live="polite" aria-label="Загрузка">
          <div className="home-spinner" aria-hidden="true" />
        </div>
      )}
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <DashboardPreviewSection />
      <AdvantagesSection />
      <AppsSection />
      <FAQSection />
    </div>
  );
}
