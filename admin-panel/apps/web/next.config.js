/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const adminOrigin = process.env.ADMIN_ORIGIN;
    if (!adminOrigin) return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: adminOrigin },
          { key: "Access-Control-Allow-Credentials", value: "true" },
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
