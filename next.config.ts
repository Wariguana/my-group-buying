import type { NextConfig } from "next";

const allowedDevOrigin = process.env.NODE_ENV === "development"
  ? process.env.NEXT_DEV_ALLOWED_ORIGIN?.trim()
  : undefined;

const nextConfig: NextConfig = {
  // Run ADM browser checks beside the user's normal dev server in this checkout.
  ...(process.env.NODE_ENV === "development" && process.env.ADM_PREVIEW === "1"
    ? { distDir: ".temp/adm-preview/next" }
    : {}),
  ...(allowedDevOrigin ? { allowedDevOrigins: [allowedDevOrigin] } : {}),
};

export default nextConfig;
