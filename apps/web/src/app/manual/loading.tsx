import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManualLoading() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/85">
            <CardHeader className="space-y-3">
              <Skeleton className="h-4 w-28 bg-muted/60" />
              <Skeleton className="h-6 w-40 bg-muted/50" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-24 w-full bg-muted/40" />
              <Skeleton className="h-10 w-full bg-muted/40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
