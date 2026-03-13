import { createErrorResponse, createOptionsResponse, ensureCrossOriginAllowed, getRequestId } from "@/lib/http";
import { readLocalObject, writeLocalObject } from "@/lib/localStorage";

function getObjectKey(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("objectKey")?.trim() ?? "";
}

export const runtime = "nodejs";
export const maxDuration = 15;

export async function OPTIONS(request: Request) {
  return createOptionsResponse(request);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const cors = ensureCrossOriginAllowed(request, requestId);
  if (cors.response) {
    return cors.response;
  }

  try {
    const objectKey = getObjectKey(request);
    if (!objectKey) {
      return createErrorResponse({
        code: "invalid_request",
        message: "objectKey is required.",
        origin: cors.origin,
        requestId,
        status: 400,
      });
    }

    const object = await readLocalObject(objectKey);
    const headers = new Headers();
    headers.set("Content-Type", object.mimeType);
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("X-Request-Id", requestId);
    if (cors.origin) {
      headers.set("Access-Control-Allow-Origin", cors.origin);
      headers.set("Vary", "Origin");
    }

    return new Response(object.bytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    return createErrorResponse({
      code: "object_not_found",
      message: "Local object not found.",
      details: error instanceof Error ? error.message : String(error),
      origin: cors.origin,
      requestId,
      status: 404,
    });
  }
}

export async function PUT(request: Request) {
  const requestId = getRequestId(request);
  const cors = ensureCrossOriginAllowed(request, requestId);
  if (cors.response) {
    return cors.response;
  }

  try {
    const objectKey = getObjectKey(request);
    if (!objectKey) {
      return createErrorResponse({
        code: "invalid_request",
        message: "objectKey is required.",
        origin: cors.origin,
        requestId,
        status: 400,
      });
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    await writeLocalObject({
      objectKey,
      bytes,
    });

    const headers = new Headers();
    headers.set("X-Request-Id", requestId);
    headers.set("Cache-Control", "private, no-store");
    if (cors.origin) {
      headers.set("Access-Control-Allow-Origin", cors.origin);
      headers.set("Vary", "Origin");
    }

    return new Response(null, {
      status: 200,
      headers,
    });
  } catch (error) {
    return createErrorResponse({
      code: "object_write_failed",
      message: "Failed to store local object.",
      details: error instanceof Error ? error.message : String(error),
      origin: cors.origin,
      requestId,
      status: 500,
    });
  }
}
