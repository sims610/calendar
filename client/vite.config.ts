import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version downloads in the background but waits until the user taps Reload
      // (see UpdatePrompt.tsx), so the app never changes under them.
      registerType: "prompt",
      // Opens the app when a reminder is tapped (see notifications.ts).
      workbox: { importScripts: ["notification-click.js"] },
      manifest: {
        name: "Calendar",
        short_name: "Calendar",
        description: "A simple calendar for your phone.",
        theme_color: "#9c1552",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
    }),
  ],
});
