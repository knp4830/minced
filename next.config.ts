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

const csp = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  `img-src 'self' data: blob: ${supabaseHost} https://upload.wikimedia.org`.replace(/\s+/g, " ").trim(),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
