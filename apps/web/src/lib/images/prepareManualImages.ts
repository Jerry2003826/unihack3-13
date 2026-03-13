import imageCompression from "browser-image-compression";
import exifr from "exifr";
import type { GeoPoint } from "@inspect-ai/contracts";

export interface PreparedImage {
  file: File;
  previewUrl: string;
  metadata?: GeoPoint | null;
}

export async function prepareManualImages(files: File[]): Promise<PreparedImage[]> {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  };

  const prepared = await Promise.all(
    files.map(async (file) => {
      let metadata: GeoPoint | null = null;
      try {
        // Try to extract EXIF GPS before compression strips it
        const gps = await exifr.gps(file);
        if (gps && gps.latitude && gps.longitude) {
          metadata = { lat: gps.latitude, lng: gps.longitude };
        }
      } catch {
        console.warn("Could not extract EXIF data from image:", file.name);
      }

      // Compress the image (often strips metadata)
      const compressedFile = await imageCompression(file, options);
      
      return {
        file: compressedFile,
        previewUrl: URL.createObjectURL(compressedFile),
        metadata,
      };
    })
  );

  return prepared;
}
