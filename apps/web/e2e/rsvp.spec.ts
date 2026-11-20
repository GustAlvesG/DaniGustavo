import { expect, test, type Page } from "@playwright/test";
import { createInvitation, deleteInvitation, type TestInvitation } from "./support/db";
import { apiInvitation, next, prepare, waitForHydration } from "./support/rsvp";

/*
 * Fase 3: busca do convite em /confirmar e RSVP em /c/[token]. Cada teste de
 * fluxo cria o próprio convite no banco (e apaga no fim); os convites de seed
 * só são lidos. Cada teste usa um IP diferente por causa dos limites da API.
 */

const run = Date.now().toString(36);
const uniq = (s: string) => `${s} ${run}`;

async function pick(page: Page, guest: string, answer: "Vai" | "Não vai") {
  await page
    .getByRole("radiogroup", { name: new RegExp(`^${guest}`) })
    .getByRole("radio", { name: answer, exact: true })
    .check();
}

test.describe("busca em /confirmar", () => {
  test("acha só o próprio grupo, sem diferenciar acentos", async ({ page }) => {
    await prepare(page);
    await page.goto("/confirmar");
    await expect(page).toHaveTitle(/Confirmar presença/);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

    await page.getByLabel("Primeiro nome").fill("celia");
    await page.getByLabel("Sobrenome").fill("ramos");
    await page.getByRole("button", { name: "Buscar convite" }).click();

    // O 1º acesso a /c/[token] compila a rota no next dev: mais tempo que o padrão.
    await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tio Otávio e tia Célia");
    await expect(page.getByRole("radiogroup", { name: /Célia Ramos/ })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: /Otávio Ramos/ })).toBeVisible();
    // Nada de outros convites.
    await expect(page.getByText(/Albuquerque|Nogueira|Toledo|Ferraz/)).toHaveCount(0);
  });

  test("nome desconhecido: mensagem com como resolver e contato dos noivos", async ({ page }) => {
    await prepare(page);
    await page.goto("/confirmar");
    await page.getByLabel("Primeiro nome").fill("Zacarias");
    await page.getByLabel("Sobrenome").fill("Inexistente");
    await page.getByRole("button", { name: "Buscar convite" }).click();

    const result = page.getByTestId("lookup-result");
    await expect(result).toContainText("Não encontramos esse nome");
    await expect(result).toContainText("Confira a grafia ou fale com os noivos");
    await expect(page).toHaveURL(/\/confirmar$/);
    // Os campos continuam preenchidos para corrigir a grafia.
    await expect(page.getByLabel("Primeiro nome")).toHaveValue("Zacarias");
  });

  test("campo vazio: o erro diz o que falta", async ({ page }) => {
    await prepare(page);
    await page.goto("/confirmar");
    await page.getByLabel("Primeiro nome").fill("Ana");
    await page.getByRole("button", { name: "Buscar convite" }).click();
    await expect(page.getByText("Informe o sobrenome.")).toBeVisible();
    await expect(page.getByLabel("Sobrenome")).toHaveAttribute("aria-invalid", "true");
  });

  test("muitas buscas seguidas: avisa quanto esperar", async ({ page }) => {
    await prepare(page);
    await page.goto("/confirmar");
    for (let i = 0; i < 6; i++) {
      await page.getByLabel("Primeiro nome").fill(`Fulano${i}`);
      await page.getByLabel("Sobrenome").fill("Teste");
      await page.getByRole("button", { name: "Buscar convite" }).click();
      await expect(page.getByTestId("lookup-result")).not.toBeEmpty();
    }
    await expect(page.getByTestId("lookup-result")).toContainText(/Aguarde \d+ segundos/);
  });
});

