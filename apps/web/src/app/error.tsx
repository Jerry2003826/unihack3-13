"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-3xl border border-border/70 bg-card/90 p-6 text-center shadow-2xl">
        <div className="text-sm uppercase tracking-[0.2em] text-accent">Unexpected error</div>
        <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error.message || "A rendering error interrupted the current screen."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            Back Home
          </Button>
          <Button onClick={() => reset()}>Try Again</Button>
        </div>
      </div>
    </main>
  );
}
