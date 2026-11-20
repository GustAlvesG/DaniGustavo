import { expect, test } from "@playwright/test";
import { painelCleanup, painelFixture } from "./support/db";
import { routeLoginIp } from "./support/login-ip";

test.beforeEach(({ context }) => routeLoginIp(context, "painel"));

/*
 * Fase 5: painel dos noivos (servido pela API em /painel). Usa um presente, um pedido pago
 * (simulado) e um recado criados só para o teste, e apaga tudo no fim.
 * Login: E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD, ou ADMIN_EMAIL_1/ADMIN_PASSWORD_INICIAL do .env.
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL_1 ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD_INICIAL ?? "";
const run = Date.now().toString(36);

test.skip(!email || !password, "Defina ADMIN_EMAIL_1 e ADMIN_PASSWORD_INICIAL no .env.");

let fixture: { slug: string; publicId: string; giftId: number };

test.beforeAll(async () => {
  fixture = await painelFixture(run);
});

test.afterAll(async () => {
  await painelCleanup(run);
});

test("login → início → convite → presente → recado → reembolso", async ({ page }) => {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Início
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  // O hash agora leva o evento: #/e/:eventId.
  expect(page.url()).toMatch(/#\/e\/\d+$/);
  await expect(page.getByRole("heading", { name: "Arrecadado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prazo do RSVP" })).toBeVisible();

  // Criar convite
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  await page.getByRole("link", { name: "Novo convite" }).click();
  await page.getByLabel("Nome do convite").fill(`Convite E2E ${run}`);
  await page.getByLabel("Telefone (WhatsApp)").fill("(24) 99999-0000");
  await page.getByLabel("Nome do convidado").fill("Joana Teste");
  await page.getByRole("button", { name: "+ Adicionar convidado" }).click();
  await page.getByLabel("Nome do convidado").nth(1).fill("Pedro Teste");
  await page.getByRole("button", { name: "Criar convite" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Convite E2E ${run}` })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Link do convite" })).toHaveValue(
    /\/c\/[0-9A-Z]{26}$/,
  );
  await expect(page.getByRole("link", { name: "Enviar no WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/5524999990000\?text=/,
  );

  // Editar presente
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  await page.getByRole("button", { name: `Editar Presente e2e ${run}` }).click();
  const giftDialog = page.getByRole("dialog", { name: "Editar presente" });
  await giftDialog.getByLabel("Descrição").fill("Descrição alterada no e2e.");
  await giftDialog.getByLabel("Preço da cota (R$)").fill("130,00");
  await giftDialog.getByRole("button", { name: "Salvar presente" }).click();
  await expect(page.getByText("Presente salvo.")).toBeVisible();
  await expect(page.getByText("R$ 130,00 por cota")).toBeVisible();

  // Aprovar recado
  await page.getByRole("link", { name: "Recados", exact: true }).click();
  const recado = page.locator(".message", { hasText: `Recado e2e ${run}` });
  await recado.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText(`Recado de Tia E2E ${run} aprovado.`)).toBeVisible();
  await expect(recado).toHaveCount(0);

  // Reembolsar pedido simulado
  await page.getByRole("link", { name: "Pedidos", exact: true }).click();
  await page.getByLabel("Buscar").fill(`Madrinha E2E ${run}`);
  await page.getByRole("link", { name: new RegExp(`Presente e2e ${run}`) }).click();
  const orderDialog = page.getByRole("dialog", { name: "Pedido" });
  await orderDialog.getByRole("button", { name: "Reembolsar" }).click();
  await page.getByRole("button", { name: "Reembolsar R$ 120,00" }).click();
  await expect(page.getByText("Reembolso feito.", { exact: false })).toBeVisible();
  await expect(orderDialog.getByText("Reembolsado")).toBeVisible();
  expect(fixture.publicId).toMatch(/^[0-9A-Z]{26}$/);
});
