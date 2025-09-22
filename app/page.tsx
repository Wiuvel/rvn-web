'use client';

import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import AppsSection from "@/components/AppsSection";
import FAQSection from "@/components/FAQSection";
import CTASection from "@/components/CTASection";
import { useGSAP } from "@/hooks/useGSAP";

export default function Home() {
  const containerRef = useGSAP();

  return (
    <div ref={containerRef}>
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <AppsSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
