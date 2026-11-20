import { expect, test, type Page } from "@playwright/test";
import { resetFase2 } from "./support/db";
import { E2E_HOST, MULTI_EVENT } from "./support/multi-setup";
import { routeLoginIp } from "./support/login-ip";

test.beforeEach(({ context }) => routeLoginIp(context, "painel-fase2"));

/*
 * Fase 2: o que o anfitrião muda no painel aparece no site do evento. Usa o evento de teste
 * (ana-bruno, evento2.localhost:<porta>, criado pelo setup global) para não mexer no casamento:
 * editar uma seção, desligar um módulo (página 404) e trocar o tema. Volta tudo no fim. Entra
 * como o anfitrião só desse evento (criado pelo setup global).
 * A API dos e2e revalida o cache deste site (WEB_INTERNAL_URL no playwright.config.ts).
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const email = E2E_HOST.email;
const password = process.env.E2E_HOST_PASSWORD ?? "";
const port = Number(process.env.E2E_PORT ?? 3100);
const site = `http://evento2.localhost:${port}`;
const run = Date.now().toString(36);

test.skip(!password, "Sem a senha do anfitrião de teste (setup global).");

let eventId = 0;

test.beforeAll(async () => {
  eventId = await resetFase2(MULTI_EVENT.slug);
});

test.afterAll(async () => {
  await resetFase2(MULTI_EVENT.slug);
});

/** Recarrega a página do site até a condição valer (a revalidação do cache é assíncrona). */
async function eventually(page: Page, url: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(url);
    await check();
  }).toPass({ timeout: 20_000 });
}

/** Espera a página do site responder com o status (o next dev às vezes aborta a 1ª navegação). */
async function expectStatus(page: Page, url: string, status: number) {
  await expect(async () => {
    expect((await page.goto(url))?.status()).toBe(status);
  }).toPass({ timeout: 30_000 });
}

test("seção editada, módulo desligado e tema trocado aparecem no site", async ({ page }) => {
  test.slow();
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

  // Site: a linha acima dos nomes, na abertura.
  const kicker = `Vem festejar com a gente ${run}`;
  await page.goto(`${painelUrl}#/e/${eventId}/site`);
  await page.locator("summary", { hasText: "Abertura" }).click();
  await page.getByLabel("Linha acima dos nomes").fill(kicker);
  await page.getByRole("button", { name: "Salvar o site" }).first().click();
  await expect(page.getByText("Site salvo.")).toBeVisible();
  const painel = page.url();

  const visitor = await page.context().newPage();
  await eventually(visitor, `${site}/`, async () => {
    await expect(visitor.locator("#inicio")).toContainText(kicker, { timeout: 1_000 });
  });

  // Evento: desliga o mural de recados → some do site e a página dá 404.
  await expectStatus(visitor, `${site}/recados`, 200);
  await page.goto(`${painelUrl}#/e/${eventId}/evento`);
  const recados = page
    .locator("section", { has: page.getByRole("heading", { name: "Módulos" }) })
    .getByRole("checkbox", { name: /recados/i });
  await recados.uncheck();
  await page.getByRole("button", { name: "Salvar evento" }).click();
  await expect(page.getByText("Evento: salvo.")).toBeVisible();
  await expectStatus(visitor, `${site}/recados`, 404);

  // Aparência: Festa no lugar do tema padrão do casamento (Álbum).
  await expect(visitor.locator("html")).not.toHaveAttribute("data-theme", "festa");
  await page.goto(`${painelUrl}#/e/${eventId}/aparencia`);
  await page.getByRole("radio", { name: /^Festa/ }).check();
  await page.getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.getByText("Aparência salva.", { exact: false })).toBeVisible();
  await eventually(visitor, `${site}/`, async () => {
    await expect(visitor.locator("html")).toHaveAttribute("data-theme", "festa", {
      timeout: 1_000,
    });
  });

  // Volta o módulo pelo painel (revalida o cache do site na hora).
  await page.goto(painel.replace(/#.*$/, `#/e/${eventId}/evento`));
  await recados.check();
  await page.getByRole("button", { name: "Salvar evento" }).click();
  await expect(page.getByText("Evento: salvo.")).toBeVisible();
  await expect(async () => {
    await expectStatus(visitor, `${site}/recados`, 200);
  }).toPass({ timeout: 20_000 });
});
