import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/gallery.css";
import "./styles/app.css";
import { App } from "./App";
import { loadTheme } from "./store/persistence";

document.documentElement.dataset.theme = loadTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
