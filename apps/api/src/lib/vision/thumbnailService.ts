import type { AnalyzeRequest, AnalyzeResponse, Hazard } from "@inspect-ai/contracts";
import { Jimp } from "jimp";
import { hasSpacesConfig } from "@/lib/env";
import {
  buildDerivedThumbnailObjectKey,
  fetchObjectBytes,
  uploadObjectBytes,
} from "@/lib/spaces";

const THUMBNAIL_WIDTH = 448;
const THUMBNAIL_HEIGHT = 336;
const THUMBNAIL_MIME = "image/jpeg";

type ExportAssets = AnalyzeResponse["exportAssets"];

function resolveInspectionId(request: AnalyzeRequest) {
  if (request.inspectionId) {
    return request.inspectionId;
  }

  const objectKey = request.objectKeys?.[0];
  if (!objectKey) {
    return null;
  }

  const segments = objectKey.split("/");
  return segments.length >= 5 ? segments[3] : null;
}

function getSourceObjectKey(args: {
  request: AnalyzeRequest;
  hazardIndex: number;
}) {
  const objectKeys = args.request.objectKeys;
  if (!objectKeys?.length) {
    return null;
  }

  return objectKeys[args.hazardIndex % objectKeys.length] ?? objectKeys[0];
}

async function renderThumbnail(args: {
  objectKey: string;
  hazard: Hazard;
}) {
  const source = await fetchObjectBytes(args.objectKey);
  const image = await Jimp.read(source.bytes);

  if (args.hazard.boundingBox) {
    const x = Math.max(0, Math.floor(args.hazard.boundingBox.x_min * image.bitmap.width));
    const y = Math.max(0, Math.floor(args.hazard.boundingBox.y_min * image.bitmap.height));
    const w = Math.max(1, Math.floor((args.hazard.boundingBox.x_max - args.hazard.boundingBox.x_min) * image.bitmap.width));
    const h = Math.max(1, Math.floor((args.hazard.boundingBox.y_max - args.hazard.boundingBox.y_min) * image.bitmap.height));

    image.crop({
      x,
      y,
      w: Math.min(w, image.bitmap.width - x),
      h: Math.min(h, image.bitmap.height - y),
    });
  }

  image.cover({
    w: THUMBNAIL_WIDTH,
    h: THUMBNAIL_HEIGHT,
  });

  return Buffer.from(await image.getBuffer(THUMBNAIL_MIME));
}

export async function deriveHazardThumbnails(args: {
  request: AnalyzeRequest;
  hazards: Hazard[];
}): Promise<ExportAssets | undefined> {
  if (args.request.source !== "manual" || !args.request.objectKeys?.length || !args.hazards.length || !hasSpacesConfig()) {
    return undefined;
  }

  const inspectionId = resolveInspectionId(args.request);
  if (!inspectionId) {
    return undefined;
  }

  const hazardThumbnails = await Promise.all(
    args.hazards.map(async (hazard, hazardIndex) => {
      const objectKey = getSourceObjectKey({
        request: args.request,
        hazardIndex,
      });

      if (!objectKey) {
        return null;
      }

      const derivedThumbnailObjectKey = buildDerivedThumbnailObjectKey(inspectionId, hazard.id);
      const bytes = await renderThumbnail({
        objectKey,
        hazard,
      });

      await uploadObjectBytes({
        objectKey: derivedThumbnailObjectKey,
        bytes,
        contentType: THUMBNAIL_MIME,
      });

      return {
        hazardId: hazard.id,
        derivedThumbnailObjectKey,
      };
    })
  );

  const normalized = hazardThumbnails.filter(
    (item): item is NonNullable<typeof item> => Boolean(item)
  );
  if (!normalized.length) {
    return undefined;
  }

  return {
    hazardThumbnails: normalized,
  };
}
