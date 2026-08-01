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
    const isProd = process.env.NODE_ENV === "production";
    // A real content-security backstop for an origin that serves patient-uploaded
    // files. Next injects inline scripts (the RSC payload) and inline styles, so
    // 'unsafe-inline' is unavoidable without per-request nonces; even so, locking
    // default/script/connect to 'self' still blocks the classic injected
    // <script src=evil> and cross-origin exfiltration. Dev needs 'unsafe-eval'
    // for React Refresh; production does not.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          // Never leak a credential-bearing path (the patient link is in the
          // URL) to another origin via Referer.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Deny device capabilities this clinic app never uses, on a PHI origin.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Content-Security-Policy", value: csp },
          // Force HTTPS so a credential-bearing patient link can't be sent over
          // cleartext on a downgraded/first request. Prod only — TLS is
          // guaranteed there (same condition that gates Secure cookies).
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
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
