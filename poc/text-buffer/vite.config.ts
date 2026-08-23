import { defineConfig } from "vite";

export default defineConfig({
  root: "poc/text-buffer",
  base: "./",
  build: {
    outDir: "../../dist-poc/text-buffer",
    emptyOutDir: true
  }
});
