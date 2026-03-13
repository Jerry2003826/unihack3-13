import { RadarLoader } from "@/components/shared/RadarLoader";

export default function CompareLoading() {
  return (
    <RadarLoader
      title="Comparison Engine"
      statusText="Loading saved reports..."
      description="Preparing weighted comparison controls and historical results."
    />
  );
}
