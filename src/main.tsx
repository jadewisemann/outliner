import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Only in a build: the dev server serves its own client inline and a worker
// caching that would fight every reload. Registered relative to the page, so
// the scope is right whether the app sits at a domain root or under a path.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {
      /* no worker means no offline launch, which is how it was before */
    });
  });
}
