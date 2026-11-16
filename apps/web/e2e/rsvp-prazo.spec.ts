import { expect, test } from "@playwright/test";
import {
  createInvitation,
  deleteInvitation,
  getDeadline,
  setDeadline,
  type TestInvitation,
} from "./support/db";
import { apiInvitation, next, prepare } from "./support/rsvp";

/*
 * Prazo do RSVP. O prazo é uma configuração global (`settings.rsvp.deadline`),
 * então este arquivo é o único que a altera e roda sozinho (projeto "prazo",
 * depois de mobile e desktop). O valor original é restaurado no fim; se uma
 * execução anterior morreu no meio, o valor de teste é trocado pelo do seed.
 */

const PAST = "2020-01-01T00:00:00-03:00";
const SEED_DEADLINE = "2027-03-10T23:59:59-03:00";

test.describe.configure({ mode: "serial" });

let original = SEED_DEADLINE;
let invitation: TestInvitation;

test.beforeAll(async () => {
  const current = await getDeadline();
  original = current === PAST ? SEED_DEADLINE : current;
  await setDeadline(original);
  invitation = await createInvitation({
    label: `Família Prazo ${Date.now().toString(36)}`,
    guests: [{ name: "Ana Prazo" }, { name: "Beto Prazo" }],
  });
});

test.afterAll(async () => {
  await setDeadline(original);
  await deleteInvitation(invitation.token);
});

test("depois do prazo: resumo somente leitura e contato dos noivos", async ({ page }) => {
  await setDeadline(original);
  await prepare(page);
  await page.goto(`/c/${invitation.token}`);
  await page
    .getByRole("radiogroup", { name: /Ana Prazo/ })
    .getByRole("radio", { name: "Vai", exact: true })
    .check();
  await page
    .getByRole("radiogroup", { name: /Beto Prazo/ })
    .getByRole("radio", { name: "Não vai", exact: true })
    .check();
  await next(page, "Detalhes");
  await next(page, "Revisão");

  // O prazo vence enquanto a pessoa estava na revisão: a API responde 409.
  await setDeadline(PAST);
  await page.getByRole("button", { name: "Confirmar presença" }).click();
  const error = page.getByTestId("rsvp-error");
  await expect(error).toContainText("O prazo para confirmar presença terminou");
  await error.getByRole("button", { name: "Recarregar a página" }).click();

  const closed = page.getByTestId("rsvp-closed");
  await expect(closed.getByRole("heading", { name: "Prazo encerrado" })).toBeVisible();
  await expect(closed).toContainText("fale direto com os noivos");
  await expect(closed).toContainText("Ana Prazo");
  await expect(page.getByTestId("rsvp-form")).toHaveCount(0);

  // Nada foi gravado.
  const saved = await apiInvitation(invitation.token);
  expect(saved.isClosed).toBe(true);
  expect(saved.guests.map((g) => g.rsvpStatus)).toEqual(["pending", "pending"]);
});

test("convite aberto depois do prazo já nasce somente leitura", async ({ page }) => {
  await setDeadline(PAST);
  await prepare(page);
  await page.goto(`/c/${invitation.token}`);
  await expect(page.getByTestId("rsvp-closed")).toContainText("Sem resposta");
  await expect(page.getByRole("button", { name: /Continuar|Confirmar presença/ })).toHaveCount(0);
});
