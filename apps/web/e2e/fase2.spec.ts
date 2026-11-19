import { expect, test, type APIRequestContext } from "@playwright/test";
import type { SiteContent } from "@casamento/shared";
import { galeria } from "../src/content/galeria";
import { home } from "../src/content/home";

/*
 * Páginas de informação. Dados do evento vêm da própria API (nada de data ou
 * local fixo no teste); textos e fotos de apresentação, de src/content.
 */

const API_URL = (process.env.API_URL || "http://localhost:3333").replace(/\/+$/, "");

/** Título do content/home.ts sem os asteriscos de ênfase. */
const plain = (s: string) => s.replace(/\*/g, "");

async function loadSite(request: APIRequestContext): Promise<SiteContent | null> {
  try {
    const res = await request.get(`${API_URL}/api/e/dani-gustavo/site`, { timeout: 5_000 });
    return res.ok() ? ((await res.json()) as SiteContent) : null;
  } catch {
    return null;
  }
}

let site: SiteContent | null = null;

test.beforeAll(async ({ request }) => {
  site = await loadSite(request);
});

test("home mostra todas as seções com o conteúdo da API", async ({ page }) => {
  test.skip(!site, "API fora do ar");
  const s = site!;
  await page.goto("/");

  for (const id of home.secoes) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
  await expect(
    page.getByRole("heading", { level: 2, name: plain(home.historia.titulo) }),
  ).toBeAttached();

  const wedding = page.locator("#casamento");
  await expect(wedding.getByRole("heading", { level: 2 })).toContainText(/\d+ de \p{L}+/u);
  await expect(wedding.getByText(s.ceremony.name).first()).toBeVisible();
  const maps = wedding.getByRole("link", { name: /Abrir no Google Maps|Como chegar/ }).first();
  await expect(maps).toHaveAttribute(
    "href",
    s.ceremony.mapsUrl ?? /^https:\/\/www\.google\.com\/maps\/search\//,
  );
  if (s.ceremony.wazeUrl) {
    await expect(wedding.getByRole("link", { name: "Abrir no Waze" }).first()).toBeVisible();
  }
  await expect(wedding.getByRole("link", { name: "Adicionar à agenda" })).toHaveAttribute(
    "href",
    "/agenda.ics",
  );
  await expect(wedding.getByRole("link", { name: "Adicionar ao Google Agenda" })).toHaveAttribute(
    "href",
    /calendar\.google\.com/,
  );
  for (const item of s.accommodation.items) {
    await expect(page.locator("#hospedagem").getByText(item.name, { exact: true })).toBeVisible();
  }

  for (const item of s.schedule) {
    await expect(page.locator("#programacao").getByText(item.title, { exact: true })).toBeVisible();
  }
  for (const color of s.dressCode.palette) {
    await expect(page.locator("#traje").getByText(color.name, { exact: true })).toBeVisible();
  }
  // Confirmação na home é um convite a ir para /confirmar (o RSVP é por convite).
  await expect(
    page.locator("#rsvp").getByRole("link", { name: home.rsvp.cartao.botao }),
  ).toHaveAttribute("href", "/confirmar");
  await expect(page.locator("footer")).toContainText(s.contact.message);
});

test("dúvidas: acordeão abre e fecha com aria-expanded", async ({ page }) => {
  test.skip(!site?.faq.length, "sem perguntas na API");
  const first = site!.faq[0];
  await page.goto("/");
  const button = page.locator("#duvidas").getByRole("button", { name: first.question });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: first.question })).toContainText(first.answer);
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: first.question })).toHaveCount(0);
});

test("nossa história: polaroids do conteúdo local, com ano e foto", async ({ page }) => {
  await page.goto("/");
  const story = page.locator("section#historia");
  await expect(story.locator("li")).toHaveCount(home.historia.momentos.length);
  for (const m of home.historia.momentos) {
    await expect(story.getByText(m.titulo, { exact: true })).toBeAttached();
    await expect(story.getByRole("img", { name: m.foto.alt })).toBeAttached();
  }
  // As fotos passam pelo otimizador do next/image.
  const src = await story.locator("img").first().getAttribute("src");
  expect(src).toContain("/_next/image");
});

test("programação: a linha se desenha com a rolagem", async ({ page }) => {
  test.skip(!site?.schedule.length, "sem programação na API");
  await page.goto("/");
  const line = page.locator("#programacao [data-timeline-line]");
  const scaleY = () =>
    line.evaluate((el) => {
      const s = getComputedStyle(el).scale;
      return s === "none" ? 1 : Number(s.split(" ")[1] ?? s);
    });
  const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
  test.skip(!supported, "navegador sem animações por rolagem");

  await page.locator("#programacao").evaluate((el) => el.scrollIntoView({ block: "start" }));
  const early = await scaleY();
  // A linha termina de se desenhar quando a ponta de baixo passa do meio da tela.
  // (Medida pelo pai: o retângulo da própria linha já vem encolhido pela escala.)
  await line.evaluate((el) =>
    window.scrollTo({
      top:
        el.parentElement!.getBoundingClientRect().bottom +
        window.scrollY -
        window.innerHeight / 2 +
        40,
    }),
  );
  await expect.poll(scaleY).toBeGreaterThan(early);
  await expect.poll(scaleY).toBeGreaterThan(0.95);
});

test(".ics para a agenda", async ({ request }) => {
  const res = await request.get("/agenda.ics");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(body).toContain("BEGIN:VEVENT\r\n");
  if (site) {
    const utc = new Date(site.wedding.datetime)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z")
      .replace(/[-:]/g, "");
    expect(body).toContain(`DTSTART:${utc}\r\n`);
  }
});

test("/padrinhos carrega o manual", async ({ page }) => {
  await page.goto("/padrinhos");
  await expect(page.getByRole("heading", { level: 1, name: "Manual dos padrinhos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /página inicial/ })).toHaveAttribute("href", "/");
  if (site) {
    for (const s of site.godparents.schedule) {
      await expect(page.getByText(s.text, { exact: true })).toBeVisible();
    }
  }
});

test("/galeria carrega as fotos do conteúdo local", async ({ page }) => {
  await page.goto("/galeria");
  await expect(page.getByRole("heading", { level: 1, name: galeria.titulo })).toBeVisible();
  const imgs = page.locator("[data-gallery] img");
  await expect(imgs).toHaveCount(galeria.fotos.length);
  await expect(imgs.first()).toBeVisible();
  await expect(page.locator("[data-gallery] a").first()).toHaveAttribute(
    "href",
    `/fotos/${galeria.fotos[0]!.arquivo}`,
  );
});

test("imagem Open Graph é um PNG", async ({ page, request }) => {
  await page.goto("/");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBeTruthy();
  const path = new URL(og!).pathname + new URL(og!).search;
  const res = await request.get(path);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "pt_BR");
});

test("navegação: menu leva às páginas internas", async ({ page }, info) => {
  await page.goto("/padrinhos");
  // Páginas internas: a data já fica no menu desde o início.
  await expect(page.locator("[data-nav-date]")).toHaveAttribute("data-shown", "");
  const menu =
    info.project.name === "mobile"
      ? (await page.getByRole("button", { name: "Abrir menu" }).click(),
        page.getByRole("navigation", { name: "Menu" }))
      : page.getByRole("navigation", { name: "Principal" });
  await menu.getByRole("link", { name: "Galeria" }).click();
  await expect(page).toHaveURL(/\/galeria$/);
  await expect(page.getByRole("heading", { level: 1, name: "Galeria" })).toBeVisible();
});
