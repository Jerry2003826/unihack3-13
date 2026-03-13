import type { BoundingBox } from "@inspect-ai/contracts";

export async function createLiveHazardThumbnail(args: {
  frameDataUrl: string;
  boundingBox?: BoundingBox;
}) {
  if (typeof window === "undefined" || !args.frameDataUrl) {
    return undefined;
  }

  return await new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(undefined);
        return;
      }

      const bbox = args.boundingBox;
      const sourceX = bbox ? Math.max(0, Math.floor(bbox.x_min * image.width)) : 0;
      const sourceY = bbox ? Math.max(0, Math.floor(bbox.y_min * image.height)) : 0;
      const sourceWidth = bbox
        ? Math.max(32, Math.floor((bbox.x_max - bbox.x_min) * image.width))
        : image.width;
      const sourceHeight = bbox
        ? Math.max(32, Math.floor((bbox.y_max - bbox.y_min) * image.height))
        : image.height;

      canvas.width = 240;
      canvas.height = 160;
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => resolve(undefined);
    image.src = args.frameDataUrl;
  });
}
