"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSearchHistory } from "@/lib/history/historyStore";
import { requestCurrentLocation, reverseGeocodeCoordinates } from "@/lib/location";
import { useSessionStore } from "@/store/useSessionStore";
import { useHazardStore } from "@/store/useHazardStore";
import { FallbackTrigger } from "@/components/shared/FallbackTrigger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { AsyncStatus, GeoPoint } from "@inspect-ai/contracts";

export default function HomePage() {
  const router = useRouter();
  const { address: draftAddress, agency: draftAgency, coordinates: draftCoordinates, askingRent: draftAskingRent, beginInspection, prepareManualMode, updateInspectionDraft } =
    useSessionStore();
  const { resetForNewInspection } = useHazardStore();

  const [address, setAddress] = useState(draftAddress);
  const [agency, setAgency] = useState(draftAgency);
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(draftCoordinates);
  const [askingRent, setAskingRent] = useState(typeof draftAskingRent === "number" ? String(draftAskingRent) : "");
  const [locationStatus, setLocationStatus] = useState<AsyncStatus>("idle");
  const [isManualAddressOpen, setIsManualAddressOpen] = useState(false);

  const hasAddress = address.trim().length > 0;
  const locationBadge =
    locationStatus === "success"
      ? { label: "Resolved", variant: "default" as const }
      : locationStatus === "fallback"
        ? { label: "Fallback", variant: "secondary" as const }
        : locationStatus === "error"
          ? { label: "Error", variant: "destructive" as const }
          : null;

  const handleStartLiveScan = async () => {
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
      coordinates,
      askingRent: askingRent ? Number(askingRent) : null,
    });
    resetForNewInspection();
    await saveSearchHistory({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      type: "live",
      label: `${address.trim()} · ${agency.trim()}`,
      payload: {
        address: address.trim(),
        agency: agency.trim(),
        coordinates: coordinates || undefined,
      },
    });
    router.push("/radar");
  };

  const handleManualUpload = () => {
    prepareManualMode();
    resetForNewInspection();
    updateInspectionDraft({
      address: address.trim(),
      agency: agency.trim(),
      coordinates,
      askingRent: askingRent ? Number(askingRent) : null,
    });
    router.push("/manual");
  };

  const handleUseCurrentLocation = async () => {
    setLocationStatus("loading");
    try {
      const nextCoordinates = await requestCurrentLocation();
      const geocoded = await reverseGeocodeCoordinates(nextCoordinates);
      setCoordinates(nextCoordinates);
      setAddress(geocoded.formattedAddress);
      setIsManualAddressOpen(false);
      setLocationStatus(geocoded.provider === "fallback" ? "fallback" : "success");
      toast.success("Address filled from current location.");
    } catch (error) {
      setIsManualAddressOpen(true);
      setLocationStatus("error");
      toast.error(error instanceof Error ? error.message : "Failed to resolve current location.");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4">
      <FallbackTrigger />

      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-accent">Inspect.AI</h1>
          <p className="text-muted-foreground">Rental property risk scanner & decision assistant</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/compare")}>
              Saved Reports / Compare
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/history")}>
              Search History
            </Button>
          </div>
        </div>

        <Card className="border-accent/20 shadow-lg shadow-accent/5">
          <CardHeader>
            <CardTitle>Live Inspection</CardTitle>
            <CardDescription>Scan a property in real-time during an inspection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground/90">Property Address</span>
                {locationBadge ? <Badge variant={locationBadge.variant}>{locationBadge.label}</Badge> : null}
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={handleUseCurrentLocation}
                    type="button"
                    disabled={locationStatus === "loading"}
                  >
                    {locationStatus === "loading"
                      ? "Locating..."
                      : hasAddress
                        ? "Refresh Current Location"
                        : "Use Current Location"}
                  </Button>
                  {hasAddress ? (
                    <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {locationStatus === "success" || locationStatus === "fallback" ? "Resolved Address" : "Saved Address"}
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">{address}</p>
                      {coordinates ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Tap once to use your current location and auto-fill the property address.
                    </p>
                  )}
                  {locationStatus === "error" ? (
                    <p className="text-xs text-destructive">
                      We could not access your current location. Enter the address manually below.
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsManualAddressOpen((open) => !open)}
                      type="button"
                      className="h-auto justify-start px-0 text-sm"
                    >
                      {isManualAddressOpen
                        ? "Hide manual address entry"
                        : hasAddress
                          ? "Edit address manually"
                          : "Enter address manually"}
                    </Button>
                    {isManualAddressOpen ? (
                      <Input
                        id="address"
                        aria-label="Property Address"
                        placeholder="e.g. 15 Dandenong Rd, Clayton"
                        value={address}
                        onChange={(e) => {
                          setAddress(e.target.value);
                          if (locationStatus !== "loading") {
                            setLocationStatus("idle");
                          }
                        }}
                        className="bg-background focus-visible:ring-accent"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
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
            <div className="space-y-2">
              <label htmlFor="asking-rent" className="text-sm font-medium text-foreground/90">Weekly Rent (Optional)</label>
              <Input
                id="asking-rent"
                inputMode="numeric"
                placeholder="e.g. 620"
                value={askingRent}
                onChange={(e) => setAskingRent(e.target.value.replace(/[^\d]/g, ""))}
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
