'use client';

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

  return (
    <div ref={containerRef} className="relative">
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
