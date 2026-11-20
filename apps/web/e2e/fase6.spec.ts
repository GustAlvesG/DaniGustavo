import { expect, test } from "@playwright/test";
import { approveMessage, deleteMessages } from "./support/db";

/*
 * Fase 6: mural de recados (só aprovados; formulário entra como pendente) e PWA
 * (manifest válido, ícones, service worker registrado, página offline).
 */

const run = Date.now().toString(36);
const author = `Visitante E2E ${run}`;

test.afterAll(async () => {
  await deleteMessages(author);
});

test("mural: recado novo fica pendente e só aparece depois de aprovado", async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(test.info().project.name !== "mobile", "Um viewport basta: o teste grava dados.");
  await page.goto("/recados");
  await expect(page.getByRole("heading", { level: 1, name: /quem nos quer bem/ })).toBeVisible();

  await page.getByLabel("Seu nome").fill(author);
  await page.getByLabel("Seu recado").fill(`Felicidades aos dois, com muito carinho. ${run}`);
  await page.getByRole("button", { name: "Enviar recado" }).click();
  await expect(page.getByTestId("recado-enviado")).toBeVisible();

  // Pendente: não está no mural.
  await page.goto("/recados");
  await expect(page.getByText(`Felicidades aos dois, com muito carinho. ${run}`)).toHaveCount(0);

  // Aprovado + invalidação da tag "messages" (o que a API faz quando o painel aprova).
  await approveMessage(author);
  const key = process.env.WEB_KEY ?? "";
  const res = await request.post(`${baseURL}/api/revalidar`, {
    headers: { "x-web-key": key },
    data: { eventId: 1, tags: ["messages"] },
  });
  expect(res.ok()).toBe(true);
  await page.goto("/recados");
  const bilhete = page.locator("figure", {
    hasText: `Felicidades aos dois, com muito carinho. ${run}`,
  });
  await expect(bilhete).toBeVisible();
  await expect(bilhete).toContainText(author.toUpperCase().slice(0, 4), { ignoreCase: true });
  await expect(bilhete.locator("time")).toHaveAttribute("datetime", /^20\d\d-/);
});

test("mural: validação e honeypot", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "Um viewport basta.");
  await page.goto("/recados");
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByLabel("Seu recado").fill("x");
  await page.getByRole("button", { name: "Enviar recado" }).click();
  await expect(page.getByText("Escreva o seu recado.")).toBeVisible();
  // O campo-isca existe, mas fora da tela e do teclado.
  await expect(page.locator('input[name="website"]')).toHaveAttribute("tabindex", "-1");
});

test("home mostra a seção de recados e o menu leva ao mural", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#recados")).toBeAttached();
  await expect(
    page.locator("#recados").getByRole("link", { name: "Deixar um recado" }),
  ).toHaveAttribute("href", "/recados#escrever");
});

test("PWA: manifest válido com ícones que existem", async ({ request, page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({
    start_url: "/",
    display: "standalone",
    // Cores do tema do evento (Álbum/marinho), em qualquer caixa.
    theme_color: expect.stringMatching(/^#14213d$/i),
    background_color: expect.stringMatching(/^#faf7f1$/i),
  });
  expect(m.name).toBeTruthy();
  const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get("/apple-icon")).ok()).toBe(true);
});

test("PWA: service worker registrado, offline.html em cache e rotas sensíveis fora dele", async ({
  page,
  context,
}) => {
  test.skip(test.info().project.name !== "mobile", "Um viewport basta.");
  await page.goto("/");
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toMatch(/\/$/);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const urls: string[] = [];
        for (const k of keys)
          for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
        return urls;
      }),
    )
    .toEqual(expect.arrayContaining(["/offline.html", "/icons/192"]));

  // O worker nunca guarda páginas, convites, pagamento nem API.
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys())
      for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached.filter((p) => /^\/(c|confirmar|presentes|api)(\/|$)/.test(p))).toEqual([]);

  // Sem rede, a navegação mostra a página offline.
  await page.reload();
  await context.setOffline(true);
  await page.goto("/recados").catch(() => {});
  await expect(page.getByRole("heading", { name: /Sem conexão/ })).toBeVisible();
  await context.setOffline(false);
});
