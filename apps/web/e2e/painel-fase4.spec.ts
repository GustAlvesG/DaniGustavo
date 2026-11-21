import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { fase4Cleanup, fase4Member, resetFase2 } from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { E2E_HOST, MULTI_EVENT } from "./support/multi-setup";

/*
 * Fase 4: gestão do evento no painel. Entra como o anfitrião de teste (só do evento ana-bruno),
 * confere o grupo "Gestão" do menu, abre as quatro páginas e monta um cronograma: cria duas
 * atividades fora de ordem (a lista ordena por horário), edita uma e exclui as duas.
 *
 * Fluxo da fase (dados marcados com `run`, apagados no fim): uma gestora (membro da organização
 * do evento de teste, criada pelo apoio de banco) cria um modelo de tarefas e um fornecedor no
 * catálogo; o anfitrião aplica o modelo (prazos contados da data do evento, 20/01/2028), liga o
 * fornecedor ao evento, anexa e baixa um contrato em PDF, cria um orçamento com itens, leva-o até
 * contratado com parcelas que somam o total, paga uma parcela e confere o planejado × realizado
 * no Financeiro e os cartões do início do evento.
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

async function login(page: Page, email: string = E2E_HOST.email, pass: string = password) {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(pass);
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
    await page.getByRole("dialog").getByLabel("Atividade", { exact: true }).fill(title);
    await page.getByRole("dialog").getByLabel("Início", { exact: true }).fill(start);
    await page.getByRole("dialog").getByLabel("Local", { exact: true }).fill(location);
    await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText(title)).toBeVisible();
  };
  const late = `Bolo ${run}`;
  const early = `Cerimônia ${run}`;
  await add(late, "21:00", "Salão");
  await add(early, "16:00", "Jardim");

  const titles = page.locator(".schedule-item .row__title");
  await expect(titles.filter({ hasText: run })).toHaveText([early, late]);

  await page.getByRole("button", { name: `Editar ${early}` }).click();
  await page.getByRole("dialog").getByLabel("Início", { exact: true }).fill("22:30");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(titles.filter({ hasText: run })).toHaveText([late, early]);

  for (const title of [late, early]) {
    await page.getByRole("button", { name: `Excluir ${title}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  }
});

test.describe("fluxo da gestão: modelo, fornecedor, contrato, orçamento e financeiro", () => {
  test.describe.configure({ mode: "serial" });
  // Quatro logins a mais: cota própria de tentativas (a rota mais nova vale sobre a do arquivo).
  test.beforeEach(({ context }) => routeLoginIp(context, "painel-fase4-fluxo"));

  const managerEmail = `gestora-f4-${run}@exemplo.com`;
  const managerPass = `Gestora-e2e-${run}-ok`;
  const template = `Checklist ${run}`;
  const taskA = `Fechar buffet ${run}`;
  const taskB = `Provar o traje ${run}`;
  const vendor = `Foto Luz ${run}`;
  const quote = `Cobertura ${run}`;
  // %PDF- no começo basta para a detecção pelos bytes; o resto é um PDF mínimo de verdade.
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  let orgId = 0;

  test.beforeAll(() => {
    orgId = fase4Member(run, MULTI_EVENT.slug, managerPass).orgId;
  });
  test.afterAll(() => fase4Cleanup(run, MULTI_EVENT.slug, "fotografia"));

  test("organização: cria o modelo de tarefas e o fornecedor do catálogo", async ({ page }) => {
    await login(page, managerEmail, managerPass);

    await page.goto(`${painelUrl}#/o/${orgId}/modelos`);
    await expect(page.getByRole("heading", { level: 1, name: "Modelos de tarefas" })).toBeVisible();
    await page.getByRole("button", { name: "Novo modelo" }).click();
    await expect(page).toHaveURL(new RegExp(`#/o/${orgId}/modelos/\\d+$`));
    await page.getByLabel("Nome do modelo").fill(template);
    await page.getByRole("button", { name: "Adicionar tarefa" }).click();
    await page.getByRole("button", { name: "Adicionar tarefa" }).click();
    await page.getByLabel("Tarefa 1", { exact: true }).fill(taskA);
    await page.getByLabel("Tarefa 2", { exact: true }).fill(taskB);
    // Tarefa 1: 30 dias antes (padrão); tarefa 2: 60 dias antes.
    await page.getByLabel("Quantos dias").nth(1).fill("60");
    await page.getByRole("button", { name: "Salvar modelo" }).click();
    await expect(page.getByText("Modelo salvo.")).toBeVisible();
    await page.goto(`${painelUrl}#/o/${orgId}/modelos`);
    await expect(page.getByTestId("modelo").filter({ hasText: template })).toContainText(
      "2 tarefas",
    );

    await page.goto(`${painelUrl}#/o/${orgId}/fornecedores`);
    await expect(page.getByRole("heading", { level: 1, name: "Fornecedores" })).toBeVisible();
    await page.getByRole("button", { name: "Novo fornecedor" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill(vendor);
    await dialog.getByLabel("Categoria").selectOption("fotografia");
    await dialog.getByLabel("Telefone ou WhatsApp").fill("(11) 98888-7777");
    await dialog.getByLabel("Avaliação").selectOption("5");
    await dialog.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText(`${vendor} entrou no catálogo.`)).toBeVisible();
    await expect(page.getByTestId("fornecedor").filter({ hasText: vendor })).toContainText(
      "Fotografia",
    );
  });

  test("anfitrião: aplica o modelo e confere os prazos", async ({ page }) => {
    await login(page);
    await page.goto(`${painelUrl}#/e/${eventId}/tarefas`);
    await expect(page.getByRole("heading", { level: 1, name: "Tarefas" })).toBeVisible();
    await page.getByRole("button", { name: "Aplicar modelo" }).click();
    const row = page.getByTestId("modelo-aplicar").filter({ hasText: template });
    await row.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText(`2 tarefas criadas a partir de "${template}".`)).toBeVisible();

    const tasks = page.getByTestId("tarefa");
    await expect(tasks.filter({ hasText: taskA })).toContainText(
      "21/12/2027 · 30 dias antes do evento",
    );
    await expect(tasks.filter({ hasText: taskB })).toContainText(
      "21/11/2027 · 60 dias antes do evento",
    );
  });

  test("anfitrião: liga o fornecedor do catálogo e anexa o contrato", async ({ page }) => {
    await login(page);
    await page.goto(`${painelUrl}#/e/${eventId}/fornecedores`);
    await expect(page.getByRole("heading", { level: 1, name: "Fornecedores" })).toBeVisible();
    await page.getByRole("button", { name: "Adicionar fornecedor" }).click();
    const dialog = page.getByRole("dialog");
    const select = dialog.getByLabel(/^Fornecedor/);
    const option = select.locator("option", { hasText: vendor });
    await expect(option).toHaveCount(1);
    await select.selectOption((await option.getAttribute("value"))!);
    await dialog.getByRole("button", { name: "Adicionar ao evento" }).click();
    await expect(page.getByText(`${vendor} entrou no evento.`)).toBeVisible();

    await page.getByTestId("fornecedor-evento").getByRole("link", { name: vendor }).click();
    await expect(page.getByRole("heading", { level: 1, name: vendor })).toBeVisible();
    await page.getByLabel("Nome do contrato").fill("Contrato de fotografia");
    await page.getByLabel(/^Arquivo/).setInputFiles({
      name: "contrato-foto.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByRole("button", { name: "Anexar", exact: true }).click();
    await expect(page.getByText("Contrato anexado.")).toBeVisible();
    const contract = page.getByTestId("contrato");
    await expect(contract).toContainText("contrato-foto.pdf");

    // O download sai pelo painel, com a sessão, e traz os mesmos bytes.
    const download = page.waitForEvent("download");
    await contract.getByRole("link", { name: "Contrato de fotografia" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("contrato-foto.pdf");
    expect(Buffer.compare(await readFile(await file.path()), pdf)).toBe(0);
  });

  test("anfitrião: orçamento com itens até contratado, parcela paga e financeiro", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`${painelUrl}#/e/${eventId}/financeiro`);
    await expect(page.getByRole("heading", { level: 1, name: "Financeiro" })).toBeVisible();

    // Previsto da categoria.
    await page.getByRole("button", { name: "Editar previsto" }).click();
    const plan = page.getByRole("dialog");
    await plan.getByLabel("Fotografia", { exact: true }).fill("5.000,00");
    await plan.getByRole("button", { name: "Salvar previsto" }).click();
    await expect(page.getByText("Previsto salvo.")).toBeVisible();

    // Orçamento: 1 × R$ 3.000,00 + 2 × R$ 250,00 = R$ 3.500,00.
    await page.getByRole("button", { name: "Novo orçamento" }).click();
    const form = page.getByRole("dialog");
    const select = form.getByLabel(/^Fornecedor/);
    const option = select.locator("option", { hasText: vendor });
    await expect(option).toHaveCount(1);
    await select.selectOption((await option.getAttribute("value"))!);
    await form.getByLabel("Nome do orçamento").fill(quote);
    await form.getByLabel("Descrição").nth(0).fill("Cobertura do dia");
    await form.getByLabel("Valor unitário (R$)").nth(0).fill("3.000,00");
    await form.getByRole("button", { name: "Mais um item" }).click();
    await form.getByLabel("Descrição").nth(1).fill("Álbum impresso");
    await form.getByLabel("Quantidade").nth(1).fill("2");
    await form.getByLabel("Valor unitário (R$)").nth(1).fill("250,00");
    await expect(form).toContainText("Soma dos itens R$ 3.500,00");
    await form.getByRole("button", { name: "Criar orçamento" }).click();
    await expect(page).toHaveURL(new RegExp(`#/e/${eventId}/financeiro/orcamentos/\\d+$`));
    await expect(page.getByRole("heading", { level: 1, name: quote })).toBeVisible();

    await page.getByRole("button", { name: "Marcar como recebido" }).click();
    await expect(page.getByText("Orçamento agora está como “Recebido”.")).toBeVisible();
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByText("Orçamento agora está como “Aprovado”.")).toBeVisible();

    await page.getByRole("button", { name: "Contratar…" }).click();
    const contract = page.getByRole("dialog");
    await contract.getByLabel("Parcelas mensais").fill("2");
    await contract.getByLabel("Primeiro vencimento").fill("2027-06-10");
    await contract.getByRole("button", { name: "Dividir em partes iguais" }).click();
    await expect(contract).toContainText("Soma: R$ 3.500,00 de R$ 3.500,00");
    await contract.getByRole("button", { name: "Contratar", exact: true }).click();
    await expect(page.getByText("Orçamento contratado.")).toBeVisible();
    await expect(page.getByText("Parcela 1 · R$ 1.750,00")).toBeVisible();
    await expect(page.getByText("Parcela 2 · R$ 1.750,00")).toBeVisible();

    await page.getByRole("button", { name: "Marcar paga hoje" }).first().click();
    await expect(page.getByText("Parcela marcada como paga.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Desfazer" })).toHaveCount(1);

    // Planejado × realizado da categoria.
    await page.goto(`${painelUrl}#/e/${eventId}/financeiro`);
    const line = page.getByRole("row").filter({ hasText: "Fotografia" });
    await expect(line).toContainText("R$ 5.000,00");
    await expect(line).toContainText("R$ 3.500,00");
    await expect(line).toContainText("R$ 1.750,00");
    await expect(page.getByText(quote)).toBeVisible();

    // O fornecedor passou a contratado.
    await page.goto(`${painelUrl}#/e/${eventId}/fornecedores`);
    await expect(page.getByTestId("fornecedor-evento").filter({ hasText: vendor })).toContainText(
      "Contratado",
    );

    // Cartões do início do evento.
    await page.goto(`${painelUrl}#/e/${eventId}`);
    const money = page.getByRole("region", { name: "Financeiro" });
    await expect(money).toContainText("R$ 3.500,00");
    // As parcelas vencem no dia 10: a data de calendário não pode cair no dia anterior.
    await expect(money).toContainText(/Próximas: R\$\s1\.750,00 em 10 de /);
    await expect(page.getByRole("region", { name: "Tarefas" })).toBeVisible();
  });
});
