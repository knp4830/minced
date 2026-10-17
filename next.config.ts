import type { NextConfig } from "next";

// Images come from our own origin, the Supabase Storage host and Wikimedia Commons only.
// (No script-src: Next injects inline bootstrap scripts, and a nonce-based policy needs
// per-request rendering, which would turn off ISR.)
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const CANONICAL_ORIGIN = "https://minced.kevinpham.page";
const CANONICAL_REDIRECT_HOSTS = ["minced-app.vercel.app", "mise-two-xi.vercel.app"];

const csp = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  `img-src 'self' data: blob: ${supabaseHost} https://upload.wikimedia.org`.replace(/\s+/g, " ").trim(),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // One canonical host. The two old production hostnames send everything (path and query kept)
  // to the real domain with a 308. A `host` condition matches the exact name only, so preview
  // deployments (minced-git-<branch>-….vercel.app) and localhost are never redirected. Next
  // applies redirects before middleware, so the middleware matcher is untouched.
  async redirects() {
    return CANONICAL_REDIRECT_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `${CANONICAL_ORIGIN}/:path*`,
      permanent: true, // 308
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
