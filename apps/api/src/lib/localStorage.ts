import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const STORAGE_ROOT = resolve(process.cwd(), ".local-storage");
const ALLOWED_PREFIXES = ["raw/", "derived/"];

function ensureAllowedObjectKey(objectKey: string) {
  const normalized = objectKey.replace(/^\/+/, "");
  if (!ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) || normalized.includes("..")) {
    throw new Error("Unsupported object key.");
  }

  return normalized;
}

function inferMimeType(objectKey: string) {
  switch (extname(objectKey).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

function getObjectPath(objectKey: string) {
  return resolve(STORAGE_ROOT, ensureAllowedObjectKey(objectKey));
}

export async function writeLocalObject(args: {
  objectKey: string;
  bytes: Uint8Array | Buffer;
}) {
  const filePath = getObjectPath(args.objectKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, args.bytes);
}

export async function readLocalObject(objectKey: string) {
  const filePath = getObjectPath(objectKey);
  const bytes = await readFile(filePath);
  return {
    bytes,
    mimeType: inferMimeType(objectKey),
  };
}

export function buildLocalObjectUrl(args: {
  requestUrl: string;
  objectKey: string;
}) {
  const url = new URL("/api/storage/object", args.requestUrl);
  url.searchParams.set("objectKey", ensureAllowedObjectKey(args.objectKey));
  return url.toString();
}
