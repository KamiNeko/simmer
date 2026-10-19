/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { chunkSizeWarningLimit: 800 },
  server: { proxy: { "/api": "http://localhost:8080" } },
  test: {
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.*", "src/components/ui/**"],
      // CI fails if coverage drops below this; raise it as tests are added.
      thresholds: { lines: 40 },
    },
  },
});
