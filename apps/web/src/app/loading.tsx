import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-10 w-40 bg-muted/60" />
        <Skeleton className="h-16 w-3/4 bg-muted/50" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-2xl bg-muted/40" />
          ))}
        </div>
      </div>
    </main>
  );
}
