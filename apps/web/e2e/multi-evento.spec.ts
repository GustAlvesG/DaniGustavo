import { expect, test } from "@playwright/test";
import { MULTI_EVENT } from "./support/multi-setup";

/*
 * Dois eventos lado a lado, cada um no seu host (o setup global cria o evento 2 e os
 * domínios desta porta). Prova que o site de um não mostra nada do outro.
 */

const port = Number(process.env.E2E_PORT ?? 3100);
const evento1 = `http://evento1.localhost:${port}`;
const evento2 = `http://evento2.localhost:${port}`;

test("h1 e monograma diferentes por host", async ({ page }) => {
  await page.goto(`${evento1}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dani");
  await expect(page.locator("main")).not.toContainText("Ana & Bruno");

  await page.goto(`${evento2}/`);
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Ana");
  await expect(h1).toContainText("Bruno");
  // Conteúdo fixo do casamento (fotos, versículo, galeria) não vaza para o evento 2.
  const html = await page.content();
  expect(html).not.toMatch(/Gustavo|\/fotos\/|Isaías/);
  await expect(page.locator("header [data-mono]").first()).toContainText("AB");
  await expect(page.getByRole("navigation", { name: "Principal" })).not.toContainText("Galeria");
});

test("listas de presentes separadas", async ({ page }) => {
  await page.goto(`${evento2}/presentes`);
  await expect(page.getByText("Presente só do evento 2")).toBeVisible();

  await page.goto(`${evento1}/presentes`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Presente só do evento 2")).toHaveCount(0);
});

// O Node (request do Playwright) não resolve *.localhost; o Chromium resolve. Por isso as
// checagens de status e de arquivos passam pelo navegador.
test("galeria e padrinhos só existem no casamento original", async ({ page }) => {
  expect((await page.goto(`${evento1}/galeria`))?.status()).toBe(200);
  expect((await page.goto(`${evento2}/galeria`))?.status()).toBe(404);
  expect((await page.goto(`${evento2}/padrinhos`))?.status()).toBe(404);
});

test("agenda e manifest com o nome do evento do host", async ({ page }) => {
  await page.goto(`${evento2}/`);
  const [ics, manifest] = await page.evaluate(
    async () =>
      [
        await (await fetch("/agenda.ics")).text(),
        (await (await fetch("/manifest.webmanifest")).json()) as { name: string },
      ] as const,
  );
  expect(ics).toContain(`SUMMARY:Casamento de ${MULTI_EVENT.name}`);
  expect(ics).toContain(`URL:http://evento2.localhost:${port}/`);
  expect(manifest.name).toBe(MULTI_EVENT.name);
});

test("host desconhecido → 404 com página própria", async ({ page }) => {
  const res = await page.goto(`http://nenhum-evento.localhost:${port}/`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Site não encontrado");
});
