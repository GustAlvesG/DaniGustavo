import { expect, test, type Page } from "@playwright/test";
import { cleanupOrders } from "./support/db";
import { prepare, waitForHydration } from "./support/rsvp";

/*
 * Fase 4: lista de presentes e pagamento no modo simulado (sem conta no
 * Asaas). Os pedidos usam um e-mail próprio por projeto e são apagados
 * no fim, com as cotas devolvidas, então a suíte é repetível.
 */

// E-mail único por teste: os testes rodam em paralelo e a limpeza de um não pode
// apagar o pedido de outro no meio do caminho.
const API_URL = process.env.API_URL ?? "http://localhost:3333";

const email = (testId: string) => `e2e-${testId}@exemplo.com`.toLowerCase();

test.afterEach(async ({}, info) => {
  await cleanupOrders(email(info.testId));
});

async function openGift(page: Page, slug: string) {
  await page.goto("/presentes");
  await waitForHydration(page, `[data-gift="${slug}"] button`);
  await page
    .locator(`[data-gift="${slug}"]`)
    .getByRole("button", { name: /Presentear/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("lista de presentes", () => {
  test("mostra os presentes e filtra por categoria e preço", async ({ page }) => {
    // Os números vêm da própria API (o banco de dev tem presentes do usuário e fixtures de
    // outros testes com slug e2e-*): o teste confere o filtro, não a contagem do seed.
    const res = await page.request.get(`${API_URL}/api/e/dani-gustavo/gifts`);
    expect(res.ok()).toBe(true);
    const all = (
      (await res.json()) as {
        gifts: { slug: string; category: string; priceCents: number; openAmount: boolean }[];
      }
    ).gifts.filter((g) => !g.slug.startsWith("e2e-"));
    const luaDeMel = all.filter((g) => g.category === "lua-de-mel");
    const above600 = all.filter((g) => g.openAmount || g.priceCents > 60_000);
    expect(luaDeMel.length).toBeGreaterThan(0);
    expect(above600.length).toBeGreaterThan(0);

    await page.goto("/presentes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Um presente");
    const items = page.getByTestId("gift-grid").locator('[data-gift]:not([data-gift^="e2e-"])');
    await expect(items).toHaveCount(all.length);

    await page.getByRole("radio", { name: "Lua de mel" }).check();
    await expect(items).toHaveCount(luaDeMel.length);

    await page.getByRole("radio", { name: "Todos" }).check();
    await page.getByRole("radio", { name: "Acima de R$ 600" }).check();
    // A contribuição livre vale em qualquer faixa.
    await expect(items).toHaveCount(above600.length);
    await expect(page.locator('[data-gift="contribuicao-livre"]')).toBeVisible();
  });

  test("home e menu levam à lista", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("#presentes").getByRole("link", { name: "Ver a lista de presentes" }),
    ).toHaveAttribute("href", "/presentes");
    await expect(page.locator('header a[href="/presentes"]').first()).toHaveCount(1);
  });

  test("valida o formulário antes de criar o pedido", async ({ page }) => {
    await prepare(page);
    const dialog = await openGift(page, "contribuicao-livre");
    await dialog.getByLabel("Valor em reais").fill("5");
    await dialog.getByLabel("Seu nome").fill("Teste");
    await dialog.getByLabel("Seu e-mail").fill("teste@exemplo.com");
    await dialog.getByRole("button", { name: "Presentear" }).click();
    await expect(dialog.getByText("O valor mínimo é R$ 10,00.")).toBeVisible();
    await expect(page).toHaveURL(/\/presentes$/);
  });
});

test.describe("pagamento (modo simulado)", () => {
  test("Pix: QR, copia e cola e aprovação ao vivo até o agradecimento", async ({ page }, info) => {
    await prepare(page);
    const dialog = await openGift(page, "plantas-da-varanda");
    await dialog.getByRole("button", { name: "Mais uma cota" }).click();
    await expect(dialog.getByTestId("order-total")).toHaveText(/300,00/);
    await dialog.getByRole("button", { name: "Menos uma cota" }).click();
    await expect(dialog.getByTestId("order-total")).toHaveText(/150,00/);
    await dialog.getByLabel("Seu nome").fill("Helena Teste");
    await dialog.getByLabel("Seu e-mail").fill(email(info.testId));
    await dialog.getByLabel(/Recado para os noivos/).fill("Que a casa seja leve.");
    await dialog.getByRole("button", { name: "Presentear" }).click();

    await expect(page).toHaveURL(/\/presentes\/pagamento\/[0-9A-Z]{26}$/);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("tab", { name: "Pix" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Pix copia e cola")).toHaveValue(/SIMULACAO/);
    await expect(page.getByTestId("pix-status")).toContainText("Aguardando o pagamento");
    await expect(page.getByText("Simulação: não pague este QR")).toBeVisible();

    await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
    await expect(page.getByTestId("stamp").first()).toBeVisible();
    await expect(page).toHaveURL(/\/presentes\/obrigado\/[0-9A-Z]{26}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Presente enviado");
    await expect(page.getByText("Obrigado, Helena.")).toBeVisible();
    // A página anterior fica escondida no DOM (Activity do Next): procura só na atual.
    await expect(page.locator("[data-thanks]").getByText("Que a casa seja leve.")).toBeVisible();
  });

  test("cartão: recusado mostra o que fazer; aprovado leva ao agradecimento", async ({
    page,
  }, info) => {
    await prepare(page);
    const dialog = await openGift(page, "contribuicao-livre");
    await dialog.getByLabel("Valor em reais").fill("100,00");
    await dialog.getByLabel("Seu nome").fill("Rafael Teste");
    await dialog.getByLabel("Seu e-mail").fill(email(info.testId));
    await dialog.getByRole("button", { name: "Presentear" }).click();
    await expect(page).toHaveURL(/\/presentes\/pagamento\//);

    await page.getByRole("tab", { name: "Cartão" }).click();
    const card = page.getByTestId("card-panel");
    await card.getByText(/Quero cobrir a taxa do cartão/).click();
    await expect(card.getByTestId("card-total")).toHaveText(/104,98/);

    await card.getByLabel("Número do cartão").fill("4000 0000 0000 0002");
    await card.getByLabel("Nome no cartão").fill("RAFAEL TESTE");
    await card.getByLabel("Validade").fill("1230");
    await card.getByLabel("CVV").fill("123");
    await card.getByRole("button", { name: /Pagar/ }).click();
    await expect(card.getByRole("alert")).toContainText("recusado");
    await expect(page).toHaveURL(/\/presentes\/pagamento\//);

    await card.getByLabel("Número do cartão").fill("4111 1111 1111 1111");
    await card.getByRole("button", { name: /Pagar/ }).click();
    await expect(page).toHaveURL(/\/presentes\/obrigado\//, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Presente enviado");
    await expect(page.locator("[data-thanks]").getByTestId("summary-total")).toHaveText(/104,98/);
  });
});
