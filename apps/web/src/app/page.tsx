"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/useSessionStore";
import { useHazardStore } from "@/store/useHazardStore";
import { FallbackTrigger } from "@/components/shared/FallbackTrigger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function HomePage() {
  const router = useRouter();
  const { beginInspection, prepareManualMode } = useSessionStore();
  const { resetForNewInspection } = useHazardStore();

  const [address, setAddress] = useState("");
  const [agency, setAgency] = useState("");

  const handleStartLiveScan = () => {
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!agency.trim()) {
      toast.error("Agency name is required");
      return;
    }

    beginInspection({
      mode: "live",
      address: address.trim(),
      agency: agency.trim(),
    });
    resetForNewInspection();
    router.push("/radar");
  };

  const handleManualUpload = () => {
    prepareManualMode();
    resetForNewInspection();
    router.push("/manual");
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4">
      <FallbackTrigger />
      
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-accent">Inspect.AI</h1>
          <p className="text-muted-foreground">Rental property risk scanner & decision assistant</p>
        </div>

        <Card className="border-accent/20 shadow-lg shadow-accent/5">
          <CardHeader>
            <CardTitle>Live Inspection</CardTitle>
            <CardDescription>Scan a property in real-time during an inspection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="address" className="text-sm font-medium text-foreground/90">Property Address</label>
              <Input
                id="address"
                placeholder="e.g. 15 Dandenong Rd, Clayton"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-muted/50 focus-visible:ring-accent"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="agency" className="text-sm font-medium text-foreground/90">Real Estate Agency</label>
              <Input
                id="agency"
                placeholder="e.g. Ray White Clayton"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className="bg-muted/50 focus-visible:ring-accent"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" size="lg" onClick={handleStartLiveScan}>
              Start Scan
            </Button>
          </CardFooter>
        </Card>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur border-dashed">
          <CardHeader>
            <CardTitle>Manual Upload</CardTitle>
            <CardDescription>Upload photos of a property to get an instant report</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" className="w-full border-muted-foreground/30 hover:bg-muted" size="lg" onClick={handleManualUpload}>
              Upload Photos
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
