import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 1: hero e abertura. Comportamento, não pixels: a capa da abertura é
 * `[data-opening-root]` e, enquanto ela cobre a página, o <html> tem
 * `data-opening`.
 */

const cover = (page: Page) => page.locator("[data-opening-root]");
const openingAttr = (page: Page) => page.locator("html[data-opening]");
const running = (page: Page) => page.locator('html[data-opening="running"]');

test("home exibe os nomes no h1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dani & Gustavo" })).toBeVisible();
});

test.describe("abertura", () => {
  test("aparece na primeira visita e uma tecla pula", async ({ page }) => {
    await page.goto("/");
    await expect(cover(page)).toBeVisible();
    // Espera a ilha assumir a capa (hidratação) antes de pular.
    await expect(running(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(openingAttr(page)).toHaveCount(0);
    await expect(cover(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("um clique pula e não repete na mesma sessão", async ({ page }) => {
    await page.goto("/");
    await expect(running(page)).toHaveCount(1);
    await page.mouse.click(20, 20);
    await expect(openingAttr(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(openingAttr(page)).toHaveCount(0);
    await expect(cover(page)).toHaveCount(0);
  });

  test("termina sozinha", async ({ page }) => {
    await page.goto("/");
    await expect(running(page)).toHaveCount(1);
    await expect(openingAttr(page)).toHaveCount(0, { timeout: 8_000 });
  });

  test.describe("movimento reduzido", () => {
    test.use({ reducedMotion: "reduce" });

    test("vira um fade curto, sem interação", async ({ page }) => {
      await page.goto("/");
      await expect(cover(page)).toBeVisible();
      await expect(openingAttr(page)).toHaveCount(0, { timeout: 3_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Dani & Gustavo" })).toBeVisible();
      // Sem GSAP no caminho reduzido: os nomes não foram divididos em letras.
      await expect(page.locator(".hero-char")).toHaveCount(0);
    });
  });
});

test("/dev/design renderiza em desenvolvimento", async ({ page }) => {
  const res = await page.goto("/dev/design");
  test.skip(res?.status() === 404, "a prancha só existe em desenvolvimento");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-tile]").first()).toBeVisible();
});
