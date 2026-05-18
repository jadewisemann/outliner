import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { createConfiguredRemoteStore } from "./app/remoteStoreConfig";
import "./styles.css";

const remoteStore = createConfiguredRemoteStore();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App remoteStore={remoteStore} />
  </React.StrictMode>
);
