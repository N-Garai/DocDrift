import type { NextConfig } from "next";

/**
 * DocDrift frontend.
 *
 * - Dev / sandbox : `next dev` proxies `/api/*` to the Express engine
 *   (BACKEND_ORIGIN, default http://localhost:3001) so the GitHub OAuth
 *   redirect flow and session cookies stay same-origin with the app.
 * - Production    : `NEXT_OUTPUT=export next build` emits a fully static
 *   `out/` directory that the Express backend serves directly, so the whole
 *   app runs behind a single process/port (see /Dockerfile) — no proxy needed.
 */
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isExport ? "export" : undefined,
  images: { unoptimized: true },
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${process.env.BACKEND_ORIGIN ?? "http://localhost:3001"}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
