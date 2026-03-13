import type { StaticMapRequest, StaticMapResponse } from "@inspect-ai/contracts";
import { staticMapResponseSchema } from "@inspect-ai/contracts";
import { appEnv } from "@/lib/env";
import { withTimeout } from "@/lib/http";

function buildLabel(args: StaticMapRequest) {
  if (args.address?.trim()) {
    return args.address.trim();
  }

  if (args.coordinates) {
    return `${args.coordinates.lat.toFixed(4)}, ${args.coordinates.lng.toFixed(4)}`;
  }

  return "Unknown location";
}

function buildFallbackMap(args: StaticMapRequest): StaticMapResponse {
  const width = args.width ?? 640;
  const height = args.height ?? 360;
  const label = buildLabel(args);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#121826" />
          <stop offset="100%" stop-color="#090b12" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="24" fill="url(#bg)" />
      <path d="M0 ${height * 0.7} C ${width * 0.2} ${height * 0.55}, ${width * 0.4} ${height * 0.82}, ${width * 0.65} ${height * 0.62} S ${width * 0.9} ${height * 0.58}, ${width} ${height * 0.72}" stroke="rgba(61,220,255,0.25)" stroke-width="6" fill="none" />
      <circle cx="${width / 2}" cy="${height / 2 - 22}" r="18" fill="#3DDCFF" fill-opacity="0.18" stroke="#3DDCFF" stroke-width="3" />
      <circle cx="${width / 2}" cy="${height / 2 - 22}" r="7" fill="#3DDCFF" />
      <text x="50%" y="${height / 2 + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#E7ECF3">Static Map Unavailable</text>
      <text x="50%" y="${height / 2 + 58}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#95A0B7">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
    </svg>
  `;

  return staticMapResponseSchema.parse({
    staticMapImageBase64: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    provider: "fallback",
  });
}

function buildGoogleStaticMapUrl(args: StaticMapRequest) {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  const width = args.width ?? 640;
  const height = args.height ?? 360;
  const zoom = args.zoom ?? 15;
  const label = buildLabel(args);

  url.searchParams.set("size", `${width}x${height}`);
  url.searchParams.set("scale", "2");
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("key", appEnv.googleMapsApiKey!);
  url.searchParams.append("style", "feature:poi|visibility:off");
  url.searchParams.append("style", "feature:transit.station|visibility:simplified");

  if (args.coordinates) {
    const center = `${args.coordinates.lat},${args.coordinates.lng}`;
    url.searchParams.set("center", center);
    url.searchParams.set("markers", `color:0x3DDCFF|${center}`);
  } else if (args.address?.trim()) {
    url.searchParams.set("center", args.address.trim());
    url.searchParams.set("markers", `color:0x3DDCFF|${args.address.trim()}`);
  } else {
    url.searchParams.set("center", label);
  }

  return url;
}

export async function getStaticMapImage(args: StaticMapRequest): Promise<StaticMapResponse> {
  if (!appEnv.googleMapsApiKey || (!args.address && !args.coordinates)) {
    return buildFallbackMap(args);
  }

  try {
    const response = await withTimeout(
      () =>
        fetch(buildGoogleStaticMapUrl(args), {
          method: "GET",
          headers: {
            Accept: "image/png,image/*;q=0.8",
          },
        }),
      10_000
    );

    if (!response.ok) {
      throw new Error(`Google Static Maps responded with ${response.status}`);
    }

    const mimeType = response.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await response.arrayBuffer());

    return staticMapResponseSchema.parse({
      staticMapImageBase64: `data:${mimeType};base64,${bytes.toString("base64")}`,
      provider: "google-static-maps",
    });
  } catch {
    return buildFallbackMap(args);
  }
}