test.describe("RSVP em /c/[token]", () => {
  let invitation: TestInvitation;

  test.afterEach(async () => {
    if (invitation) await deleteInvitation(invitation.token);
  });

  test("confirmar: três etapas, foco no título, tabelas e e-mail", async ({ page }) => {
    invitation = await createInvitation({
      label: uniq("Família Confirma"),
      guests: [
        { name: "Ana Confirma" },
        { name: "Beto Confirma" },
        { name: "Lia Confirma", isChild: true, ageRange: "3-7" },
      ],
      maxGuests: 4,
      allowPlusOne: true,
    });
    await prepare(page);
    await page.goto(`/c/${invitation.token}`);
    await expect(page).toHaveTitle(/Confirmar presença/);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(invitation.label);
    await expect(page.getByText("Criança, 3 a 7 anos")).toBeVisible();

    // Etapa 1: sem responder, não avança e diz o que falta.
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Diga se Ana Confirma vai ou não.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Quem vai" })).toBeVisible();

    await pick(page, "Ana Confirma", "Vai");
    await pick(page, "Beto Confirma", "Não vai");
    await pick(page, "Lia Confirma", "Vai");
    await page.getByLabel(/Acompanhante/).fill("Cris Confirma");

    // Etapa 2: o foco vai para o título da etapa.
    await next(page, "Detalhes");
    await expect(page.getByRole("heading", { level: 2, name: "Detalhes" })).toBeFocused();
    await expect(page.getByTestId("rsvp-announce")).toContainText("Etapa 2 de 3");
    await expect(
      page.getByText("Alergias são dados de saúde; usamos só para informar o buffet."),
    ).toBeVisible();
    // Só quem vai tem campo de restrição.
    await expect(page.getByLabel(/Restrição alimentar de Beto/)).toHaveCount(0);
    await page.getByLabel(/Restrição alimentar de Ana/).fill("Sem glúten");
    await page.getByLabel(/E-mail/).fill("ana@");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/E-mail inválido/)).toBeVisible();
    await page.getByLabel(/E-mail/).fill("ana.confirma@exemplo.com");

    // Etapa 3: revisão e envio.
    await next(page, "Revisão");
    const review = page.getByTestId("rsvp-review");
    await expect(review).toContainText("Ana Confirma");
    await expect(review).toContainText("Restrição: Sem glúten");
    await expect(review).toContainText("Cris Confirma");
    await page.getByRole("button", { name: "Voltar" }).click(); // voltar mantém as respostas
    await expect(page.getByRole("heading", { level: 2, name: "Detalhes" })).toBeVisible();
    await expect(page.getByLabel(/Restrição alimentar de Ana/)).toHaveValue("Sem glúten");
    await next(page, "Revisão");

    await page.getByRole("button", { name: "Confirmar presença" }).click();
    const done = page.getByTestId("rsvp-done");
    await expect(done.getByRole("heading", { name: "Presença confirmada" })).toBeFocused();
    await expect(done.getByRole("list", { name: "Quem vai" }).getByRole("listitem")).toHaveText([
      "Ana Confirma",
      "Lia Confirma",
      "Cris Confirma",
    ]);
    await expect(done).toContainText("Não vão: Beto Confirma");
    await expect(done).toContainText("ana.confirma@exemplo.com");
    await expect(page.getByTestId("rsvp-announce")).toHaveText("Presença confirmada.");

    const saved = await apiInvitation(invitation.token);
    expect(saved.contact.email).toBe("ana.confirma@exemplo.com");
    expect(saved.guests.map((g) => [g.name, g.rsvpStatus, g.dietaryNotes, g.isPlusOne])).toEqual([
      ["Ana Confirma", "confirmed", "Sem glúten", false],
      ["Beto Confirma", "declined", null, false],
      ["Lia Confirma", "confirmed", null, false],
      ["Cris Confirma", "confirmed", null, true],
    ]);
  });

  test("alterar: a resposta volta preenchida e pode mudar até o prazo", async ({ page }) => {
    invitation = await createInvitation({
      label: uniq("Família Altera"),
      guests: [{ name: "Ana Altera" }, { name: "Beto Altera" }],
    });
    await prepare(page);
    await page.goto(`/c/${invitation.token}`);
    await pick(page, "Ana Altera", "Vai");
    await pick(page, "Beto Altera", "Não vai");
    await next(page, "Detalhes");
    await next(page, "Revisão");
    await page.getByRole("button", { name: "Confirmar presença" }).click();
    await expect(page.getByRole("heading", { name: "Presença confirmada" })).toBeVisible();

    // Volta ao convite: tudo preenchido e avisa que já respondeu.
    await page.goto(`/c/${invitation.token}`);
    await expect(page.getByTestId("rsvp-revisit")).toContainText("Você já respondeu");
    await expect(
      page
        .getByRole("radiogroup", { name: /Ana Altera/ })
        .getByRole("radio", { name: "Vai", exact: true }),
    ).toBeChecked();
    await expect(
      page
        .getByRole("radiogroup", { name: /Beto Altera/ })
        .getByRole("radio", { name: "Não vai", exact: true }),
    ).toBeChecked();

    await pick(page, "Beto Altera", "Vai");
    await pick(page, "Ana Altera", "Não vai");
    await next(page, "Detalhes");
    await page.getByLabel(/Restrição alimentar de Beto/).fill("Vegetariano");
    await next(page, "Revisão");
    await page.getByRole("button", { name: "Confirmar presença" }).click();
    const done = page.getByTestId("rsvp-done");
    await expect(done.getByRole("list", { name: "Quem vai" }).getByRole("listitem")).toHaveText([
      "Beto Altera",
    ]);

    // "Alterar resposta" reabre a primeira etapa com as respostas atuais.
    await done.getByRole("button", { name: "Alterar resposta" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Quem vai" })).toBeVisible();

    const saved = await apiInvitation(invitation.token);
    expect(saved.guests.map((g) => [g.name, g.rsvpStatus, g.dietaryNotes])).toEqual([
      ["Ana Altera", "declined", null],
      ["Beto Altera", "confirmed", "Vegetariano"],
    ]);
  });

  test("recusar: mensagem calorosa, sem a lista de quem vai", async ({ page }) => {
    invitation = await createInvitation({
      label: uniq("Família Recusa"),
      guests: [{ name: "Ana Recusa" }, { name: "Beto Recusa" }],
    });
    await prepare(page);
    await page.goto(`/c/${invitation.token}`);
    await pick(page, "Ana Recusa", "Não vai");
    await pick(page, "Beto Recusa", "Não vai");
    await next(page, "Detalhes");
    await expect(page.getByLabel(/Restrição alimentar/)).toHaveCount(0);
    await next(page, "Revisão");
    await page.getByRole("button", { name: "Enviar resposta" }).click();

    const done = page.getByTestId("rsvp-done");
    await expect(done.getByRole("heading", { name: "Resposta enviada" })).toBeFocused();
    await expect(done).toContainText("Obrigado por avisar");
    await expect(done.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByTestId("rsvp-announce")).toHaveText("Resposta enviada.");

    const saved = await apiInvitation(invitation.token);
    expect(saved.guests.map((g) => g.rsvpStatus)).toEqual(["declined", "declined"]);
  });

  test("só com teclado e com movimento reduzido", async ({ page }) => {
    invitation = await createInvitation({
      label: uniq("Família Teclado"),
      guests: [{ name: "Ana Teclado" }],
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepare(page);
    await page.goto(`/c/${invitation.token}`);
    // Enter antes da hidratação enviaria o formulário por GET (o wizard é só de cliente).
    await waitForHydration(page, '[data-testid="rsvp-form"]');

    await page.getByRole("radio", { name: "Vai", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter"); // Enter envia a etapa (avança), sem pular a revisão
    await expect(page.getByRole("heading", { level: 2, name: "Detalhes" })).toBeFocused();
    await page.getByRole("button", { name: "Continuar" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Revisão" })).toBeFocused();
    await page.getByRole("button", { name: "Confirmar presença" }).focus();
    await page.keyboard.press("Enter");

    const done = page.getByTestId("rsvp-done");
    await expect(done.getByRole("heading", { name: "Presença confirmada" })).toBeFocused();
    // Sem movimento: o check já aparece desenhado por inteiro.
    await expect(page.getByTestId("rsvp-check").locator("path")).toHaveAttribute(
      "stroke-dashoffset",
      "0",
    );
  });

  test("link inválido mostra a página de convite não encontrado", async ({ page }) => {
    await prepare(page);
    await page.goto("/c/invalid");
    await expect(
      page.getByRole("heading", { level: 1, name: "Convite não encontrado" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Buscar pelo nome" })).toHaveAttribute(
      "href",
      "/confirmar",
    );
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });
});
