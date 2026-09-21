import type { NextConfig } from "next";

const allowedDevOrigin = process.env.NODE_ENV === "development"
  ? process.env.NEXT_DEV_ALLOWED_ORIGIN?.trim()
  : undefined;

const nextConfig: NextConfig = {
  ...(allowedDevOrigin ? { allowedDevOrigins: [allowedDevOrigin] } : {}),
};

export default nextConfig;
