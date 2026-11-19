import RadialSpinner from "@/components/RadialSpinner";

export default function BrandLoader() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <RadialSpinner size={48} />
    </div>
  );
}
