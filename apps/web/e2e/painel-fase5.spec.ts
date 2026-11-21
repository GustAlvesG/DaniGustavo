import { expect, test, type Page } from "@playwright/test";
import { fase5Cleanup, fase5Setup } from "./support/db";
import { routeLoginIp } from "./support/login-ip";
import { prepare, waitForHydration } from "./support/rsvp";

/*
 * Fase 5: recebimentos no modo simulado. Organização própria do e2e (dona com senha nova a cada
 * rodada) com um evento que recebe pela conta da organização, num host só dele:
 *  1. sem conta, o site mostra a lista com "Disponível em breve" no lugar do botão;
 *  2. a dona cadastra a subconta (cenário "+pendente"), vê a pendência e aprova pelo modo
 *     simulado;
 *  3. confirma o recebedor do evento (conta da organização);
 *  4. um convidado compra o presente com Pix simulado;
 *  5. o pedido no painel mostra a conta que recebeu e a taxa da plataforma.
 * Tudo o que o teste cria sai no fim (pedidos, conta, evento, org e a dona).
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const port = Number(process.env.E2E_PORT ?? 3100);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const host = `f5-${run}.localhost:${port}`;
const site = `http://${host}`;
const password = `senha-${run}-e2e`;
const buyer = `e2e-f5-${run}@exemplo.com`;

let fx: { orgId: number; eventId: number; email: string };

test.beforeAll(() => {
  fx = fase5Setup(run, password, host);
});
test.afterAll(() => fase5Cleanup(run));
test.beforeEach(({ context }) => routeLoginIp(context, "painel-fase5"));

async function login(page: Page) {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(fx.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}

test("dona cadastra a conta, aprova no simulado e o pedido sai com conta e taxa", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // 1. Sem conta: lista visível, sem botão de presentear.
  await prepare(page);
  await page.goto(`${site}/presentes`);
  const gift = page.locator('[data-gift="e2e-f5-jantar"]');
  await expect(gift).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("presentes-indisponiveis")).toBeVisible();
  await expect(gift.getByText("Disponível em breve")).toBeVisible();
  await expect(gift.getByRole("button", { name: /Presentear/ })).toHaveCount(0);

  // 2. Conta da organização: cadastro pendente → aprovação simulada.
  await login(page);
  await page.goto(`${painelUrl}#/o/${fx.orgId}/recebimentos`);
  await expect(page.getByRole("heading", { name: "Recebimentos" })).toBeVisible();
  const form = page.locator("form", { hasText: "Cadastrar conta de recebimento" });
  await form.getByLabel("Nome completo").fill("Lia Ferreira");
  await form.getByLabel("CPF").fill("529.982.247-25");
  await form.getByLabel("Data de nascimento").fill("1992-08-15");
  await form.getByLabel("E-mail").fill(`financeiro+pendente-${run}@exemplo.com`);
  await form.getByLabel("Celular").fill("11999998888");
  await form.getByLabel("Renda mensal (R$)").fill("5000");
  await form.getByLabel("CEP").fill("01310-100");
  await form.getByLabel("Rua").fill("Av. Paulista");
  await form.getByLabel("Número", { exact: true }).fill("1000");
  await form.getByLabel("Bairro").fill("Bela Vista");
  await form.getByRole("button", { name: "Cadastrar conta" }).click();

  const situacao = page.getByRole("region", { name: "Situação cadastral da conta" });
  await expect(situacao.getByText("Cadastro pendente")).toBeVisible();
  await expect(situacao.getByText("Documento de identificação")).toBeVisible();
  await situacao.getByRole("button", { name: "Simular aprovação" }).click();
  await expect(situacao.getByText("Tudo certo: esta conta já pode receber")).toBeVisible();

  // 3. Recebedor do evento: conta da organização (já é o padrão; salvar confirma).
  await page.goto(`${painelUrl}#/e/${fx.eventId}/recebimento`);
  await page.getByRole("radio", { name: "Conta da organização" }).check();
  await page.getByRole("button", { name: "Salvar recebedor" }).click();
  await expect(page.getByText("Tudo certo: os presentes em dinheiro caem na conta")).toBeVisible();

  // 4. Convidado compra com Pix simulado.
  const guest = await page.context().browser()!.newPage();
  await prepare(guest);
  await guest.goto(`${site}/presentes`);
  await waitForHydration(guest, '[data-gift="e2e-f5-jantar"] button');
  await expect(guest.getByTestId("presentes-indisponiveis")).toHaveCount(0);
  await guest
    .locator('[data-gift="e2e-f5-jantar"]')
    .getByRole("button", { name: /Presentear/ })
    .click();
  const dialog = guest.getByRole("dialog");
  await dialog.getByLabel("Seu nome").fill("Rita Teste");
  await dialog.getByLabel("Seu e-mail").fill(buyer);
  await dialog.getByRole("button", { name: "Presentear" }).click();
  await expect(guest).toHaveURL(/\/presentes\/pagamento\/[0-9A-Z]{26}$/, { timeout: 20_000 });
  const publicId = guest.url().split("/").pop()!;
  await guest.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(guest).toHaveURL(/\/presentes\/obrigado\//, { timeout: 15_000 });
  await guest.close();

  // 5. Pedido no painel: conta que recebeu e taxa da plataforma.
  await page.goto(`${painelUrl}#/e/${fx.eventId}/pedidos/${publicId}`);
  await expect(page.getByTestId("pedido-conta")).toHaveText("Lia Ferreira");
  await expect(page.getByTestId("pedido-taxa")).toContainText("R$");
  await expect(page.getByTestId("pedido-taxa")).toContainText("2,5%");
});
