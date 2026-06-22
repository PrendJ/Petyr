import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:8080",
        "127.0.0.1:8080",
        "petyr.unguess-internal.net"
      ]
    }
  }
};

export default nextConfig;
