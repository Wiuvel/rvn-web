'use client';

import HeroSection from "@/components/sections/Hero";
import FeaturesSection from "@/components/sections/Features";
import PricingSection from "@/components/sections/Pricing";
import AdvantagesSection from "@/components/sections/Advantages";
import DashboardPreviewSection from "@/components/sections/DashboardPreview";
import AppsSection from "@/components/sections/Apps";
import FAQSection from "@/components/sections/FAQ";
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
