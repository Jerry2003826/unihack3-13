import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ComparisonHistoryEntry, ComparisonReportSnapshot, SearchHistoryEntry } from "@inspect-ai/contracts";

interface InspectHistoryDB extends DBSchema {
  search_history: {
    key: string;
    value: SearchHistoryEntry;
    indexes: {
      "by-created-at": number;
    };
  };
  comparison_reports: {
    key: string;
    value: ComparisonHistoryEntry;
    indexes: {
      "by-created-at": number;
    };
  };
}

const DB_NAME = "inspect-ai-history-db";
const DB_VERSION = 1;
const MAX_ITEMS = 24;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase<InspectHistoryDB>> | null = null;
const inMemorySearchHistory = new Map<string, SearchHistoryEntry>();
const inMemoryComparisonReports = new Map<string, ComparisonReportSnapshot>();

function getDB() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB<InspectHistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("search_history")) {
          const store = db.createObjectStore("search_history", { keyPath: "id" });
          store.createIndex("by-created-at", "createdAt");
        }

        if (!db.objectStoreNames.contains("comparison_reports")) {
          const store = db.createObjectStore("comparison_reports", { keyPath: "comparisonId" });
          store.createIndex("by-created-at", "createdAt");
        }
      },
    });
  }

  return dbPromise;
}

async function pruneStore(storeName: "search_history" | "comparison_reports") {
  const db = getDB();
  if (!db) {
    return;
  }

  const database = await db;
  const tx = database.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const index = store.index("by-created-at");
  const cutoff = Date.now() - MAX_AGE_MS;

  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  const count = await store.count();
  let toDelete = count - MAX_ITEMS;

  if (toDelete > 0) {
    let oldest = await index.openCursor();
    while (oldest && toDelete > 0) {
      await oldest.delete();
      oldest = await oldest.continue();
      toDelete -= 1;
    }
  }

  await tx.done;
}

export async function saveSearchHistory(entry: SearchHistoryEntry) {
  const db = getDB();
  if (!db) {
    return;
  }

  inMemorySearchHistory.set(entry.id, entry);
  await (await db).put("search_history", entry);
  void pruneStore("search_history");
}

export async function listSearchHistory(limit = 12) {
  const db = getDB();
  if (!db) {
    return [...inMemorySearchHistory.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit);
  }

  const items = await (await db).getAllFromIndex("search_history", "by-created-at");
  const combined = new Map<string, SearchHistoryEntry>();
  for (const entry of items) {
    combined.set(entry.id, entry);
  }
  for (const entry of inMemorySearchHistory.values()) {
    combined.set(entry.id, entry);
  }

  return [...combined.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, limit);
}

export async function saveComparisonReport(report: ComparisonReportSnapshot) {
  const db = getDB();
  if (!db) {
    return;
  }

  inMemoryComparisonReports.set(report.comparisonId, report);
  await (await db).put("comparison_reports", {
    comparisonId: report.comparisonId,
    createdAt: report.createdAt,
    report,
  });
  void pruneStore("comparison_reports");
}

export async function getComparisonReport(comparisonId: string) {
  const inMemory = inMemoryComparisonReports.get(comparisonId);
  if (inMemory) {
    return inMemory;
  }

  const db = getDB();
  if (!db) {
    return undefined;
  }

  const entry = await (await db).get("comparison_reports", comparisonId);
  return entry?.report;
}

export async function listComparisonReports(limit = 12) {
  const db = getDB();
  if (!db) {
    return [...inMemoryComparisonReports.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map((report) => ({
        comparisonId: report.comparisonId,
        createdAt: report.createdAt,
        report,
      }));
  }

  const items = await (await db).getAllFromIndex("comparison_reports", "by-created-at");
  const combined = new Map<string, ComparisonHistoryEntry>();
  for (const entry of items) {
    combined.set(entry.comparisonId, entry);
  }
  for (const report of inMemoryComparisonReports.values()) {
    combined.set(report.comparisonId, {
      comparisonId: report.comparisonId,
      createdAt: report.createdAt,
      report,
    });
  }

  return [...combined.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, limit);
}
