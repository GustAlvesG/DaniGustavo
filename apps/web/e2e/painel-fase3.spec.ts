import { expect, test, type Page } from "@playwright/test";
import { fase3Cleanup, fase3InviteToken, fase3Org } from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { E2E_HOST } from "./support/multi-setup";

/*
 * Fase 3, frente D: navegação do painel. Administração (ADMIN_EMAIL_1) vê o seletor com
 * organizações e eventos, abre a organização e o evento e acha os atalhos de anfitriões; o
 * anfitrião de teste (só do evento ana-bruno) não vê seletor, atalhos nem o painel da
 * organização, e #/o/<id> o devolve ao evento.
 *
 * Integração: fluxo completo da organização — criar evento, tirar uma permissão do anfitrião,
 * convidar por e-mail, aceitar numa sessão anônima (conta nova) e conferir que o anfitrião só
 * vê o evento dele, sem o que foi negado. O e-mail vai para o console da API e o banco só tem
 * o hash do token: o apoio do e2e troca o hash por um token conhecido (o "link do e-mail").
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL_1 ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD_INICIAL ?? "";
const hostPassword = process.env.E2E_HOST_PASSWORD ?? "";

test.beforeEach(({ context }) => routeLoginIp(context, "painel-fase3"));

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

test.describe("organização: criar evento e convidar anfitrião", () => {
  // Organização e dona só deste teste: o evento novo não aparece para o admin dos outros e2e.
  const run = Date.now().toString(36);
  const ownerEmail = `dona-f3-${run}@exemplo.com`;
  const ownerPass = `Dona-e2e-${run}-ok`;
  const slug = `e2e-f3-${run}`;
  const hostEmail = `anfitriao-f3-${run}@exemplo.com`;
  const hostPass = `Senha-e2e-${run}-ok`;
  let orgId = 0;

  test.beforeAll(() => {
    orgId = fase3Org(run, ownerPass).orgId;
  });
  test.afterAll(() => fase3Cleanup(run));

  test("criar evento → negar presentes → convidar → aceitar → anfitrião só no evento dele", async ({
    page,
    browser,
  }) => {
    await login(page, ownerEmail, ownerPass);
    // Dona sem evento: entra direto no início da organização.
    await expect(page).toHaveURL(new RegExp(`#/o/${orgId}$`));

    // Novo evento pela UI: endereço conferido na hora; nasce rascunho e abre no painel.
    await page.goto(`${painelUrl}#/o/${orgId}/eventos/novo`);
    await page.getByLabel("Nome do evento").fill(`Festa E2E ${run}`);
    await page.getByLabel("Data").fill("2031-05-10");
    await page.getByLabel(/^Endereço do evento/).fill(slug);
    await expect(page.getByText("Disponível.")).toBeVisible();
    await page.getByRole("button", { name: "Criar evento" }).click();
    await expect(page).toHaveURL(/#\/e\/\d+$/);
    const eventId = Number(/#\/e\/(\d+)$/.exec(page.url())![1]);
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

    // Permissões: o anfitrião deste evento não vê presentes (e por isso não mexe neles).
    await page.goto(`${painelUrl}#/o/${orgId}/eventos/${eventId}/permissoes`);
    const giftsRead = page.getByRole("checkbox", { name: "Ver a lista de presentes" });
    await expect(giftsRead).toBeChecked();
    await giftsRead.uncheck();
    await page.getByRole("button", { name: "Salvar permissões" }).click();
    await expect(page.getByText("Permissões do anfitrião salvas.")).toBeVisible();

    // Convite de anfitrião por e-mail.
    await page.goto(`${painelUrl}#/o/${orgId}/eventos/${eventId}/anfitrioes`);
    await page.getByLabel("E-mail").fill(hostEmail);
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByText(`Convite enviado para ${hostEmail}.`)).toBeVisible();
    const token = fase3InviteToken(hostEmail);

    // Aceite em contexto anônimo: cria a conta com senha e entra direto no evento.
    const anon = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await routeLoginIp(anon, "painel-fase3-aceite");
    const guest = await anon.newPage();
    await guest.goto(`${painelUrl}#/aceitar/${token}`);
    await expect(guest.getByRole("heading", { name: "Convite para o painel" })).toBeVisible();
    await guest.getByLabel("Seu nome").fill("Anfitriã E2E");
    await guest.getByLabel(/^Senha/).fill(hostPass);
    await guest.getByLabel(/^Repita a senha/).fill(hostPass);
    await guest.getByRole("button", { name: "Criar conta e aceitar" }).click();
    await expect(guest).toHaveURL(new RegExp(`#/e/${eventId}$`));

    const nav = guest.getByRole("navigation", { name: "Seções do painel" });
    await expect(nav.getByRole("link", { name: "Convites" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Presentes" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Anfitriões" })).toHaveCount(0);
    await expect(guest.getByLabel("Organização e evento")).toHaveCount(0);

    // Área negada pelo hash: aviso no painel (e a API responde 403).
    await guest.goto(`${painelUrl}#/e/${eventId}/presentes`);
    await expect(guest.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
    const gifts = await guest.request.get(
      `${painelUrl.replace(/\/painel\/$/, "")}/api/admin/events/${eventId}/gifts`,
    );
    expect(gifts.status()).toBe(403);

    // Organização e outros eventos não são dele: volta para o próprio evento.
    await guest.goto(`${painelUrl}#/o/${orgId}`);
    await expect(guest).toHaveURL(new RegExp(`#/e/${eventId}$`));
    await guest.goto(`${painelUrl}#/e/1`);
    await expect(guest).toHaveURL(new RegExp(`#/e/${eventId}$`));
    await anon.close();
  });
});
