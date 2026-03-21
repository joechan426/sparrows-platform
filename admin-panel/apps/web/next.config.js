import nextPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next-pwa currently injects webpack config.
  // Tell Next we intentionally have Turbopack config as well.
  turbopack: {},
  async headers() {
    const allowOrigin = process.env.ADMIN_ORIGIN ?? "*";
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowOrigin },
          { key: "Access-Control-Allow-Credentials", value: "false" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PATCH,PUT,DELETE,OPTIONS",
          },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // CORS preflight: browser sends OPTIONS with Access-Control-Request-Method.
        // Rewrite to a single route that returns 204 + CORS headers (avoids Edge middleware).
        {
          source: "/api/:path*",
          destination: "/api/cors-preflight",
          has: [{ type: "header", key: "Access-Control-Request-Method" }],
        },
      ],
    };
  },
};

const withPWA = nextPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    // Tab favicon: never cache stale default icon (Chrome prefers /favicon.ico).
    {
      urlPattern: /^\/favicon\.ico(\?.*)?$/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /^\/icon\.png(\?.*)?$/i,
      handler: "NetworkOnly",
    },
    // Next.js static assets
    {
      urlPattern: /^\/_next\/static\/.*$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "sparrows-next-static",
      },
    },
    // Public images (logos, etc.)
    {
      urlPattern: /^\/images\/.*$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "sparrows-images",
      },
    },
    // Background sync for event registration POST.
    // When offline: enqueue; when back online: retry automatically.
    {
      urlPattern: /^\/api\/calendar-events\/.+\/registrations$/i,
      handler: "NetworkOnly",
      method: "POST",
      options: {
        backgroundSync: {
          name: "calendar-register-queue",
        },
      },
    },
    // Navigation fallback (app shell) when offline.
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "sparrows-pages",
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

export default withPWA(nextConfig);
