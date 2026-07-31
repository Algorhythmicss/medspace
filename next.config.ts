import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the parent dir makes Next guess the wrong
  // workspace root. Pin it to this app so the build is deterministic.
  turbopack: { root: __dirname },

  // The image optimizer (/_next/image) is not behind the passcode gate and
  // fetches its source URL server-side without the caller's cookies. Pin it to
  // the art directory so it can never be turned into an open proxy for
  // /api/reports/<id>/file or any other local path.
  images: { localPatterns: [{ pathname: "/art/**" }] },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Never leak a credential-bearing path (the patient link is in the
          // URL) to another origin via Referer.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
      {
        // A patient's whole record is keyed by a URL that IS the credential.
        // Keep it out of shared/CDN caches and off the disk of a shared phone.
        source: "/p/:token*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        // Same for the signed-in patient view.
        source: "/plan",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
