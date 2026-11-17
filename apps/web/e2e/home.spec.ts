import { expect, test, type Page } from "@playwright/test";

/*
 * Topo da home (Proposta C): foto de fundo, nomes, contagem com segundos e a
 * data que passa para o menu ao rolar. Comportamento, não pixels.
 */

const nav = (page: Page) => page.locator("header[data-nav]");
const navDate = (page: Page) => page.locator("[data-nav-date]");

async function boxHeight(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
}

test("home exibe os nomes no h1 sobre a foto do casal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dani & Gustavo" })).toBeVisible();
  // Foto de fundo do hero (art direction: <picture> com fonte para telas largas).
  await expect(page.locator("#inicio picture img")).toHaveAttribute("src", /fotos/);
  await expect(page.locator("#inicio picture source")).toHaveCount(1);
});

test("contagem regressiva com segundos que andam", async ({ page }) => {
  await page.goto("/");
  const seconds = page.locator('[data-countdown] [data-unit="seconds"]');
  await expect(page.locator("[data-countdown] [data-unit]")).toHaveCount(4);
  await expect(seconds).toContainText("seg");
  const first = await seconds.innerText();
  await expect.poll(() => seconds.innerText(), { timeout: 4_000 }).not.toBe(first);
  // Frase para leitor de tela, sem os segundos.
  await expect(page.getByRole("timer")).toContainText(/^Faltam? /);
});

test("ao rolar, a data vai para o menu, que não muda de altura", async ({ page }) => {
  await page.goto("/");
  const navH = await boxHeight(page, "header[data-nav]");
  const heroH = await boxHeight(page, "#inicio");
  expect(navH).toBe(72);

  // No topo: a data está no hero e não no menu.
  await expect(page.locator("[data-hero-date]")).toBeInViewport();
  await expect(navDate(page)).not.toHaveAttribute("data-shown");

  await page.locator("#historia").scrollIntoViewIfNeeded();
  await expect(navDate(page)).toHaveAttribute("data-shown", "");
  await expect(navDate(page)).toHaveCSS("opacity", "1");
  expect(await boxHeight(page, "header[data-nav]")).toBe(navH);
  expect(await boxHeight(page, "#inicio")).toBe(heroH);
  await expect(nav(page)).toBeInViewport();

  // De volta ao topo, a data sai do menu.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(navDate(page)).not.toHaveAttribute("data-shown");
});

test("menu: links para as seções e para confirmar presença", async ({ page }, info) => {
  await page.goto("/");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const menu = page.getByRole("navigation", { name: "Menu" });
    const link = menu.getByRole("link", { name: "Programação" });
    await expect(link).toHaveAttribute("href", "/#programacao");
    await link.click();
    await expect(menu).toBeHidden();
  } else {
    const principal = page.getByRole("navigation", { name: "Principal" });
    await expect(principal.getByRole("link", { name: "Confirmar presença" })).toHaveAttribute(
      "href",
      "/confirmar",
    );
    await principal.getByRole("link", { name: "Programação" }).click();
  }
  await expect(page.locator("#programacao")).toBeInViewport();
});

test.describe("movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });

  test("tudo aparece parado e visível", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Dani & Gustavo" })).toBeVisible();
    const polaroid = page.locator("#historia .polaroid").first();
    await polaroid.scrollIntoViewIfNeeded();
    await expect(polaroid).toHaveCSS("opacity", "1");
    await expect(polaroid).toHaveCSS("animation-name", "none");
  });
});
