import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebRevalidator } from "../src/admin/revalidate.ts";
import { parseEnv } from "../src/env.ts";

const base = {
  DATABASE_URL: "mysql://root:@127.0.0.1:3306/casamento",
  API_URL: "http://localhost:3333",
  WEB_KEY: "x".repeat(32),
  BETTER_AUTH_SECRET: "y".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3333",
  SITE_URL: "https://dominio.com.br/",
};

function stubFetch() {
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebRevalidator", () => {
  it("usa SITE_URL quando WEB_INTERNAL_URL está vazia", async () => {
    const fetchMock = stubFetch();
    await createWebRevalidator(parseEnv(base))(7, ["gifts"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dominio.com.br/api/revalidar",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventId: 7, tags: ["gifts"] }),
      }),
    );
  });

  it("prefere WEB_INTERNAL_URL (rede interna do Docker)", async () => {
    const fetchMock = stubFetch();
    await createWebRevalidator(parseEnv({ ...base, WEB_INTERNAL_URL: "http://web:3000/" }))(1, [
      "site",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/revalidar",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-web-key": base.WEB_KEY }),
      }),
    );
  });
});
