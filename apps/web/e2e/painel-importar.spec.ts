import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/*
 * Painel: importar os 50 convidados do CSV de exemplo → ver convites → exportar a lista do
 * buffet (com restrição) → página de impressão dos QR. Os convites do exemplo são apagados
 * pela própria API do painel antes e depois. Screenshots em .screenshots/fase5b/.
 */

const painelUrl =
  process.env.PAINEL_URL ??
  `${(process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "")}/painel/`;
const apiBase = new URL("/api/admin", painelUrl).toString();
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL_1 ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD_INICIAL ?? "";
const root = join(__dirname, "..", "..", "..");
const exemplo = join(root, "docs", "exemplos", "convidados-exemplo.csv");
const shots = join(root, ".screenshots", "fase5b");
const EXAMPLE_LABELS = ["Família Andrade", "Vó Lourdes", "Colegas do escritório", "Rita Calado"];

test.skip(!email || !password, "Defina ADMIN_EMAIL_1 e ADMIN_PASSWORD_INICIAL no .env.");
test.describe.configure({ mode: "serial" });

/** Apaga os convites do CSV de exemplo (todos têm nomes fictícios próprios). */
async function removeExample(page: Page) {
  const labels = new Set(
    (await import("node:fs"))
      .readFileSync(exemplo, "utf8")
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(";")[0])
      .filter(Boolean),
  );
  const res = await page.request.get(`${apiBase}/invitations`);
  const { invitations } = (await res.json()) as { invitations: { id: number; label: string }[] };
  for (const inv of invitations.filter((i) => labels.has(i.label))) {
    await page.request.delete(`${apiBase}/invitations/${inv.id}`, {
      headers: { Origin: new URL(painelUrl).origin },
    });
  }
}

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.screenshot({ path: join(shots, `${name}-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test("importar 50 convidados → buffet → QR para impressão", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(painelUrl);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  await removeExample(page);

  // Tela de importação
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  await page.getByRole("link", { name: "Importar planilha" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Importar convidados" })).toBeVisible();
  await shot(page, "importar");

  // Arquivo com erros: prévia linha a linha, sem botão de importar
  const header =
    "convite;lado;nome;tipo;faixa_etaria;telefone;email;acompanhante;max_pessoas;restricao_alimentar";
  await page.locator('input[type="file"]').setInputFiles({
    name: "com-erros.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\nFamília Teste;Dani;Ana Teste;adulto;;;;;;\nFamília Teste;Noiva;Bia Teste;criança;;;bia@;talvez;;\n;Gustavo;Sem Convite;;;;;;;\n`,
    ),
  });
  await expect(page.getByText("2 linhas precisam de correção.")).toBeVisible();
  await expect(
    page.getByText("Lado “Noiva” não reconhecido: use Dani ou Gustavo.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar", exact: true })).toBeDisabled();
  await shot(page, "importar-previa-erros");

  // CSV de exemplo: 22 convites, 50 pessoas
  await page.locator('input[type="file"]').setInputFiles(exemplo);
  const importButton = page.getByRole("button", { name: "Importar 22 convites (50 pessoas)" });
  await expect(importButton).toBeEnabled();
  await shot(page, "importar-previa-ok");
  await importButton.click();
  await expect(page.getByRole("heading", { name: "Importação concluída" })).toBeVisible();
  await expect(page.getByText("22 convites criados com 50 pessoas.")).toBeVisible();

  // Reimportar o mesmo arquivo: tudo marcado como já existente
  await page.locator('input[type="file"]').setInputFiles(exemplo);
  await expect(page.getByText("Nada novo para importar", { exact: false })).toBeVisible();
  await expect(
    page.getByText("O convite “Família Andrade” já existe no painel", { exact: false }),
  ).toBeVisible();

  // Ver convites e confirmar uma criança com alergia
  await page.getByRole("link", { name: "← Convites" }).click();
  for (const label of EXAMPLE_LABELS) {
    await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
  await page.getByRole("link", { name: /Família Andrade/ }).click();
  await expect(page.locator(".qr-inline__img svg")).toBeVisible();
  await page.getByRole("link", { name: "Editar" }).click();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("combobox", { name: "Resposta", exact: true })
      .nth(i)
      .selectOption("confirmed");
  }
  await page.getByRole("button", { name: "Salvar convite" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Família Andrade" })).toBeVisible();

  // Lista do buffet: tela, CSV e versão para imprimir
  await page.goto(`${painelUrl}#/convites/listas/buffet`);
  await expect(page.getByRole("heading", { name: "Lista do buffet" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Alergia a amendoim" })).toBeVisible();
  const csv = await page.request.get(`${apiBase}/invitations/lists/buffet.csv`);
  const text = await csv.text();
  expect(text).toContain("Convidado;Convite;Adulto/criança;Faixa etária;Restrição alimentar");
  expect(text).toContain("Theo Andrade;Família Andrade;Criança;3 a 7 anos;Alergia a amendoim");
  await shot(page, "lista-buffet");
  await page.getByRole("link", { name: "Portaria" }).click();
  await expect(page.getByRole("heading", { name: "Lista da portaria" })).toBeVisible();
  await expect(page.getByText("Alergia a amendoim")).toHaveCount(0);
  await page.getByRole("link", { name: "Cerimonial" }).click();
  await expect(page.getByRole("cell", { name: "Alergia a amendoim" })).toBeVisible();
  await shot(page, "lista-cerimonial");
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.screenshot({ path: join(shots, "lista-cerimonial-impressao.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });

  // QR em lote: não enviados, impressão A4
  await page.goto(`${painelUrl}#/convites/qr`);
  await expect(page.getByRole("heading", { level: 1, name: "QR dos convites" })).toBeVisible();
  await page.getByLabel(/Não enviados/).check();
  await page.getByLabel("Escolher").check();
  await page.getByRole("button", { name: "Desmarcar todos" }).click();
  for (const label of EXAMPLE_LABELS) await page.getByLabel(label).check();
  await expect(page.locator(".qr-card")).toHaveCount(EXAMPLE_LABELS.length);
  await expect(page.locator(".qr-card").first()).toContainText("/c/");
  await shot(page, "qr-lote");

  // Tenta decodificar o QR com o BarcodeDetector do Chromium (não existe em todo sistema).
  const decoded = await page.evaluate(async () => {
    const BD = (
      window as unknown as {
        BarcodeDetector?: new (o: object) => {
          detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!BD) return null;
    const svg = document.querySelector(".qr-card__qr svg")!;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 400;
    canvas.getContext("2d")!.drawImage(img, 0, 0, 400, 400);
    const found = await new BD({ formats: ["qr_code"] }).detect(canvas);
    return found.map((f) => f.rawValue);
  });
  const firstLink = (await page.locator(".qr-card__link").first().textContent()) ?? "";
  if (decoded === null) {
    test.info().annotations.push({
      type: "qr",
      description:
        "BarcodeDetector indisponível neste sistema: QR validado pelos testes unitários.",
    });
  } else {
    expect(decoded[0]).toContain(firstLink);
  }

  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.screenshot({ path: join(shots, "qr-impressao.png"), fullPage: true });
  await page.pdf({ path: join(shots, "qr-impressao.pdf"), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });

  await removeExample(page);
});
