'use client';

export default function BackgroundEffects() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Dot grid pattern */}
      <div className="dot-grid absolute inset-0 opacity-[0.03]" />

      {/* Static subtle gradients instead of moving orbs */}
      <div className="absolute left-[-10%] top-[-20%] h-[800px] w-[800px] rounded-full bg-primary-500/[0.03] blur-[120px]" />
      <div className="absolute right-[-15%] top-[20%] h-[600px] w-[600px] rounded-full bg-purple-500/[0.02] blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[10%] h-[900px] w-[900px] rounded-full bg-blue-600/[0.02] blur-[140px]" />
    </div>
  );
}
