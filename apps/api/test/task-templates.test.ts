import { and, eq, eventTasks } from "@casamento/db";
import type { TaskTemplateSummary, TaskTemplateView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 4, frente A: modelos de tarefas da organização.

const { app, db } = testApp({ revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const url = (orgId: number, path = "") => `/api/admin/orgs/${orgId}/task-templates${path}`;
const call = (kind: TestUserKind, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const view = async (res: Response) =>
  ((await res.json()) as { template: TaskTemplateView }).template;
const names = async (res: Response) =>
  ((await res.json()) as { templates: TaskTemplateSummary[] }).templates.map((t) => t.name);

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("CRUD de modelos", () => {
  it("cria com itens ordenados, lê, troca os itens e exclui", async () => {
    const res = await call("owner", url(ev.orgA.id), {
      method: "POST",
      body: {
        name: "Festa de 15 anos",
        eventType: "fifteen",
        description: "Passo a passo",
        items: [
          { title: "Primeiro", offsetDays: -100 },
          { title: "Segundo", category: "festa", offsetDays: -50, description: "Detalhe" },
        ],
      },
    });
    expect(res.status).toBe(201);
    const t = await view(res);
    expect(t).toMatchObject({ name: "Festa de 15 anos", eventType: "fifteen", itemCount: 2 });
    expect(t.items.map((i) => [i.title, i.sort, i.category])).toEqual([
      ["Primeiro", 1, "geral"],
      ["Segundo", 2, "festa"],
    ]);

    const put = await call("member", url(ev.orgA.id, `/${t.id}`), {
      method: "PUT",
      body: { name: "Renomeado", eventType: null, items: [{ title: "Único", offsetDays: 0 }] },
    });
    expect(put.status).toBe(200);
    const after = await view(await call("owner", url(ev.orgA.id, `/${t.id}`)));
    expect(after).toMatchObject({ name: "Renomeado", eventType: null, itemCount: 1 });
    expect(after.items.map((i) => i.title)).toEqual(["Único"]);

    const listed = await call("owner", url(ev.orgA.id));
    const { templates } = (await listed.json()) as { templates: TaskTemplateSummary[] };
    expect(templates.find((x) => x.id === t.id)?.itemCount).toBe(1);

    const del = await call("owner", url(ev.orgA.id, `/${t.id}`), { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await call("owner", url(ev.orgA.id, `/${t.id}`))).status).toBe(404);
  });

  it("filtra por eventType (tipo + qualquer tipo)", async () => {
    const mk = (name: string, eventType?: string) =>
      call("owner", url(ev.orgA.id), { method: "POST", body: { name, eventType } });
    await mk("A-casamento", "wedding");
    await mk("A-aniversario", "birthday");
    await mk("A-qualquer");
    const found = await names(await call("owner", `${url(ev.orgA.id)}?eventType=wedding`));
    expect(found).toContain("A-casamento");
    expect(found).toContain("A-qualquer");
    expect(found).not.toContain("A-aniversario");
  });

  it("valida o corpo: nome, tipo de evento, deslocamento", async () => {
    const bad = (body: unknown) => call("owner", url(ev.orgA.id), { method: "POST", body });
    expect((await bad({ name: "" })).status).toBe(422);
    expect((await bad({ name: "X", eventType: "festival" })).status).toBe(422);
    expect((await bad({ name: "X", items: [{ title: "a", offsetDays: 5000 }] })).status).toBe(422);
    expect((await bad({ name: "X", items: [{ title: "", offsetDays: 1 }] })).status).toBe(422);
  });

  it("apagar o modelo mantém as tarefas já geradas", async () => {
    const title = "Tarefa gerada e mantida";
    const t = await view(
      await call("owner", url(ev.orgA.id), {
        method: "POST",
        body: { name: "Efêmero", items: [{ title, offsetDays: -2 }] },
      }),
    );
    await call("owner", `/api/admin/events/${ev.eventA.id}/tasks/apply-template`, {
      method: "POST",
      body: { templateId: t.id },
    });
    await call("owner", url(ev.orgA.id, `/${t.id}`), { method: "DELETE" });
    const rows = await db
      .select({ id: eventTasks.id })
      .from(eventTasks)
      .where(and(eq(eventTasks.eventId, ev.eventA.id), eq(eventTasks.title, title)));
    expect(rows).toHaveLength(1);
  });
});

describe("isolamento entre organizações e papéis", () => {
  it("modelo e itens de outra org: 404 em ler, trocar, apagar; listas separadas", async () => {
    const b = await view(
      await call("stranger", url(ev.orgB.id), {
        method: "POST",
        body: { name: "Modelo B", items: [{ title: "Item B", offsetDays: 1 }] },
      }),
    );
    const path = url(ev.orgA.id, `/${b.id}`);
    expect((await call("owner", path)).status).toBe(404);
    const put = await call("owner", path, { method: "PUT", body: { name: "Invadido", items: [] } });
    expect(put.status).toBe(404);
    expect((await call("owner", path, { method: "DELETE" })).status).toBe(404);
    // Nada mudou na B.
    const still = await view(await call("stranger", url(ev.orgB.id, `/${b.id}`)));
    expect(still).toMatchObject({ name: "Modelo B", itemCount: 1 });
    expect(await names(await call("owner", url(ev.orgA.id)))).not.toContain("Modelo B");
  });

  it("sem vínculo com a org (estranho, anfitrião) → 404 até na leitura", async () => {
    for (const kind of ["stranger", "host"] as const) {
      expect((await call(kind, url(ev.orgA.id))).status, kind).toBe(404);
      const post = await call(kind, url(ev.orgA.id), { method: "POST", body: { name: "x" } });
      expect(post.status, kind).toBe(404);
    }
  });

  it("platform admin gerencia modelos de qualquer org", async () => {
    const res = await call("platformAdmin", url(ev.orgA.id), {
      method: "POST",
      body: { name: "Da plataforma" },
    });
    expect(res.status).toBe(201);
  });
});
