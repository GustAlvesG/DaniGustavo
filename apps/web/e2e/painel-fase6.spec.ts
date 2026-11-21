import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  fase6Admin,
  fase6Cleanup,
  fase6Invitation,
  fase6PastDue,
  fase6Restore,
  fase6SignupToken,
} from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { prepare, waitForHydration } from "./support/rsvp";

/*
 * Fase 6 da plataforma (docs/saas/fase-6.md), de ponta a ponta com dados próprios por rodada:
 *  1. cadastro self-service no site da plataforma (`plataforma.localhost:<porta>`, ver
 *     playwright.config.ts) até a confirmação em `#/cadastro/<token>` e a entrada no painel;
 *  2. limite do plano Essencial (1 evento ativo): ativar o 2º evento → 409 `plan_limit` na tela;
 *  3. domínios: endereço automático `<slug>.f6.localhost:<porta>` (verificado) e domínio próprio
 *     com as instruções do TXT, que não abre o site enquanto não for verificado. A verificação
 *     de verdade não roda aqui: o processo da API consulta o DNS do sistema (o resolvedor falso
 *     só existe nos testes da API, `setTxtResolver`), e nenhum `*.localhost` tem TXT;
 *  4. categoria própria da organização num fornecedor e orçamento contratado reaberto;
 *  5. inadimplência além da carência: painel só leitura (402 com aviso), mas o site do evento e
 *     o RSVP (com o aceite do aviso de privacidade: sem marcar → erro) continuam;
 *  6. privacidade do evento: exportação JSON;
 *  7. apagar evento arquivado confirmando pelo endereço (slug).
 * Em todas as páginas, nenhuma violação da CSP (site, painel e API). Com `F6_SCREENSHOTS=1`,
 * grava as telas da fase em `.screenshots/saas-fase6/` (390×844 e 1440×900).
 * Tudo o que o teste cria sai no fim (organização, eventos, cadastro e contas).
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const port = Number(process.env.E2E_PORT ?? 3100);
const platform = `http://plataforma.localhost:${port}`;
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ownerEmail = `dona-f6-${run}@exemplo.com`;
const password = `Senha-f6-${run}-ok`;
const nameA = `Festa F6 ${run}`;
const nameB = `Bodas F6 ${run}`;
const customHost = `f6c-${run}.localhost:${port}`;
const category = `Brinquedoteca ${run}`;
const vendor = `Pula Pula ${run}`;
const quote = `Brinquedos ${run}`;
const guest = `Convidada F6 ${run}`;

const shotsDir = process.env.F6_SCREENSHOTS
  ? join(__dirname, "..", "..", "..", ".screenshots", "saas-fase6")
  : null;

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const cspErrors: string[] = [];
let orgId = 0;
let eventA = 0;
let eventB = 0;
let slugA = "";
let slugB = "";

/** Junta as violações da CSP (console "Refused to…" e o evento `securitypolicyviolation`). */
async function watchCsp(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(
        `CSP violada em ${location.href}: ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
      );
    });
  });
  ctx.on("console", (msg) => {
    const text = msg.text();
    if (/CSP violada|Content Security Policy|Refused to/i.test(text)) {
      cspErrors.push(`${msg.location().url}: ${text}`);
    }
  });
}

/** Foto da tela nos dois tamanhos (só com F6_SCREENSHOTS). */
async function shot(p: Page, name: string, ready?: () => Promise<void>) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  const original = p.viewportSize();
  // Sem o selo do `next dev` ("Cache disabled") por cima da tela.
  // Nem os avisos (toasts) de ações anteriores.
  const hide = await p
    .addStyleTag({ content: "nextjs-portal,.toasts{display:none!important}" })
    .catch(() => null);
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await p.setViewportSize({ width: w, height: h });
    await ready?.();
    await p.waitForTimeout(400);
    // Sem rolagem lateral no celular.
    expect(await p.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(
      w,
    );
    await p.screenshot({ path: join(shotsDir, `${name}-${w}.png`), fullPage: true });
  }
  await hide?.evaluate((el) => (el as Element).remove()).catch(() => {});
  if (original) await p.setViewportSize(original);
}

async function login(p: Page, email: string, pass: string) {
  await p.goto(painelUrl);
  await p.getByLabel("E-mail").fill(email);
  await p.getByLabel("Senha").fill(pass);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByRole("button", { name: "Sair" })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  await routeLoginIp(context, "painel-fase6");
  await watchCsp(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  fase6Cleanup(run);
});

test.afterEach(() => {
  expect(cspErrors, "violações da CSP").toEqual([]);
});

test("cadastro self-service: site da plataforma → e-mail → confirmação → painel", async () => {
  test.setTimeout(90_000);
  // IP próprio: o cadastro aceita 3 pedidos por 10 min por IP.
  await prepare(page);

  await page.goto(`${platform}/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "plataforma-inicio");

  await page.goto(`${platform}/precos`);
  await expect(page.getByRole("heading", { level: 1, name: "Planos e preços" })).toBeVisible();
  await expect(page.getByText("Essencial").first()).toBeVisible();
  await shot(page, "plataforma-precos");

  await page.goto(`${platform}/cadastro`);
  await expect(page.getByRole("heading", { level: 1, name: "Vamos começar?" })).toBeVisible();
  await waitForHydration(page, '[data-testid="cadastro-form"] button[type="submit"]');
  await shot(page, "plataforma-cadastro");
  const form = page.getByTestId("cadastro-form");
  await form.getByLabel("Seu nome").fill("Lia Fase Seis");
  await form.getByLabel("Seu e-mail").fill(ownerEmail);
  await form.getByLabel(/Nome do casal, da família/).fill(`Lia & Caio ${run}`);
  await form.getByLabel("Plano").selectOption("essencial");
  // Sem aceitar os termos: o formulário diz o que falta.
  await form.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByText("É preciso aceitar os termos e a política de privacidade."),
  ).toBeVisible();
  await page
    .getByTestId("cadastro-form")
    .getByLabel(/Li e aceito os/)
    .check();
  await page
    .getByTestId("cadastro-form")
    .getByRole("button", { name: "Criar minha conta" })
    .click();
  await expect(page.getByTestId("cadastro-enviado")).toContainText(ownerEmail);

  // O link do e-mail (o banco só guarda o hash; o e2e troca por um token conhecido).
  const token = fase6SignupToken(ownerEmail);
  await page.goto(`${painelUrl}#/cadastro/${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Confirmar cadastro" })).toBeVisible();
  // O e-mail aparece mascarado (do***@exemplo.com).
  await expect(page.getByText(/Conta para do\*{3}@exemplo\.com, plano Essencial/)).toBeVisible();
  // Os rótulos trazem a dica junto ("Senha Pelo menos 10 caracteres.").
  await page.getByLabel(/^Senha/).fill(password);
  await page.getByLabel("Repita a senha").fill(password);
  await page.getByRole("button", { name: "Criar conta e entrar" }).click();
  await expect(page).toHaveURL(/#\/o\/\d+/, { timeout: 15_000 });
  orgId = Number(/#\/o\/(\d+)/.exec(page.url())![1]);
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

  // Plano em teste grátis.
  await page.goto(`${painelUrl}#/o/${orgId}/plano`);
  await expect(page.getByRole("heading", { level: 1, name: "Plano e assinatura" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Essencial" })).toBeVisible();
  await expect(page.getByText("Teste até")).toBeVisible();
  await shot(page, "painel-org-plano");
});

/** Cria um evento (rascunho) pela tela da organização; devolve id e endereço. */
async function createEvent(name: string, date: string): Promise<[number, string]> {
  await page.goto(`${painelUrl}#/o/${orgId}/eventos/novo`);
  await page.getByLabel("Nome do evento").fill(name);
  await page.getByLabel("Data", { exact: true }).fill(date);
  await expect(page.getByText("Disponível.")).toBeVisible();
  const slug = await page.getByLabel("Endereço do evento").inputValue();
  await page.getByRole("button", { name: "Criar evento" }).click();
  await expect(page).toHaveURL(/#\/e\/\d+/, { timeout: 15_000 });
  return [Number(/#\/e\/(\d+)/.exec(page.url())![1]), slug];
}

const eventRow = (name: string) => page.locator("li.row", { hasText: name });

test("limite do plano: o segundo evento ativo é recusado com a mensagem do plano", async () => {
  test.setTimeout(90_000);
  [eventA, slugA] = await createEvent(nameA, "2028-05-20");
  [eventB, slugB] = await createEvent(nameB, "2028-08-12");

  await page.goto(`${painelUrl}#/o/${orgId}/eventos`);
  await eventRow(nameA).getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByText(`${nameA} está no ar.`)).toBeVisible();
  await eventRow(nameB).getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByText(/O plano atual permite até 1 \(eventos ativos\)/)).toBeVisible();
  await expect(eventRow(nameB)).toContainText("Rascunho");

  // Data e fuso pela lista da organização (Fase 6, ajustes).
  await eventRow(nameA)
    .getByRole("button", { name: `Data e fuso de ${nameA}` })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "painel-org-evento-data");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
});

test("domínios: endereço automático verificado e domínio próprio aguardando o TXT", async () => {
  test.setTimeout(90_000);
  const auto = `${slugA}.f6.localhost:${port}`;
  await page.goto(`${painelUrl}#/o/${orgId}/eventos/${eventA}/dominios`);
  await expect(page.getByRole("heading", { level: 1, name: "Domínios do evento" })).toBeVisible();
  const autoRow = page.getByTestId("dominio").filter({ hasText: auto });
  await expect(autoRow).toContainText("Principal");
  await expect(autoRow).toContainText("Verificado");

  await page.getByLabel("Domínio", { exact: true }).fill(customHost);
  await page.getByRole("button", { name: "Cadastrar domínio" }).click();
  const custom = page.getByTestId("dominio").filter({ hasText: customHost });
  await expect(custom).toContainText("Aguardando DNS");
  const steps = custom.getByTestId("dominio-instrucoes");
  await expect(steps.getByLabel("Registro TXT: nome")).toHaveValue(
    `_plataforma-verificacao.${customHost.replace(/:\d+$/, "")}`,
  );
  await expect(steps.getByLabel("Registro TXT: valor")).toHaveValue(/^plataforma-[0-9a-f]{32}$/);
  // O DNS do sistema não tem o TXT: segue não verificado, com o motivo.
  await custom.getByRole("button", { name: "Verificar agora" }).click();
  await expect(
    page.getByText(/Não encontramos o registro TXT|Não deu para consultar o DNS/).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(custom).toContainText("Aguardando DNS");
  await shot(page, "painel-evento-dominios");

  // O site abre pelo endereço automático e não pelo domínio ainda não verificado.
  const site = await context.newPage();
  await prepare(site);
  const ok = await site.goto(`http://${auto}/`);
  expect(ok?.status()).toBe(200);
  await expect(site.getByRole("heading", { level: 1 })).toContainText(nameA.split(" ")[0]!);
  const no = await site.goto(`http://${customHost}/`);
  expect(no?.status()).toBe(404);
  await site.close();
});

test("categoria própria no fornecedor e orçamento contratado reaberto", async () => {
  test.setTimeout(120_000);
  await page.goto(`${painelUrl}#/o/${orgId}/categorias`);
  await page.getByLabel(/^Nome/).fill(category);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(page.getByText("Categoria criada.")).toBeVisible();
  await expect(page.getByTestId("categoria").filter({ hasText: category })).toBeVisible();
  await shot(page, "painel-org-categorias");

  await page.goto(`${painelUrl}#/o/${orgId}/fornecedores`);
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill(vendor);
  await dialog.getByLabel("Categoria").selectOption({ label: category });
  await dialog.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(`${vendor} entrou no catálogo.`)).toBeVisible();
  await expect(page.getByTestId("fornecedor").filter({ hasText: vendor })).toContainText(category);

  await page.goto(`${painelUrl}#/e/${eventA}/fornecedores`);
  await page.getByRole("button", { name: "Adicionar fornecedor" }).click();
  const add = page.getByRole("dialog");
  const pick = add.getByLabel(/^Fornecedor/);
  await pick.selectOption(
    (await pick.locator("option", { hasText: vendor }).getAttribute("value"))!,
  );
  await add.getByRole("button", { name: "Adicionar ao evento" }).click();
  await expect(page.getByText(`${vendor} entrou no evento.`)).toBeVisible();

  await page.goto(`${painelUrl}#/e/${eventA}/financeiro`);
  await page.getByRole("button", { name: "Novo orçamento" }).click();
  const form = page.getByRole("dialog");
  const sel = form.getByLabel(/^Fornecedor/);
  await sel.selectOption((await sel.locator("option", { hasText: vendor }).getAttribute("value"))!);
  await form.getByLabel("Nome do orçamento").fill(quote);
  await form.getByLabel("Descrição").nth(0).fill("Pula-pula e piscina de bolinhas");
  await form.getByLabel("Valor unitário (R$)").nth(0).fill("800,00");
  await form.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quote })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como recebido" }).click();
  await expect(page.getByText("Orçamento agora está como “Recebido”.")).toBeVisible();
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText("Orçamento agora está como “Aprovado”.")).toBeVisible();
  await page.getByRole("button", { name: "Contratar…" }).click();
  const contract = page.getByRole("dialog");
  await contract.getByLabel("Parcelas mensais").fill("2");
  await contract.getByLabel("Primeiro vencimento").fill("2028-01-10");
  await contract.getByRole("button", { name: "Dividir em partes iguais" }).click();
  await contract.getByRole("button", { name: "Contratar", exact: true }).click();
  await expect(page.getByText("Orçamento contratado.")).toBeVisible();
  await expect(page.getByText("Parcela 1 · R$ 400,00")).toBeVisible();

  // Sem parcela paga: reabre, volta a "Aprovado" e as parcelas somem.
  await page.getByRole("button", { name: "Reabrir orçamento" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(
    page.getByText("Orçamento reaberto: voltou a “Aprovado” e as parcelas foram apagadas."),
  ).toBeVisible();
  await expect(page.getByText("Parcela 1 · R$ 400,00")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Contratar…" })).toBeVisible();
});

test("inadimplência: painel só leitura, site e RSVP (com aceite do aviso) no ar", async () => {
  test.setTimeout(120_000);
  const token = fase6Invitation(slugA, `Convite F6 ${run}`, guest);
  fase6PastDue(orgId, 20);
  try {
    await page.goto(`${painelUrl}#/o/${orgId}/categorias`);
    // O aviso do topo lê a assinatura quando o painel da organização abre: recarrega.
    await page.reload();
    await expect(page.getByText(/em atraso além da carência/).first()).toBeVisible();
    await page.getByLabel(/^Nome/).fill(`Bloqueada ${run}`);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByText(/o painel está só para consulta/).first()).toBeVisible();
    await expect(page.getByTestId("categoria").filter({ hasText: `Bloqueada ${run}` })).toHaveCount(
      0,
    );

    // O site dos convidados não passa pelo bloqueio.
    const site = await context.newPage();
    await prepare(site);
    const res = await site.goto(`http://${slugA}.f6.localhost:${port}/c/${token}`);
    expect(res?.status()).toBe(200);
    await expect(site.getByRole("heading", { level: 1 })).toHaveText(`Convite F6 ${run}`);
    await waitForHydration(site, 'button[type="submit"]');
    await site
      .getByRole("radiogroup", { name: new RegExp(`^${guest}`) })
      .getByRole("radio", { name: "Vai", exact: true })
      .check();
    await site.getByRole("button", { name: "Continuar" }).click();
    await expect(site.getByRole("heading", { level: 2, name: "Detalhes" })).toBeVisible();
    await site.getByRole("button", { name: "Continuar" }).click();
    await expect(site.getByRole("heading", { level: 2, name: "Revisão" })).toBeVisible();

    // Sem o aceite do aviso de privacidade: não envia e diz o que falta.
    await site.getByRole("button", { name: "Confirmar presença" }).click();
    await expect(
      site.getByText("Para enviar, marque que você leu e concorda com o aviso de privacidade."),
    ).toBeVisible();
    await expect(site.getByTestId("rsvp-done")).toHaveCount(0);
    await shot(site, "site-rsvp-consentimento");

    await site.getByTestId("rsvp-consent").check();
    await site.getByRole("button", { name: "Confirmar presença" }).click();
    await expect(
      site.getByTestId("rsvp-done").getByRole("heading", { name: "Presença confirmada" }),
    ).toBeVisible();

    // Página de privacidade do evento (aviso + pedido do titular).
    const priv = await site.goto(`http://${slugA}.f6.localhost:${port}/privacidade`);
    expect(priv?.status()).toBe(200);
    await expect(site.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(site, "site-privacidade");
    await site.close();
  } finally {
    fase6Restore(orgId);
  }
});

test("privacidade do evento: exportação dos dados em JSON", async () => {
  await page.goto(`${painelUrl}#/e/${eventA}/privacidade`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar tudo (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const text = await readFile(await file.path(), "utf8");
  expect(text).toContain(guest);
  await shot(page, "painel-evento-privacidade");
});

test("apagar evento arquivado confirmando pelo endereço", async () => {
  await page.goto(`${painelUrl}#/o/${orgId}/eventos`);
  await eventRow(nameB).getByRole("button", { name: "Arquivar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arquivar" }).click();
  await expect(page.getByText(`${nameB} foi arquivado.`)).toBeVisible();
  await eventRow(nameB).getByRole("link", { name: "Apagar…" }).click();
  await expect(page).toHaveURL(new RegExp(`#/o/${orgId}/eventos/${eventB}/apagar$`));
  await expect(page.getByRole("heading", { level: 1, name: "Apagar evento" })).toBeVisible();

  const submit = page.getByRole("button", { name: "Apagar o evento para sempre" });
  await page.getByTestId("apagar-slug").fill(`${slugB}-errado`);
  await expect(submit).toBeDisabled();
  await page.getByTestId("apagar-slug").fill(slugB);
  await shot(page, "painel-org-apagar-evento");
  await submit.click();
  await expect(page.getByText(`Evento ${nameB} apagado.`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/o/${orgId}/eventos$`));
  await expect(eventRow(nameB)).toHaveCount(0);
  await expect(eventRow(nameA)).toBeVisible();
});

test("telas da fase: configurações (monograma e agenda) e painel da plataforma", async () => {
  test.setTimeout(90_000);
  await page.goto(`${painelUrl}#/e/${eventA}/configuracoes`);
  await expect(page.getByLabel("Arte do monograma")).toBeVisible();
  await expect(page.getByLabel("Código do evento na agenda")).toBeVisible();
  await shot(page, "painel-evento-configuracoes", async () => {
    await page.locator("#cfg-identidade").scrollIntoViewIfNeeded();
  });

  // Painel da plataforma: só o platform admin (aqui, um admin próprio do e2e).
  const adminPass = `Admin-f6-${run}-ok`;
  const { email } = fase6Admin(run, adminPass);
  const admin = await context
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  await routeLoginIp(admin, "painel-fase6-admin");
  await watchCsp(admin);
  const p = await admin.newPage();
  await login(p, email, adminPass);
  await p.goto(`${painelUrl}#/plataforma`);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(p, "painel-plataforma");
  await p.goto(`${painelUrl}#/plataforma/organizacoes`);
  await expect(
    p.getByRole("link", { name: new RegExp(`^Lia & Caio ${run} Essencial`) }),
  ).toBeVisible();
  await shot(p, "painel-plataforma-organizacoes");
  await admin.close();
});
