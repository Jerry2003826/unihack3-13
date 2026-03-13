import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { ReportSnapshot } from "@inspect-ai/contracts";

interface InspectDB extends DBSchema {
  report_snapshots: {
    key: string;
    value: ReportSnapshot;
    indexes: {
      "by-created-at": number;
    };
  };
}

const DB_NAME = "inspect-ai-db";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "report_snapshots";
const MAX_SNAPSHOTS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let dbPromise: Promise<IDBPDatabase<InspectDB>> | null = null;
const inMemorySnapshots = new Map<string, ReportSnapshot>();

function getPersistedSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  return {
    ...snapshot,
    exportAssets: snapshot.exportAssets
      ? {
          ...snapshot.exportAssets,
          staticMapImageBase64: undefined,
        }
      : undefined,
  };
}

function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<InspectDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "reportId" });
          store.createIndex("by-created-at", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

export async function saveReportSnapshot(snapshot: ReportSnapshot): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    inMemorySnapshots.set(snapshot.reportId, snapshot);
    await (await db).put(SNAPSHOT_STORE, getPersistedSnapshot(snapshot));
    // Asynchronously cleanup old records without blocking this save
    deleteExpiredSnapshots().catch(console.error);
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      try {
        await deleteExpiredSnapshots();
        await (await db).put(SNAPSHOT_STORE, getPersistedSnapshot(snapshot));
        return;
      } catch (retryError) {
        console.error("Failed to retry report snapshot save after cleanup.", retryError);
      }
    }

    console.error("Failed to save report snapshot.", e);
  }
}

export async function getReportSnapshot(reportId: string): Promise<ReportSnapshot | undefined> {
  const inMemory = inMemorySnapshots.get(reportId);
  if (inMemory) {
    return inMemory;
  }
  const db = getDB();
  if (!db) return undefined;
  return (await db).get(SNAPSHOT_STORE, reportId);
}

export async function updateReportSnapshot(reportId: string, patch: Partial<ReportSnapshot>): Promise<void> {
  const db = getDB();
  if (!db) return;
  const existing = await getReportSnapshot(reportId);
  if (!existing) return;
  const nextSnapshot = { ...existing, ...patch };
  inMemorySnapshots.set(reportId, nextSnapshot);
  await (await db).put(SNAPSHOT_STORE, getPersistedSnapshot(nextSnapshot));
}

export async function deleteExpiredSnapshots(): Promise<void> {
  const db = getDB();
  if (!db) return;
  
  try {
    const database = await db;
    // We use a transaction to do read and write operations consistently
    const tx = database.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const index = store.index("by-created-at");

    // 1. Delete by age > 7 days
    const now = Date.now();
    const cutoff = now - MAX_AGE_MS;
    
    // IDBKeyRange.upperBound includes everything up to cutoff
    let oldCursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    while (oldCursor) {
      await oldCursor.delete();
      oldCursor = await oldCursor.continue();
    }

    // 2. Delete by count > 20
    const count = await store.count();
    if (count > MAX_SNAPSHOTS) {
      // index is ordered by createdAt ascending (oldest first)
      let countToDelete = count - MAX_SNAPSHOTS;
      let freshCursor = await index.openCursor();
      while (freshCursor && countToDelete > 0) {
        await freshCursor.delete();
        freshCursor = await freshCursor.continue();
        countToDelete--;
      }
    }

    await tx.done;
  } catch (e) {
    console.error("Failed to delete expired snapshots", e);
  }
}
