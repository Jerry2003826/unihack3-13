import { Skeleton } from "@/components/ui/skeleton";

export default function ScanLoading() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(61,220,255,0.18),_transparent_32%),linear-gradient(180deg,_rgba(18,24,38,0.98),_rgba(9,11,18,1))]" />
      <div className="absolute inset-x-4 top-4 z-10 space-y-3">
        <Skeleton className="h-12 w-full rounded-xl bg-white/10" />
        <Skeleton className="h-5 w-40 bg-white/10" />
      </div>
      <div className="absolute inset-x-6 bottom-6 z-10 space-y-3">
        <Skeleton className="h-14 w-full rounded-full bg-white/10" />
        <Skeleton className="h-12 w-full rounded-full bg-white/10" />
      </div>
    </main>
  );
}
