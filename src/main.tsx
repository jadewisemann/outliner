import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { installNativeShell, isNative } from "./shared/native";
// Import order is cascade order — see the header of each file.
import "./styles/tokens.css";
import "./styles/chrome.css";
import "./styles/outline.css";
import "./styles/panels.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

installNativeShell();

// Only in a build: the dev server serves its own client inline and a worker
// caching that would fight every reload. Registered relative to the page, so
// the scope is right whether the app sits at a domain root or under a path.
// Not in the native shell either: its assets are already on the disk, and on
// macOS the custom scheme does not take a worker at all.
if (import.meta.env.PROD && !isNative() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {
      /* no worker means no offline launch, which is how it was before */
    });
  });
}
