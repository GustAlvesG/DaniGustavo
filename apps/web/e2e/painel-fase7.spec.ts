import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fase7Cleanup, fase7Setup, type Fase7Setup } from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { prepare, waitForHydration } from "./support/rsvp";

/*
 * Fase 7 da plataforma (docs/saas/fase-7.md): o dia do evento, de ponta a ponta, num evento
 * próprio por rodada (org com o plano Essencial em teste, dona com senha dada, evento ativo em
 * `f7-<run>.localhost:<porta>`; ver `fase7-setup` em support/db-cli.mts). Contagens exatas:
 * o convite "Família" tem 2 confirmados; os outros convites estão pendentes.
 *  1. mesas: cria duas, senta o convite inteiro numa e abre a impressão (folhas e plaquinhas);
 *  2. check-in: o painel gera o link da portaria (link e PIN mostrados uma vez) → a portaria
 *     abre num contexto anônimo, entra com o PIN, busca pelo nome, vê a mesa e o aviso, marca
 *     1 de 2, marca mais 1 e desfaz → o painel (check-in e "Hoje") mostra 1 de 2;
 *  3. portal do fornecedor: link gerado no detalhe do fornecedor → contexto anônimo envia
 *     orçamento → no Financeiro ele aparece "Recebido" com o selo "Enviado pelo fornecedor";
 *  4. WhatsApp: edita o modelo do convite, confere o link wa.me, marca enviado e desmarca;
 *  5. telas do dia em 390 px sem rolagem lateral;
 *  6. RSVP com acompanhante passa do limite do plano (300) → aviso no início do painel;
 *  7. Privacidade com a data da anonimização.
 * Em todas as páginas, nenhuma violação da CSP. Com `F7_SCREENSHOTS=1`, grava as telas em
 * `.screenshots/saas-fase7/` (390×844 e 1440×900). Tudo o que o teste cria sai no fim.
 */

const apiBase = (process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "");
const painelUrl = process.env.PAINEL_URL ?? `${apiBase}/painel/`;
const port = Number(process.env.E2E_PORT ?? 3100);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const password = `Dona-f7-${run}-ok`;
const siteHost = `f7-${run}.localhost:${port}`;
const family = `Família Chegada ${run}`;
const rita = `Rita Chegada ${run}`;
const davi = `Davi Chegada ${run}`;
const tableA = `Padrinhos ${run}`;
const tableB = `Amigos ${run}`;
const quote = `Jantar completo ${run}`;

const shotsDir = process.env.F7_SCREENSHOTS
  ? join(__dirname, "..", "..", "..", ".screenshots", "saas-fase7")
  : null;

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const cspErrors: string[] = [];
let fx: Fase7Setup;
const eh = (path = "") => `${painelUrl}#/e/${fx.eventId}${path}`;

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

/** Contexto novo, sem sessão (portaria, portal, convidado), com a CSP vigiada. */
async function anonymous(): Promise<BrowserContext> {
  const ctx = await context
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  await watchCsp(ctx);
  return ctx;
}

/** Sem rolagem lateral na largura atual. */
async function noHorizontalScroll(p: Page, name: string) {
  const width = p.viewportSize()!.width;
  expect(await p.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(
    width,
  );
}

/** Foto da tela nos dois tamanhos (só com F7_SCREENSHOTS). */
async function shot(p: Page, name: string, ready?: () => Promise<void>) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  const original = p.viewportSize();
  // Sem os avisos (toasts) de ações anteriores por cima da tela.
  const hide = await p
    .addStyleTag({ content: ".toasts{display:none!important}" })
    .catch(() => null);
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await p.setViewportSize({ width: w, height: h });
    await ready?.();
    await p.waitForTimeout(400);
    await noHorizontalScroll(p, name);
    await p.screenshot({ path: join(shotsDir, `${name}-${w}.png`), fullPage: true });
  }
  await hide?.evaluate((el) => (el as Element).remove()).catch(() => {});
  if (original) await p.setViewportSize(original);
}

