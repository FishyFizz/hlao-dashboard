import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/gallery.css";
import "./styles/app.css";
import { App } from "./App";

try {
  const stored = window.localStorage.getItem("hlao-dashboard-theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  }
} catch {
  // The default dark theme still applies.
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
