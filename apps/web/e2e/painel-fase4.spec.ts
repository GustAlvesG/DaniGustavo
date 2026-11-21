import { expect, test, type Page } from "@playwright/test";
import { resetFase2 } from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { E2E_HOST, MULTI_EVENT } from "./support/multi-setup";

/*
 * Fase 4: gestão do evento no painel. Entra como o anfitrião de teste (só do evento ana-bruno),
 * confere o grupo "Gestão" do menu, abre as quatro páginas e monta um cronograma: cria duas
 * atividades fora de ordem (a lista ordena por horário), edita uma e exclui as duas. A
 * integração roda este arquivo com as frentes de tarefas, fornecedores e orçamento juntas.
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const password = process.env.E2E_HOST_PASSWORD ?? "";
const run = Date.now().toString(36);

test.skip(!password, "Sem a senha do anfitrião de teste (setup global).");
test.beforeEach(({ context }) => routeLoginIp(context, "painel-fase4"));

let eventId = 0;
test.beforeAll(async () => {
  eventId = await resetFase2(MULTI_EVENT.slug);
});

async function login(page: Page) {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(E2E_HOST.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}

test("menu de gestão leva às quatro páginas", async ({ page }) => {
  await login(page);
  await page.goto(`${painelUrl}#/e/${eventId}`);
  const nav = page.getByRole("navigation", { name: "Seções do painel" });
  for (const [label, hash] of [
    ["Tarefas", "tarefas"],
    ["Fornecedores", "fornecedores"],
    ["Financeiro", "financeiro"],
    ["Cronograma", "cronograma"],
  ] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/e/${eventId}/${hash}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("cronograma: cria fora de ordem, ordena por horário, edita e exclui", async ({ page }) => {
  await login(page);
  await page.goto(`${painelUrl}#/e/${eventId}/cronograma`);
  await expect(page.getByRole("heading", { level: 1, name: "Cronograma do dia" })).toBeVisible();

  const add = async (title: string, start: string, location: string) => {
    await page.getByRole("button", { name: "Nova atividade" }).click();
    await page.getByLabel("Atividade").fill(title);
    await page.getByLabel("Início").fill(start);
    await page.getByLabel("Local").fill(location);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(title)).toBeVisible();
  };
  const late = `Bolo ${run}`;
  const early = `Cerimônia ${run}`;
  await add(late, "21:00", "Salão");
  await add(early, "16:00", "Jardim");

  const titles = page.locator(".schedule-item .row__title");
  await expect(titles.filter({ hasText: run })).toHaveText([early, late]);

  await page.getByRole("button", { name: `Editar ${early}` }).click();
  await page.getByLabel("Início").fill("22:30");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(titles.filter({ hasText: run })).toHaveText([late, early]);

  for (const title of [late, early]) {
    await page.getByRole("button", { name: `Excluir ${title}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  }
});