test.beforeAll(async ({ browser }) => {
  fx = fase7Setup(run, password, siteHost);
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  await routeLoginIp(context, "painel-fase7");
  await watchCsp(context);
  page = await context.newPage();
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(fx.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});

test.afterAll(async () => {
  await context?.close();
  fase7Cleanup(run);
});

test.afterEach(() => {
  expect(cspErrors, "violações da CSP").toEqual([]);
});

test("mesas: cria, senta o convite e imprime folhas e plaquinhas", async () => {
  await page.goto(eh("/mesas"));
  await expect(page.getByRole("heading", { level: 1, name: "Mesas" })).toBeVisible();

  for (const [name, seats] of [
    [tableA, "8"],
    [tableB, "6"],
  ] as const) {
    await page.getByRole("button", { name: "Nova mesa" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill(name);
    await dialog.getByLabel(/^Lugares/).fill(seats);
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("region", { name })).toBeVisible();
  }

  // Só os 2 confirmados aparecem "sem mesa" (os pendentes ficam de fora por padrão).
  await expect(page.getByRole("heading", { level: 2, name: "Sem mesa (2)" })).toBeVisible();
  const all = page.getByLabel(`Sentar todo o convite ${family}`);
  await all.selectOption((await all.locator("option", { hasText: tableA }).getAttribute("value"))!);
  const mesa = page.getByRole("region", { name: tableA });
  await expect(mesa).toContainText(rita);
  await expect(mesa).toContainText(davi);
  await expect(mesa).toContainText("2/8");
  await expect(page.getByRole("heading", { level: 2, name: "Sem mesa (0)" })).toBeVisible();
  await noHorizontalScroll(page, "mesas");
  // Nada passa da borda do cartão da mesa (selects com nomes longos encolhem).
  const edges = await mesa.evaluate((card) => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll("*")].every(
      (el) => el.getBoundingClientRect().right <= box.right + 0.5,
    );
  });
  expect(edges, "conteúdo dentro do cartão da mesa").toBe(true);
  await shot(page, "painel-mesas");

  await page.getByRole("link", { name: "Imprimir" }).click();
  await expect(page).toHaveURL(/#\/e\/\d+\/mesas\/imprimir$/);
  await expect(page.getByRole("heading", { level: 1, name: "Imprimir mesas" })).toBeVisible();
  const sheet = page.locator(".mesas-sheet").filter({ hasText: tableA });
  await expect(sheet).toContainText(rita);
  await expect(sheet).toContainText("2 de 8 lugares");
  await shot(page, "painel-mesas-imprimir");
  await page.getByRole("tab", { name: "Plaquinhas" }).click();
  await expect(page.locator(".mesas-card").filter({ hasText: davi })).toContainText(tableA);
  await shot(page, "painel-mesas-plaquinhas");
});

test("check-in: link e PIN → portaria marca chegada parcial e desfaz → contagem no painel", async () => {
  test.setTimeout(90_000);
  await page.goto(eh("/checkin"));
  await expect(page.getByRole("heading", { level: 1, name: "Check-in" })).toBeVisible();
  await page.getByRole("button", { name: "Novo link" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/^Nome do link/)
    .fill(`Portão ${run}`);
  await page.getByRole("dialog").getByRole("button", { name: "Gerar link e PIN" }).click();
  const created = page.getByRole("dialog", { name: "Link da portaria pronto" });
  const link = await created.getByLabel("Link da portaria").inputValue();
  const pin = (await created.getByTestId("checkin-pin").textContent())!.trim();
  expect(link).toMatch(new RegExp(`^${apiBase.replace(/[.]/g, "\\.")}/portaria/#[\\w-]{20,}$`));
  expect(pin).toMatch(/^\d{6}$/);
  await shot(page, "painel-checkin-link");
  await created.getByRole("button", { name: "Pronto, anotei" }).click();
  await expect(page.locator(".row", { hasText: `Portão ${run}` })).toContainText("Ativo");

  // Portaria: contexto anônimo, sem conta.
  const gate = await anonymous();
  const p = await gate.newPage();
  await p.goto(link);
  await expect(p.getByRole("heading", { level: 1, name: "Portaria" })).toBeVisible();
  await shot(p, "portaria-pin");
  await p.getByLabel("PIN").fill(pin);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByRole("heading", { level: 1, name: `Lia & Caio F7 ${run}` })).toBeVisible();
  const totals = p.getByRole("region", { name: "Contagem de chegadas" });
  await expect(totals).toContainText("0 de 2 pessoas confirmadas");

  await p.getByLabel("Nome ou código do convite").fill(rita);
  const card = p.locator(".checkin-inv").filter({ hasText: family });
  await expect(card).toBeVisible();
  // Só nomes, mesa e aviso: nada de telefone.
  await expect(card).toContainText("Só a festa");
  await expect(card).toContainText(tableA);
  await expect(card).not.toContainText("98765");
  await shot(p, "portaria-busca");

  // Chegada parcial: 1 de 2.
  await card.getByRole("button", { name: "Uma pessoa a menos" }).click();
  await card.getByRole("button", { name: "Marcar 1 chegada" }).click();
  await expect(card.getByLabel("Chegaram 1 de 2")).toBeVisible();
  await expect(totals).toContainText("1 de 2 pessoas confirmadas");
  // Mais uma e desfaz a última.
  await card.getByRole("button", { name: "Marcar 1 chegada" }).click();
  await expect(card.getByLabel("Chegaram 2 de 2")).toBeVisible();
  await expect(card.getByRole("button", { name: "Desfazer" })).toHaveCount(2);
  await card.getByRole("button", { name: "Desfazer" }).first().click();
  await expect(card.getByLabel("Chegaram 1 de 2")).toBeVisible();
  await expect(card.getByRole("button", { name: "Desfazer" })).toHaveCount(1);
  await expect(totals).toContainText("1 de 2 pessoas confirmadas");
  await shot(p, "portaria-convite");
  await gate.close();

  // Painel: a contagem e as últimas chegadas (a desfeita aparece riscada, sem botão).
  await page.reload();
  await expect(page.getByRole("region", { name: "Contagem de chegadas" })).toContainText(
    "1 de 2 pessoas confirmadas",
  );
  const recent = page.locator("section", {
    has: page.getByRole("heading", { name: "Últimas chegadas" }),
  });
  await expect(recent.locator(".row", { hasText: family })).toHaveCount(2);
  await expect(recent.locator(".row--off", { hasText: family })).toContainText("desfeita em");
  await shot(page, "painel-checkin");

  await page.goto(eh("/dia"));
  await expect(page.getByRole("heading", { level: 1, name: "Hoje" })).toBeVisible();
  await expect(page.getByTestId("dia-chegadas")).toHaveText(/^1\s*de 2$/);
  await expect(page.getByText(`Cerimônia ${run}`)).toBeVisible();
  await shot(page, "painel-hoje");
});

test("portal do fornecedor: link → orçamento enviado → recebido no Financeiro com o selo", async () => {
  test.setTimeout(90_000);
  await page.goto(eh(`/fornecedores/${fx.eventVendorId}`));
  await expect(page.getByRole("heading", { level: 2, name: "Portal do fornecedor" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar link" }).click();
  const dialog = page.getByRole("dialog", { name: "Enviar link do portal" });
  await expect(dialog.getByLabel(/^E-mail do fornecedor/)).toHaveValue(
    `buffet-f7-${run}@exemplo.com`,
  );
  await dialog.getByRole("button", { name: "Enviar link" }).click();
  const url = await dialog.getByLabel(/^Endereço do portal/).inputValue();
  expect(url).toMatch(/\/fornecedor\/#[\w-]{20,}$/);
  await dialog.getByRole("button", { name: "Pronto" }).click();
  await expect(page.getByTestId("portal-link")).toContainText("Ativo");

  const vendorCtx = await anonymous();
  const p = await vendorCtx.newPage();
  await p.goto(url);
  await expect(p.getByText(`Lia & Caio F7 ${run}`)).toBeVisible();
  await expect(p.getByText(`Buffet Sabor ${run}`)).toBeVisible();
  // O item do cronograma dele vem marcado; nada de convidados.
  await expect(p.locator(".portal-item--mine")).toContainText(`Cerimônia ${run}`);
  await expect(p.getByText(rita)).toHaveCount(0);
  await shot(p, "portal-fornecedor");

  await p.getByRole("button", { name: "Enviar orçamento" }).click();
  const form = p.locator("form", { has: p.getByRole("heading", { name: "Novo orçamento" }) });
  await form.getByLabel("Título").fill(quote);
  await form.getByLabel("Item 1", { exact: true }).fill("Jantar para 120 pessoas");
  await form.getByLabel("Valor unitário (R$)").fill("12.000,00");
  await expect(form).toContainText("Total: R$ 12.000,00");
  await shot(p, "portal-orcamento-form");
  await form.getByRole("button", { name: "Enviar orçamento" }).click();
  const row = p.locator(".row", { hasText: quote });
  await expect(row).toContainText("Recebido");
  await expect(row).toContainText("enviado pelo fornecedor");
  await expect(row).toContainText("R$ 12.000,00");
  await shot(p, "portal-orcamento-enviado");
  await vendorCtx.close();

  await page.goto(eh("/financeiro"));
  await expect(page.getByRole("heading", { level: 1, name: "Financeiro" })).toBeVisible();
  const line = page.locator(".row", { hasText: quote });
  await expect(line).toContainText("Recebido");
  await expect(line).toContainText("Enviado pelo fornecedor");
  await expect(line).toContainText("R$ 12.000,00");
  await shot(page, "painel-financeiro-portal");
});

test("WhatsApp: modelo editado, link wa.me na fila, marcar enviado e desmarcar", async () => {
  await page.goto(eh("/whatsapp"));
  await expect(page.getByRole("heading", { level: 1, name: "WhatsApp" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Convite" })).toHaveAttribute("aria-selected", "true");
  const text = `Oi, {convite}! Esperamos vocês em {evento}. Responda aqui: {link} (${run})`;
  await page.getByTestId("wa-texto").fill(text);
  await page.getByTestId("wa-salvar").click();
  await expect(page.getByText("Texto salvo.")).toBeVisible();
  await expect(page.getByText("Texto do evento.", { exact: false })).toBeVisible();

  const item = page.getByTestId("wa-item").filter({ hasText: family });
  await expect(item).toContainText("+5511987654321");
  const href = await item
    .getByRole("link", { name: `Abrir WhatsApp para ${family}` })
    .getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
  const message = new URL(href!).searchParams.get("text")!;
  expect(message).toContain(`Oi, ${family}! Esperamos vocês em Lia & Caio F7 ${run}.`);
  expect(message).toContain(run);
  expect(message).not.toContain("{");
  await shot(page, "painel-whatsapp");

  await item.getByRole("button", { name: `Marcar ${family} como enviado` }).click();
  // Fila padrão = ainda não enviados: o convite sai dela.
  await expect(page.getByTestId("wa-item").filter({ hasText: family })).toHaveCount(0);
  await page.getByLabel("Mostrar").selectOption("all");
  const sent = page.getByTestId("wa-item").filter({ hasText: family });
  await expect(sent).toContainText("enviado por último em");
  await sent.getByRole("button", { name: "Desmarcar" }).click();
  await expect(sent.getByRole("button", { name: `Marcar ${family} como enviado` })).toBeVisible();
  await expect(sent).not.toContainText("enviado por último em");
});

test("telas do dia em 390 px, sem rolagem lateral", async () => {
  for (const [path, title] of [
    ["/dia", "Hoje"],
    ["/checkin", "Check-in"],
    ["/mesas", "Mesas"],
    ["/whatsapp", "WhatsApp"],
    ["/cronograma", "Cronograma do dia"],
  ] as const) {
    await page.goto(eh(path));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // Espera a página carregar os dados antes de medir.
    await expect(page.locator(".loading")).toHaveCount(0);
    await noHorizontalScroll(page, path);
  }
  await shot(page, "painel-cronograma");
});

test("RSVP com acompanhante passa do limite do plano: aviso no início do painel", async () => {
  test.setTimeout(90_000);
  // Antes: 300 pessoas, o limite do Essencial; sem aviso.
  await page.goto(eh());
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  await expect(page.getByTestId("aviso-limite")).toHaveCount(0);

  const guestCtx = await anonymous();
  const site = await guestCtx.newPage();
  await prepare(site);
  const res = await site.goto(`http://${siteHost}/c/${fx.limitToken}`);
  expect(res?.status()).toBe(200);
  await waitForHydration(site, 'button[type="submit"]');
  await site
    .getByRole("radiogroup", { name: new RegExp(`^Nina Limite ${run}`) })
    .getByRole("radio", { name: "Vai", exact: true })
    .check();
  await site.getByLabel(/Acompanhante/).fill(`Leo Acompanhante ${run}`);
  await site.getByRole("button", { name: "Continuar" }).click();
  await expect(site.getByRole("heading", { level: 2, name: "Detalhes" })).toBeVisible();
  await site.getByRole("button", { name: "Continuar" }).click();
  await expect(site.getByRole("heading", { level: 2, name: "Revisão" })).toBeVisible();
  const consent = site.getByTestId("rsvp-consent");
  if (await consent.count()) await consent.check();
  await site.getByRole("button", { name: "Confirmar presença" }).click();
  // O RSVP nunca é recusado pelo limite.
  await expect(
    site.getByTestId("rsvp-done").getByRole("heading", { name: "Presença confirmada" }),
  ).toBeVisible();
  await guestCtx.close();

  await page.reload();
  const warn = page.getByTestId("aviso-limite");
  await expect(warn).toContainText("A lista chegou a 301 pessoas e o plano permite 300.");
  await shot(page, "painel-aviso-limite");
});

test("privacidade: data da anonimização em destaque", async () => {
  await page.goto(eh("/privacidade"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("data-anonimizacao")).toContainText(
    /Os dados pessoais serão anonimizados em \d{2}\/\d{2}\/\d{4}\./,
  );
  await shot(page, "painel-privacidade");
});
