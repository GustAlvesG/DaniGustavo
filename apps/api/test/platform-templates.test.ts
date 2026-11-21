import { byEvent, eq, eventTasks, taskTemplates } from "@casamento/db";
import type { PlatformTaskTemplateView, TaskTemplateView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente E: modelos de tarefas prontos da plataforma (ver, copiar, aplicar, editar).

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const call = (kind: TestUserKind, url: string, method = "GET", body?: unknown) =>
  app.request(url, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;
const orgUrl = (path = "") => `/api/admin/orgs/${ev.orgA.id}/platform-task-templates${path}`;
const platformUrl = (path = "") => `/api/admin/platform/task-templates${path}`;

let wedding!: PlatformTaskTemplateView;

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

describe("modelos da plataforma vistos pela organização", () => {
  it("o seed traz casamento, 15 anos e aniversário, com itens de categoria válida", async () => {
    const res = await call("owner", orgUrl());
    expect(res.status).toBe(200);
    const { templates } = await json<{ templates: PlatformTaskTemplateView[] }>(res);
    const codes = templates.map((t) => t.code);
    expect(codes).toEqual(
      expect.arrayContaining(["casamento-completo", "festa-15-anos", "aniversario"]),
    );
    wedding = templates.find((t) => t.code === "casamento-completo")!;
    expect(wedding.eventType).toBe("wedding");
    expect(wedding.items.length).toBeGreaterThan(10);
    expect(wedding.items.some((i) => i.offsetDays < 0)).toBe(true);
  });

  it("filtra por tipo de evento (traz os do tipo e os de qualquer tipo)", async () => {
    const { templates } = await json<{ templates: PlatformTaskTemplateView[] }>(
      await call("member", orgUrl("?eventType=birthday")),
    );
    expect(templates.map((t) => t.code)).toContain("aniversario");
    expect(templates.map((t) => t.code)).not.toContain("casamento-completo");
  });

  it("outra organização também vê (são globais), anfitrião não entra na organização (404)", async () => {
    const other = await call("stranger", `/api/admin/orgs/${ev.orgB.id}/platform-task-templates`);
    expect(other.status).toBe(200);
    expect((await call("host", orgUrl())).status).toBe(404);
    // Sem vínculo com a org A.
    expect((await call("stranger", orgUrl())).status).toBe(404);
  });

  it("copiar cria um modelo editável só na organização que copiou", async () => {
    const res = await call("owner", orgUrl(`/${wedding.id}/copy`), "POST");
    expect(res.status).toBe(201);
    const { template } = await json<{ template: TaskTemplateView }>(res);
    expect(template.name).toBe(wedding.name);
    expect(template.items).toHaveLength(wedding.items.length);
    const mineA = await json<{ templates: { id: number }[] }>(
      await call("owner", `/api/admin/orgs/${ev.orgA.id}/task-templates`),
    );
    expect(mineA.templates.map((t) => t.id)).toContain(template.id);
    const mineB = await json<{ templates: { id: number }[] }>(
      await call("stranger", `/api/admin/orgs/${ev.orgB.id}/task-templates`),
    );
    expect(mineB.templates.map((t) => t.id)).not.toContain(template.id);
    // A cópia é independente: mudar a cópia não mexe no modelo da plataforma.
    const edit = await call(
      "owner",
      `/api/admin/orgs/${ev.orgA.id}/task-templates/${template.id}`,
      "PUT",
      {
        name: "Meu casamento",
        eventType: "wedding",
        description: null,
        items: [],
      },
    );
    expect(edit.status).toBe(200);
    const again = await json<{ templates: PlatformTaskTemplateView[] }>(
      await call("owner", orgUrl()),
    );
    expect(again.templates.find((t) => t.id === wedding.id)?.items).toHaveLength(
      wedding.items.length,
    );
    await db.delete(taskTemplates).where(eq(taskTemplates.id, template.id));
  });

  it("modelo inexistente → 404", async () => {
    expect((await call("owner", orgUrl("/999999999/copy"), "POST")).status).toBe(404);
  });
});

describe("aplicar direto no evento", () => {
  const apply = (kind: TestUserKind, eventId: number, templateId: number) =>
    call(kind, `/api/admin/events/${eventId}/tasks/apply-platform-template`, "POST", {
      templateId,
    });

  it("cria as tarefas com prazo relativo à data do evento", async () => {
    const res = await apply("owner", ev.eventA.id, wedding.id);
    expect(res.status).toBe(200);
    expect(await json<{ created: number }>(res)).toEqual({ created: wedding.items.length });
    const rows = await db.select().from(eventTasks).where(byEvent(eventTasks, ev.eventA));
    const first = wedding.items[0]!;
    const made = rows.find((r) => r.title === first.title)!;
    expect(made.dueOffsetDays).toBe(first.offsetDays);
    expect(made.dueOn).not.toBeNull();
    expect(made.status).toBe("todo");
    // As tarefas ficam só no evento A.
    const other = await db.select().from(eventTasks).where(byEvent(eventTasks, ev.eventB));
    expect(other.find((r) => r.title === first.title)).toBeUndefined();
  });

  it("anfitrião aplica (tasks.write); sem a permissão, 403; evento alheio, 404", async () => {
    const hostOk = await apply("host", ev.eventA.id, wedding.id);
    expect(hostOk.status).toBe(200);
    const put = (deny: string[]) =>
      call(
        "owner",
        `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`,
        "PUT",
        { deny },
      );
    expect((await put(["tasks.write"])).status).toBe(200);
    expect((await apply("host", ev.eventA.id, wedding.id)).status).toBe(403);
    expect((await put([])).status).toBe(200);
    expect((await apply("stranger", ev.eventA.id, wedding.id)).status).toBe(404);
  });

  it("lista os modelos do evento pelo tipo dele (casamento)", async () => {
    const { templates } = await json<{ templates: PlatformTaskTemplateView[] }>(
      await call("owner", `/api/admin/events/${ev.eventA.id}/tasks/platform-templates`),
    );
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) expect([null, ev.eventA.type]).toContain(t.eventType);
  });

  it("modelo inativo some para a organização e não se aplica (404)", async () => {
    const draft = await call("platformAdmin", platformUrl(`/${wedding.id}`), "PUT", {
      name: wedding.name,
      eventType: wedding.eventType,
      description: wedding.description,
      active: false,
      items: wedding.items.map(({ title, description, category, offsetDays }) => ({
        title,
        description,
        category,
        offsetDays,
      })),
    });
    expect(draft.status).toBe(200);
    try {
      const list = await json<{ templates: PlatformTaskTemplateView[] }>(
        await call("owner", orgUrl()),
      );
      expect(list.templates.find((t) => t.id === wedding.id)).toBeUndefined();
      expect(
        (
          await call(
            "owner",
            `/api/admin/events/${ev.eventA.id}/tasks/apply-platform-template`,
            "POST",
            {
              templateId: wedding.id,
            },
          )
        ).status,
      ).toBe(404);
      expect((await call("owner", orgUrl(`/${wedding.id}/copy`), "POST")).status).toBe(404);
    } finally {
      await call("platformAdmin", platformUrl(`/${wedding.id}`), "PUT", {
        name: wedding.name,
        eventType: wedding.eventType,
        description: wedding.description,
        active: true,
        items: wedding.items.map(({ title, description, category, offsetDays }) => ({
          title,
          description,
          category,
          offsetDays,
        })),
      });
    }
  });
});

describe("edição pela plataforma", () => {
  it("só o administrador da plataforma lista e edita; os demais recebem 404 de rota", async () => {
    for (const kind of ["owner", "member", "host", "stranger"] as const) {
      expect((await call(kind, platformUrl())).status).toBe(404);
      expect((await call(kind, platformUrl(`/${wedding.id}`), "PUT", {})).status).toBe(404);
    }
    const res = await call("platformAdmin", platformUrl());
    expect(res.status).toBe(200);
    const { templates } = await json<{ templates: PlatformTaskTemplateView[] }>(res);
    expect(templates.some((t) => t.code === "casamento-completo")).toBe(true);
  });

  it("PUT troca os itens e valida categoria, prazo e nome", async () => {
    const aniversario = (
      await json<{ templates: PlatformTaskTemplateView[] }>(
        await call("platformAdmin", platformUrl()),
      )
    ).templates.find((t) => t.code === "aniversario")!;
    const body = (items: unknown[], extra: Record<string, unknown> = {}) => ({
      name: aniversario.name,
      eventType: aniversario.eventType,
      description: aniversario.description,
      active: true,
      items,
      ...extra,
    });
    const original = aniversario.items.map(({ title, description, category, offsetDays }) => ({
      title,
      description,
      category,
      offsetDays,
    }));
    expect(
      (
        await call(
          "platformAdmin",
          platformUrl(`/${aniversario.id}`),
          "PUT",
          body([{ title: "X", description: null, category: "inexistente", offsetDays: 0 }]),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await call(
          "platformAdmin",
          platformUrl(`/${aniversario.id}`),
          "PUT",
          body([{ title: "X", description: null, category: "geral", offsetDays: 99999 }]),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await call(
          "platformAdmin",
          platformUrl(`/${aniversario.id}`),
          "PUT",
          body(original, { name: " " }),
        )
      ).status,
    ).toBe(422);
    expect(
      (await call("platformAdmin", platformUrl("/999999999"), "PUT", body(original))).status,
    ).toBe(404);
    try {
      const ok = await call(
        "platformAdmin",
        platformUrl(`/${aniversario.id}`),
        "PUT",
        body([{ title: "Única", description: null, category: "geral", offsetDays: -5 }]),
      );
      expect(ok.status).toBe(200);
      const { template } = await json<{ template: PlatformTaskTemplateView }>(ok);
      expect(template.items.map((i) => i.title)).toEqual(["Única"]);
    } finally {
      await call("platformAdmin", platformUrl(`/${aniversario.id}`), "PUT", body(original));
    }
    const restored = (
      await json<{ templates: PlatformTaskTemplateView[] }>(
        await call("platformAdmin", platformUrl()),
      )
    ).templates.find((t) => t.code === "aniversario")!;
    expect(restored.items).toHaveLength(original.length);
  });
});
