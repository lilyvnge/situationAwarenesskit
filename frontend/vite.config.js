import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")
            ) {
              return "react-vendor";
            }
            if (id.includes("leaflet")) return "map-vendor";
            if (id.includes("react-force-graph") || id.includes("d3-") || id.includes("kapsule")) {
              return "network-vendor";
            }
            if (id.includes("recharts")) return "chart-vendor";
          }
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 3000
  }
});
