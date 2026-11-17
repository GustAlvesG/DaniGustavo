"use client";

import { useEffect } from "react";

/** Registra o service worker mínimo (public/sw.js) para o site poder ser instalado como app. */
export function RegistrarSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sem service worker o site continua igual; só deixa de ser instalável.
    });
  }, []);
  return null;
}
