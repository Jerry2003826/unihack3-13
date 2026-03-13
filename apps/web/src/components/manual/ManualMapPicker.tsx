"use client";

import { useState } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { publicAppConfig } from "@/lib/config/public";
import type { GeoPoint } from "@inspect-ai/contracts";

interface ManualMapPickerProps {
  onLocationSelect: (loc: GeoPoint) => void;
  initialLocation?: GeoPoint | null;
}

interface MapClickEvent {
  detail: {
    latLng?: {
      lat: number;
      lng: number;
    };
  };
}

const DEFAULT_CENTER = { lat: -37.8136, lng: 144.9631 }; // Melbourne

export function ManualMapPicker({ onLocationSelect, initialLocation }: ManualMapPickerProps) {
  const [markerPos, setMarkerPos] = useState<GeoPoint | null>(initialLocation || null);

  const handleMapClick = (e: MapClickEvent) => {
    if (e.detail.latLng) {
      const newPos = { lat: e.detail.latLng.lat, lng: e.detail.latLng.lng };
      setMarkerPos(newPos);
      onLocationSelect(newPos);
    }
  };

  const apiKey = publicAppConfig.googleMapsApiKey;
  
  if (!apiKey) {
    return (
      <div className="w-full h-48 rounded-md border border-dashed flex items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground w-4/5 text-center">
          Google Maps API key is missing. Ensure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured. 
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-48 rounded-md overflow-hidden border mt-1">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={initialLocation || DEFAULT_CENTER}
          defaultZoom={13}
          mapId="INSPECT_AI_PICKER"
          onClick={handleMapClick}
          disableDefaultUI={true}
          gestureHandling="greedy"
        >
          {markerPos && <AdvancedMarker position={markerPos} />}
        </Map>
      </APIProvider>
    </div>
  );
}
