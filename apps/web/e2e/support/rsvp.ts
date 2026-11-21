import { createHash, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const API_URL = (process.env.API_URL || "http://localhost:3333").replace(/\/+$/, "");

/** IP próprio por teste: o limite da API (busca 5/min, RSVP 10/min) é por IP. */
export function uniqueIp(): string {
  const h = createHash("sha1").update(randomUUID()).digest();
  return `10.${h[0]}.${h[1]}.${(h[2]! % 250) + 1}`;
}

/** IP único por teste (o site repassa X-Forwarded-For à API). */
export async function prepare(page: Page, ip = uniqueIp()): Promise<string> {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  return ip;
}

export async function apiInvitation(token: string) {
  const res = await fetch(`${API_URL}/api/e/dani-gustavo/invitations/${token}`);
  expect(res.ok).toBe(true);
  return (await res.json()) as {
    isClosed: boolean;
    contact: { email: string | null; phone: string | null };
    guests: {
      name: string;
      isPlusOne: boolean;
      rsvpStatus: "pending" | "confirmed" | "declined";
      dietaryNotes: string | null;
    }[];
  };
}

/** Avança uma etapa e espera o título da próxima (a transição troca o conteúdo). */
export async function next(page: Page, heading: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
}

/**
 * Espera o React hidratar o elemento (ele ganha a chave interna `__reactProps$…`). Um clique ou
 * Enter antes disso é perdido (e um `<form>` sem `action` cairia num GET nativo): o `next dev`
 * hidrata devagar com vários workers.
 */
export async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  }, selector);
}

/**
 * Fase 6: marca o aceite do aviso de privacidade, se o evento pedir. O padrão é pedir, mas é
 * configuração do evento (Privacidade no painel): com `requireConsent` desligado no evento 1, os
 * fluxos de RSVP e do mural seguem valendo. A exigência em si é coberta em painel-fase6.spec.ts.
 */
export async function acceptConsent(
  page: Page,
  testId: "rsvp-consent" | "recado-consent",
  how: "click" | "keyboard" = "click",
) {
  const box = page.getByTestId(testId);
  if ((await box.count()) === 0) return;
  if (how === "keyboard") {
    await box.focus();
    await page.keyboard.press("Space");
  } else {
    await box.check();
  }
}
