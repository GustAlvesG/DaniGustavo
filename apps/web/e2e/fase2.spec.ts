import { expect, test, type APIRequestContext } from "@playwright/test";
import type { SiteContent } from "@casamento/shared";

/*
 * Fase 2: páginas de informação com conteúdo de /api/site. Os valores
 * esperados vêm da própria API (nada de data ou local fixo no teste).
 */

const API_URL = (process.env.API_URL || "http://localhost:3333").replace(/\/+$/, "");

async function loadSite(request: APIRequestContext): Promise<SiteContent | null> {
  try {
    const res = await request.get(`${API_URL}/api/site`, { timeout: 5_000 });
    return res.ok() ? ((await res.json()) as SiteContent) : null;
  } catch {
    return null;
  }
}

let site: SiteContent | null = null;

test.beforeAll(async ({ request }) => {
  site = await loadSite(request);
});

test.beforeEach(async ({ page }) => {
  // Abertura já vista: os testes de conteúdo não esperam a cena.
  await page.addInitScript(() => sessionStorage.setItem("dg:abertura", "1"));
});

test("home mostra todas as seções com o conteúdo da API", async ({ page }) => {
  test.skip(!site, "API fora do ar");
  const s = site!;
  await page.goto("/");

  for (const id of ["historia", "casamento", "programacao", "traje", "hospedagem", "duvidas"]) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
  await expect(page.getByRole("heading", { level: 2, name: "Nossa história" })).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: "O casamento" })).toBeVisible();

  const wedding = page.locator("#casamento");
  await expect(wedding.getByText(s.ceremony.name).first()).toBeVisible();
  if (s.ceremony.mapsUrl) {
    await expect(
      wedding.getByRole("link", { name: "Abrir no Google Maps" }).first(),
    ).toHaveAttribute("href", s.ceremony.mapsUrl);
  }
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

  for (const item of s.schedule) {
    await expect(page.locator("#programacao").getByText(item.title, { exact: true })).toBeVisible();
  }
  for (const color of s.dressCode.palette) {
    await expect(page.locator("#traje").getByText(color.name, { exact: true })).toBeVisible();
  }
  for (const item of s.accommodation.items) {
    await expect(page.locator("#hospedagem").getByText(item.name, { exact: true })).toBeVisible();
  }
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

test.describe("nossa história", () => {
  test("momentos da API e a linha desenhada ao rolar", async ({ page }, info) => {
    test.skip(!site?.story.length, "sem momentos na API");
    await page.goto("/");
    const story = page.locator("section#historia");
    await expect(story.locator("li")).toHaveCount(site!.story.length);
    for (const m of site!.story) await expect(story.getByText(m.title)).toBeAttached();

    await story.scrollIntoViewIfNeeded();
    const track = story.locator("[data-story-track]");
    await expect(track).toHaveAttribute("data-line", "ready");
    await expect(story.locator("[data-story-line]")).toHaveAttribute("d", /^M/);

    if (info.project.name === "desktop") {
      // Desktop: a trilha é fixada (pin) e anda na horizontal com o scroll.
      await expect(story.locator("[data-story-viewport][data-pinned]")).toHaveCount(1);
      const top = await story.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      await page.evaluate((y) => window.scrollTo(0, y + 900), top);
      await expect
        .poll(() => track.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))
        .toBeLessThan(-100);
    } else {
      await expect(story.locator("[data-story-viewport][data-pinned]")).toHaveCount(0);
    }
  });

  test.describe("movimento reduzido", () => {
    test.use({ reducedMotion: "reduce" });
    test("fica vertical, sem pin, com a linha inteira", async ({ page }) => {
      test.skip(!site?.story.length, "sem momentos na API");
      await page.goto("/");
      const story = page.locator("section#historia");
      await story.scrollIntoViewIfNeeded();
      await expect(story.locator("[data-story-track]")).toHaveAttribute("data-line", "ready");
      await expect(story.locator("[data-story-viewport][data-pinned]")).toHaveCount(0);
      await expect(story.locator("[data-story-line]")).toHaveCSS("stroke-dashoffset", "0px");
    });
  });
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

test("/galeria carrega as fotos", async ({ page }) => {
  await page.goto("/galeria");
  await expect(page.getByRole("heading", { level: 1, name: "Galeria" })).toBeVisible();
  const imgs = page.locator("[data-gallery] img");
  if (site) await expect(imgs).toHaveCount(site.gallery.items.length);
  await expect(imgs.first()).toBeVisible();
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

test("navegação: menu leva às páginas internas", async ({ page }) => {
  await page.goto("/padrinhos");
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Galeria" })
    .click();
  await expect(page).toHaveURL(/\/galeria$/);
  await expect(page.getByRole("heading", { level: 1, name: "Galeria" })).toBeVisible();
});
