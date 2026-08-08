import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import { Boundary } from "./ui/Boundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>
);
