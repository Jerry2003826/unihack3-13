import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReportSnapshot } from "@inspect-ai/contracts";
import {
  deleteExpiredSnapshots,
  getReportSnapshot,
  saveReportSnapshot,
  updateReportSnapshot,
} from "./reportSnapshotStore";

const DB_NAME = "inspect-ai-db";
const SNAPSHOT_STORE = "report_snapshots";

async function openSnapshotDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "reportId" });
        store.createIndex("by-created-at", "createdAt");
      }
    },
  });
}

async function resetSnapshotStore() {
  const db = await openSnapshotDb();
  const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
  await tx.objectStore(SNAPSHOT_STORE).clear();
  await tx.done;
  db.close();
}

async function readStoredSnapshot(reportId: string) {
  const db = await openSnapshotDb();
  const snapshot = await db.get(SNAPSHOT_STORE, reportId);
  db.close();
  return snapshot as ReportSnapshot | undefined;
}

function createSnapshot(partial?: Partial<ReportSnapshot>): ReportSnapshot {
  return {
    reportId: partial?.reportId ?? crypto.randomUUID(),
    inspectionId: partial?.inspectionId ?? crypto.randomUUID(),
    createdAt: partial?.createdAt ?? Date.now(),
    inputs: {
      mode: partial?.inputs?.mode ?? "manual",
      address: partial?.inputs?.address ?? "15 Dandenong Rd, Clayton VIC 3168",
      agency: partial?.inputs?.agency ?? "Ray White Clayton",
      coordinates: partial?.inputs?.coordinates,
      propertyNotes: partial?.inputs?.propertyNotes,
      targetDestinations: partial?.inputs?.targetDestinations,
      preferenceProfile: partial?.inputs?.preferenceProfile,
    },
    hazards: partial?.hazards ?? [],
    intelligence: partial?.intelligence,
    propertyRiskScore: partial?.propertyRiskScore ?? 80,
    recommendation: partial?.recommendation,
    fitScore: partial?.fitScore,
    inspectionCoverage: partial?.inspectionCoverage,
    evidenceSummary: partial?.evidenceSummary,
    preLeaseActionGuide: partial?.preLeaseActionGuide,
    exportAssets: partial?.exportAssets,
  };
}

describe("reportSnapshotStore", () => {
  beforeEach(async () => {
    await resetSnapshotStore();
  });

  it("saves and reloads a report snapshot", async () => {
    const snapshot = createSnapshot();

    await saveReportSnapshot(snapshot);

    await expect(getReportSnapshot(snapshot.reportId)).resolves.toEqual(snapshot);
  });

  it("strips static map image data before persisting to disk", async () => {
    const snapshot = createSnapshot({
      exportAssets: {
        staticMapImageBase64: "data:image/png;base64,AAA",
        hazardThumbnails: [{ hazardId: "haz-1", base64: "BBB" }],
      },
    });

    await saveReportSnapshot(snapshot);

    const stored = await readStoredSnapshot(snapshot.reportId);
    expect(stored?.exportAssets?.staticMapImageBase64).toBeUndefined();
    expect(stored?.exportAssets?.hazardThumbnails).toEqual([{ hazardId: "haz-1", base64: "BBB" }]);
  });

  it("updates an existing snapshot with a patch", async () => {
    const snapshot = createSnapshot({ propertyRiskScore: 65 });
    await saveReportSnapshot(snapshot);

    await updateReportSnapshot(snapshot.reportId, {
      propertyRiskScore: 42,
      recommendation: {
        outcome: "Negotiate",
        summary: "Need better lease terms",
        reasons: ["Visible repairs required"],
      },
    });

    const updated = await getReportSnapshot(snapshot.reportId);
    expect(updated?.propertyRiskScore).toBe(42);
    expect(updated?.recommendation?.outcome).toBe("Negotiate");
  });

  it("removes expired and excess snapshots during cleanup", async () => {
    const now = Date.now();

    for (let index = 0; index < 24; index += 1) {
      await saveReportSnapshot(
        createSnapshot({
          reportId: `report-${index}`,
          createdAt: now - index * 24 * 60 * 60 * 1000,
        })
      );
    }

    await deleteExpiredSnapshots();

    const db = await openSnapshotDb();
    const count = await db.count(SNAPSHOT_STORE);
    const expired = await db.get(SNAPSHOT_STORE, "report-10");
    db.close();

    expect(count).toBeLessThanOrEqual(20);
    expect(expired).toBeUndefined();
  });
});
