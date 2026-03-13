import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "./page";
import { useSessionStore } from "@/store/useSessionStore";
import { useHazardStore } from "@/store/useHazardStore";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  requestCurrentLocation: vi.fn(),
  reverseGeocodeCoordinates: vi.fn(),
  useChecklistPrefill: vi.fn(),
  useListingDiscovery: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock("@/lib/location", () => ({
  requestCurrentLocation: mocks.requestCurrentLocation,
  reverseGeocodeCoordinates: mocks.reverseGeocodeCoordinates,
}));

vi.mock("@/hooks/useChecklistPrefill", () => ({
  useChecklistPrefill: mocks.useChecklistPrefill,
}));

vi.mock("@/hooks/useListingDiscovery", () => ({
  useListingDiscovery: mocks.useListingDiscovery,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@/components/shared/FallbackTrigger", () => ({
  FallbackTrigger: () => null,
}));

describe("HomePage address interaction", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.push.mockReset();
    mocks.requestCurrentLocation.mockReset();
    mocks.reverseGeocodeCoordinates.mockReset();
    mocks.useChecklistPrefill.mockReset();
    mocks.useListingDiscovery.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.useChecklistPrefill.mockReturnValue({
      status: "idle",
      summary: "",
      autoFilledFieldKeys: [],
      markFieldAsManual: vi.fn(),
      retry: vi.fn(),
    });
    mocks.useListingDiscovery.mockReturnValue({
      status: "idle",
      summary: "",
      candidates: [],
      retry: vi.fn(),
    });

    useSessionStore.setState({
      inspectionId: null,
      inspectionMode: "live",
      address: "",
      agency: "",
      listingUrl: "",
      coordinates: null,
      targetDestinations: [],
      preferenceProfile: null,
      propertyNotes: "",
      askingRent: null,
      reportId: null,
      isDemoMode: false,
      intelligence: null,
      manualSubmissionContext: null,
    });
    useHazardStore.setState({
      hazards: [],
      scanPhase: "idle",
      currentFrame: null,
      isAnalyzing: false,
      lastSpeechAt: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows location button first and keeps manual input collapsed by default", () => {
    render(React.createElement(HomePage));

    expect(screen.getByRole("button", { name: /use current location/i })).toBeVisible();
    expect(screen.getByText(/tap once to use your current location/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /enter address manually/i })).toBeVisible();
    expect(screen.queryByPlaceholderText(/15 dandenong rd, clayton/i)).not.toBeInTheDocument();
  });

  it("expands manual address entry on demand", () => {
    render(React.createElement(HomePage));

    fireEvent.click(screen.getByRole("button", { name: /enter address manually/i }));

    expect(screen.getByLabelText(/property address/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /hide manual address entry/i })).toBeVisible();
  });

  it("fills and summarizes the address from current location", async () => {
    mocks.requestCurrentLocation.mockResolvedValue({ lat: -37.9156, lng: 145.1234 });
    mocks.reverseGeocodeCoordinates.mockResolvedValue({
      formattedAddress: "15 Dandenong Rd, Clayton VIC 3168",
      provider: "google-geocoding",
      components: {
        locality: "Clayton",
      },
    });

    render(React.createElement(HomePage));

    fireEvent.click(screen.getByRole("button", { name: /use current location/i }));

    await waitFor(() => {
      expect(screen.getByText("Resolved")).toBeVisible();
    });
    expect(screen.getByText(/resolved address/i)).toBeVisible();
    expect(screen.getByText("15 Dandenong Rd, Clayton VIC 3168")).toBeVisible();
    expect(screen.getByText("-37.9156, 145.1234")).toBeVisible();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Address filled from current location.");
  });

  it("reveals manual entry guidance when current location fails", async () => {
    mocks.requestCurrentLocation.mockRejectedValue(new Error("Permission denied"));

    render(React.createElement(HomePage));

    fireEvent.click(screen.getByRole("button", { name: /use current location/i }));

    await waitFor(() => {
      expect(screen.getByText("Error")).toBeVisible();
    });
    expect(screen.getByText(/we could not access your current location/i)).toBeVisible();
    expect(screen.getByLabelText(/property address/i)).toBeVisible();
    expect(mocks.toastError).toHaveBeenCalledWith("Permission denied");
  });

  it("shows a saved draft address summary on initial render", () => {
    useSessionStore.setState({
      address: "44 Wellington Rd, Clayton VIC 3168",
      listingUrl: "",
      coordinates: { lat: -37.916, lng: 145.1491 },
    });

    render(React.createElement(HomePage));

    expect(screen.getByText(/saved address/i)).toBeVisible();
    expect(screen.getByText("44 Wellington Rd, Clayton VIC 3168")).toBeVisible();
    expect(screen.getByRole("button", { name: /refresh current location/i })).toBeVisible();
  });
});
