import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1.1mb",
    },
  },
};

export default nextConfig;
