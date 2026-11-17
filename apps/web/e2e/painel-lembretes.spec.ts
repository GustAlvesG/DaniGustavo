import { expect, test } from "@playwright/test";

/*
 * Fase 6: lembretes de RSVP no painel. Não envia e-mail de verdade: confere a contagem, o
 * diálogo de confirmação (cancelado) e o liga/desliga, restaurando a configuração no fim.
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL_1 ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD_INICIAL ?? "";

test.skip(!email || !password, "Defina ADMIN_EMAIL_1 e ADMIN_PASSWORD_INICIAL no .env.");

test("lembretes: contagem, confirmação e liga/desliga", async ({ page }) => {
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("link", { name: "Lembretes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lembretes" })).toBeVisible();

  await expect(page.getByTestId("lembretes-contagem")).toContainText(
    /receber(ia|iam) um lembrete agora/,
  );
  const send = page.getByRole("button", { name: "Enviar lembretes agora" });
  if (await send.isEnabled()) {
    await send.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/vai receber|vão receber/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  }

  const auto = page.getByLabel("Enviar lembretes automáticos");
  const was = await auto.isChecked();
  await auto.setChecked(!was);
  await page.getByRole("button", { name: "Salvar lembretes" }).click();
  await expect(page.getByText(/Lembretes automáticos (salvos|desligados)/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Enviar lembretes automáticos")).toBeChecked({ checked: !was });

  // Restaura.
  await page.getByLabel("Enviar lembretes automáticos").setChecked(was);
  await page.getByRole("button", { name: "Salvar lembretes" }).click();
  await expect(page.getByText(/Lembretes automáticos (salvos|desligados)/)).toBeVisible();
});
