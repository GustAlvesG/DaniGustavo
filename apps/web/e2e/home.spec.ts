import { expect, test } from "@playwright/test";

test("home exibe o título", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dani & Gustavo" })).toBeVisible();
});
