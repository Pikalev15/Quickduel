import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    viewTransition: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
