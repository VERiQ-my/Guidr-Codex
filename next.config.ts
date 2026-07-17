import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Lets `next dev` access Cloudflare bindings/context during local development.
initOpenNextCloudflareForDev();

// NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME — if
// they're absent here, the deployed app ships an empty Firebase config no
// matter what runtime secrets exist. Surface them in the build log so a
// misconfigured CI environment is caught in minutes, not by auth errors in prod.
console.log(
  "[build-env] NEXT_PUBLIC vars visible to this build:",
  Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC")).sort().join(", ") || "(none)"
);

const nextConfig: NextConfig = {
  // OWASP hardening — baseline security headers on every response: stop
  // MIME-sniffing, clickjacking (no page of ours belongs in an iframe), leaky
  // referrers, and unneeded device APIs. Camera stays self-only because the
  // scan flow's CameraCapture uses getUserMedia.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // Everything except the public landings ("/" and "/ms") is app UI
        // behind sign-in or a funnel step — keep all of it out of search
        // results. Header-level noindex works even for client-component pages
        // that can't export metadata; robots.ts leaves these paths crawlable
        // so bots actually see it.
        source:
          "/:section(scan|cases|profile|settings|preferences|analytics|help|learn|auth|login|onboarding|alert)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
  // `next dev` runs Turbopack (Next 16 default) and needs no custom config —
  // the webpack function below only matters for `next build --webpack`
  // (Workers/OpenNext). Without this empty object, dev errors out on seeing
  // a webpack config with no turbopack counterpart.
  turbopack: {},
  // Pin the workspace root: a stray lockfile elsewhere on the machine can
  // make Next infer a parent directory as root, and webpack then tries to
  // snapshot/trace far outside the project — builds hang for hours.
  outputFileTracingRoot: __dirname,
  // firebase-admin → jwks-rsa → jose: the `workerd` export condition resolves
  // to jose's dist/browser build, which Next's server trace (run under `node`
  // conditions) doesn't copy. Without this, `opennextjs-cloudflare build`
  // fails with: Could not resolve "jose" (dist/browser/index.js not found).
  outputFileTracingIncludes: {
    "/*": ["node_modules/jose/dist/browser/**/*"],
  },
  // During SSR, webpack resolves the CLIENT Firebase SDK's `node` export,
  // which loads @grpc/grpc-js + proto-loader — protobufjs then runs
  // code generation at import time, which Cloudflare Workers forbid
  // (EvalError: Code generation from strings disallowed). Point the server
  // bundle at the browser build (WebChannel/fetch, no gRPC) instead.
  // firebase-admin is a different package tree and keeps its node build.
  webpack: (config, { isServer }) => {
    // Escape hatch for local Windows builds: webpack's persistent disk cache
    // can wedge on filesystem snapshots here ("Unable to snapshot resolve
    // dependencies") and the build never finishes. CI is unaffected.
    if (process.env.GUIDR_DISABLE_WEBPACK_CACHE) {
      config.cache = false;
    }
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Exact-match ($) so subpath imports still resolve normally.
        "@firebase/firestore$": path.resolve(
          __dirname,
          "node_modules/@firebase/firestore/dist/index.esm.js"
        ),
      };
    }
    return config;
  },
};

export default nextConfig;
