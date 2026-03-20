/** @type {import('next').NextConfig} */
function normalizeOrigin(origin) {
  if (typeof origin !== "string") return undefined;
  // Remove trailing slash to avoid mismatch with browser's Origin header.
  return origin.trim().replace(/\/$/, "");
}

const nextConfig = {
  async headers() {
    const adminOrigin = normalizeOrigin(process.env.ADMIN_ORIGIN);
    const allowOrigin = adminOrigin || "*";
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowOrigin },
          // If we fall back to '*' we must NOT claim credentials.
          { key: "Access-Control-Allow-Credentials", value: adminOrigin ? "true" : "false" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" },
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

export default nextConfig;
