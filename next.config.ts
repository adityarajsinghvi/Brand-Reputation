import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright ships browser binaries that must not be bundled into the serverless function.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
