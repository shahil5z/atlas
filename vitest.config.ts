import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    external: ["pdfjs-dist"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
