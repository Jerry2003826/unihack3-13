import { createHmac, createHash } from "node:crypto";
import { appEnv, hasSpacesConfig } from "@/lib/env";
import { withTimeout } from "@/lib/http";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getSpacesHost() {
  if (!hasSpacesConfig()) {
    throw new Error("DigitalOcean Spaces is not configured.");
  }

  const endpoint = new URL(appEnv.spacesEndpoint!);
  if (endpoint.hostname.startsWith(`${appEnv.spacesBucket}.`)) {
    return endpoint.hostname;
  }

  return `${appEnv.spacesBucket}.${endpoint.hostname}`;
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function deriveSigningKey(dateStamp: string) {
  const kDate = hmac(`AWS4${appEnv.spacesSecret!}`, dateStamp);
  const kRegion = hmac(kDate, appEnv.spacesRegion!);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

export function buildManualObjectKey(inspectionId: string, contentType: string) {
  const extension = EXTENSIONS[contentType] ?? "jpg";
  const date = new Date().toISOString().slice(0, 10);
  return `raw/manual/${date}/${inspectionId}/${crypto.randomUUID()}.${extension}`;
}

export function buildDerivedThumbnailObjectKey(inspectionId: string, hazardId: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `derived/manual/${date}/${inspectionId}/${hazardId}.jpg`;
}

export function createSignedObjectUrl(args: {
  method: "GET" | "PUT";
  objectKey: string;
  expiresInSeconds?: number;
  contentType?: string;
}) {
  if (!hasSpacesConfig()) {
    throw new Error("DigitalOcean Spaces is not configured.");
  }

  const host = getSpacesHost();
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${appEnv.spacesRegion}/s3/aws4_request`;
  const pathname = `/${encodePath(args.objectKey)}`;

  const signedHeaders = args.contentType ? "content-type;host" : "host";
  const canonicalHeaders = args.contentType
    ? `content-type:${args.contentType}\nhost:${host}\n`
    : `host:${host}\n`;

  const queryEntries = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${appEnv.spacesKey}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(args.expiresInSeconds ?? 900)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ] as const;

  const canonicalQueryString = [...queryEntries]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const canonicalRequest = [
    args.method,
    pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");

  const signature = createHmac("sha256", deriveSigningKey(dateStamp)).update(stringToSign).digest("hex");
  const url = new URL(`https://${host}${pathname}`);
  url.search = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export async function fetchObjectAsBase64(objectKey: string) {
  const { bytes, mimeType } = await fetchObjectBytes(objectKey);
  return {
    base64: bytes.toString("base64"),
    mimeType,
  };
}

export async function fetchObjectBytes(objectKey: string) {
  const signedUrl = createSignedObjectUrl({
    method: "GET",
    objectKey,
    expiresInSeconds: 300,
  });

  const response = await withTimeout(() => fetch(signedUrl), 10_000);
  if (!response.ok) {
    throw new Error(`Failed to fetch object ${objectKey}: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    mimeType,
  };
}

export async function uploadObjectBytes(args: {
  objectKey: string;
  bytes: Buffer;
  contentType: string;
}) {
  const signedUrl = createSignedObjectUrl({
    method: "PUT",
    objectKey: args.objectKey,
    expiresInSeconds: 300,
    contentType: args.contentType,
  });

  const response = await withTimeout(
    () =>
      fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": args.contentType,
        },
        body: new Uint8Array(args.bytes),
      }),
    10_000
  );

  if (!response.ok) {
    throw new Error(`Failed to upload object ${args.objectKey}: ${response.status}`);
  }
}
