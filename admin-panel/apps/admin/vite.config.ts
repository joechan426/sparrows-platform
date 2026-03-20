import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We already provide /manifest.json in public/.
      manifest: false,
      registerType: "autoUpdate",
      workbox: {
        // Keep SW safe for auth/API: never cache /api/*.
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*$/i,
            handler: "NetworkOnly",
          },
          // Static assets: let workbox precache + default runtime caching work.
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
