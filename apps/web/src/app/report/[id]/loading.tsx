import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportRouteLoading() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <Skeleton className="h-8 w-28 bg-muted/60" />
        <Skeleton className="h-12 w-2/3 bg-muted/50" />
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="border-border/70 bg-card/85">
              <CardHeader className="space-y-3">
                <Skeleton className="h-4 w-28 bg-muted/60" />
                <Skeleton className="h-6 w-48 bg-muted/50" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full bg-muted/40" />
                <Skeleton className="h-4 w-5/6 bg-muted/40" />
                <Skeleton className="h-24 w-full bg-muted/30" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
