import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * The policy in index.html is the one the built app ships with. The dev server
 * injects its client and its stylesheets inline, which that policy refuses —
 * so serving gets a loosened copy, made here, rather than production getting a
 * weaker policy for the sake of the dev server. `e2e/csp.spec.ts` runs against
 * the built output, where the real policy applies.
 */
function relaxCspWhileServing(): Plugin {
  return {
    name: "relax-csp-while-serving",
    apply: "serve",
    transformIndexHtml: (html) => html.replace(/(script-src|style-src) ('self')/g, "$1 $2 'unsafe-inline'")
  };
}

export default defineConfig({
  plugins: [react(), relaxCspWhileServing()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"]
  }
});
