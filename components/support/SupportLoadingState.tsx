/**
 * Full-screen loading spinner shown while the support page is initializing.
 */
export function SupportLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="spinner"></div>
    </div>
  );
}
