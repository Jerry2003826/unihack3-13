import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "../..");

function loadWorkspaceEnv() {
  for (const name of [".env", ".env.local"]) {
    const filePath = resolve(workspaceRoot, name);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  }
}

loadWorkspaceEnv();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: "*.digitaloceanspaces.com" },
      { hostname: "*.cdn.digitaloceanspaces.com" },
      { hostname: "maps.googleapis.com" },
      { hostname: "maps.gstatic.com" },
    ],
  },
};

export default nextConfig;
