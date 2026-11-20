import { expect, test, type Page } from "@playwright/test";
import { E2E_HOST } from "./support/multi-setup";

/*
 * Fase 3, frente D: navegação do painel. Administração (ADMIN_EMAIL_1) vê o seletor com
 * organizações e eventos, abre a organização e o evento e acha os atalhos de anfitriões; o
 * anfitrião de teste (só do evento ana-bruno) não vê seletor, atalhos nem o painel da
 * organização, e #/o/<id> o devolve ao evento.
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL_1 ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD_INICIAL ?? "";
const hostPassword = process.env.E2E_HOST_PASSWORD ?? "";

async function login(page: Page, email: string, password: string) {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}

test.describe("administração", () => {
  test.skip(!adminEmail || !adminPassword, "Defina ADMIN_EMAIL_1 e ADMIN_PASSWORD_INICIAL.");

  test("seletor leva à organização e ao evento; evento tem atalhos de anfitriões", async ({
    page,
  }) => {
    await login(page, adminEmail, adminPassword);

    // Lista com organizações e eventos.
    await page.goto(`${painelUrl}#/eventos`);
    await expect(page.getByRole("heading", { name: "Organizações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Eventos", exact: true })).toBeVisible();

    // Organização pelo seletor.
    const picker = page.getByLabel("Organização e evento");
    const orgOption = picker.locator("option", { hasText: "Organização:" }).first();
    await picker.selectOption((await orgOption.getAttribute("value"))!);
    await expect(page).toHaveURL(/#\/o\/\d+$/);
    await expect(page.getByRole("navigation", { name: "Seções da organização" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Equipe" })).toBeVisible();

    // Evento pelo seletor.
    const eventOption = picker
      .locator("option")
      .filter({ hasNotText: /Organização|Todas/ })
      .first();
    await picker.selectOption((await eventOption.getAttribute("value"))!);
    await expect(page).toHaveURL(/#\/e\/\d+$/);
    const nav = page.getByRole("navigation", { name: "Seções do painel" });
    await expect(nav.getByRole("link", { name: "Convites" })).toBeVisible();
    await nav.getByRole("link", { name: "Anfitriões" }).click();
    await expect(page).toHaveURL(/#\/o\/\d+\/eventos\/\d+\/anfitrioes$/);
    await expect(page.getByRole("navigation", { name: "Seções da organização" })).toBeVisible();

    // Hash antigo da organização inexistente volta para uma organização válida.
    await page.goto(`${painelUrl}#/o/999999`);
    await expect(page).toHaveURL(/#\/o\/\d+$/);
  });
});

test.describe("anfitrião", () => {
  test.skip(!hostPassword, "Sem a senha do anfitrião de teste (setup global).");

  test("só o evento dele: sem seletor, sem atalhos da organização", async ({ page }) => {
    await login(page, E2E_HOST.email, hostPassword);
    await expect(page).toHaveURL(/#\/e\/\d+$/);
    await expect(page.getByLabel("Organização e evento")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Seções do painel" });
    await expect(nav.getByRole("link", { name: "Início" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Anfitriões" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Permissões do anfitrião" })).toHaveCount(0);

    // Painel da organização não é dele: volta para o evento.
    await page.goto(`${painelUrl}#/o/1`);
    await expect(page).toHaveURL(/#\/e\/\d+$/);
    await expect(page.getByRole("navigation", { name: "Seções da organização" })).toHaveCount(0);
  });
});
