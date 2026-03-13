import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { publicAppConfig } from "@/lib/config/public";
import type {
  InspectionMode,
  GeoPoint,
  DestinationPoint,
  InspectionChecklist,
  PreferenceProfile,
  PropertyIntelligence,
} from "@inspect-ai/contracts";

interface BeginInspectionArgs {
  mode: InspectionMode;
  address?: string;
  agency?: string;
  listingUrl?: string;
  coordinates?: GeoPoint | null;
  targetDestinations?: DestinationPoint[];
  preferenceProfile?: PreferenceProfile | null;
  propertyNotes?: string;
  inspectionChecklist?: InspectionChecklist | null;
  askingRent?: number | null;
}

interface ManualSubmissionContext {
  inspectionId: string;
  objectKeys: string[];
  derivedThumbnailObjectKeys?: Record<string, string>;
}

interface SessionState {
  inspectionId: string | null;
  inspectionMode: InspectionMode;
  address: string;
  agency: string;
  listingUrl: string;
  coordinates: GeoPoint | null;
  targetDestinations: DestinationPoint[];
  preferenceProfile: PreferenceProfile | null;
  propertyNotes: string;
  inspectionChecklist: InspectionChecklist | null;
  askingRent: number | null;
  reportId: string | null;
  isDemoMode: boolean;
  intelligence: PropertyIntelligence | null;
  manualSubmissionContext: ManualSubmissionContext | null;

  // Actions
  beginInspection: (args: BeginInspectionArgs) => void;
  updateInspectionDraft: (args: Partial<BeginInspectionArgs>) => void;
  prepareManualMode: () => void;
  setIsDemoMode: (isDemoMode: boolean) => void;
  setIntelligence: (intelligence: PropertyIntelligence) => void;
  setReportId: (reportId: string | null) => void;
  resetInspectionArtifacts: () => void;
  setManualSubmissionContext: (context: ManualSubmissionContext | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      inspectionId: null,
      inspectionMode: "live",
      address: "",
      agency: "",
      listingUrl: "",
      coordinates: null,
      targetDestinations: [],
      preferenceProfile: null,
      propertyNotes: "",
      inspectionChecklist: null,
      askingRent: null,
      reportId: null,
      isDemoMode: false,
      intelligence: null,
      manualSubmissionContext: null,

      beginInspection: (args) =>
        set((state) => ({
          ...state,
          inspectionId: crypto.randomUUID(),
          inspectionMode: args.mode,
          address: args.address || "",
          agency: args.agency || "",
          listingUrl: args.listingUrl || "",
          coordinates: args.coordinates || null,
          targetDestinations: args.targetDestinations || [],
          preferenceProfile: args.preferenceProfile || null,
          propertyNotes: args.propertyNotes || "",
          inspectionChecklist: args.inspectionChecklist ?? null,
          askingRent: args.askingRent ?? null,
          reportId: null,
          intelligence: null,
          manualSubmissionContext: null,
        })),

      updateInspectionDraft: (args) =>
        set((state) => ({
          ...state,
          inspectionMode: args.mode ?? state.inspectionMode,
          address: args.address ?? state.address,
          agency: args.agency ?? state.agency,
          listingUrl: args.listingUrl ?? state.listingUrl,
          coordinates: args.coordinates === undefined ? state.coordinates : args.coordinates,
          targetDestinations: args.targetDestinations ?? state.targetDestinations,
          preferenceProfile: args.preferenceProfile === undefined ? state.preferenceProfile : args.preferenceProfile,
          propertyNotes: args.propertyNotes ?? state.propertyNotes,
          inspectionChecklist:
            args.inspectionChecklist === undefined ? state.inspectionChecklist : args.inspectionChecklist,
          askingRent: args.askingRent === undefined ? state.askingRent : args.askingRent,
        })),

      prepareManualMode: () =>
        set((state) => ({
          ...state,
          inspectionMode: "manual",
          reportId: null,
          intelligence: null,
          manualSubmissionContext: null,
        })),

      setIsDemoMode: (isDemoMode) =>
        set({ isDemoMode: publicAppConfig.demoModeEnabled ? isDemoMode : false }),

      setIntelligence: (intelligence) => set({ intelligence }),

      setReportId: (reportId) => set({ reportId }),

      setManualSubmissionContext: (context) => set({ manualSubmissionContext: context }),

      resetInspectionArtifacts: () =>
        set({
          reportId: null,
          intelligence: null,
          manualSubmissionContext: null,
        }),
    }),
    {
      name: "inspect-session-storage",
      storage: createJSONStorage(() => sessionStorage),
      version: 2,
      partialize: (state) => ({
        inspectionId: state.inspectionId,
        inspectionMode: state.inspectionMode,
        address: state.address,
        agency: state.agency,
        listingUrl: state.listingUrl,
        coordinates: state.coordinates,
        targetDestinations: state.targetDestinations,
        preferenceProfile: state.preferenceProfile,
        propertyNotes: state.propertyNotes,
        inspectionChecklist: state.inspectionChecklist,
        askingRent: state.askingRent,
        reportId: state.reportId,
        isDemoMode: publicAppConfig.demoModeEnabled ? state.isDemoMode : false,
      }),
    }
  )
);
