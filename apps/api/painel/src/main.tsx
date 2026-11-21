import "./zod-config.ts";
import { PLATFORM_NAME } from "@casamento/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Título até a página aberta trocar (o index.html não lê a constante da marca).
document.title = `Painel · ${PLATFORM_NAME}`;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
