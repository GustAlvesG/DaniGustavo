import { and, eq, events, eventSettings, eventTasks } from "@casamento/db";
import type { ApiError, TaskList, TaskRow } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, localDate } from "../src/tasks/dates.ts";
import { createTask, recalculateTaskDues } from "../src/tasks/service.ts";
import {
  createTestEvents,
  legacySettingsBase,
  testApp,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

// Fase 4, frente A: tarefas do evento. Relógio fixo: hoje = 2029-12-20 em São Paulo;
// o evento de teste é em 2030-01-01 (15h UTC).

const NOW = new Date("2029-12-20T12:00:00Z");
const { app, db } = testApp({ now: () => NOW, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;

const base = (eventId: number) => `/api/admin/events/${eventId}/tasks`;
const call = (kind: TestUserKind, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const post = async (title: string, extra: Record<string, unknown> = {}, eventId = ev.eventA.id) =>
  call("owner", base(eventId), { method: "POST", body: { title, ...extra } });
const created = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await post(title, extra);
  expect(res.status).toBe(201);
  return ((await res.json()) as { task: TaskRow }).task;
};
const list = async (view = "all", eventId = ev.eventA.id, kind: TestUserKind = "owner") =>
  (await (await call(kind, `${base(eventId)}?view=${view}`)).json()) as TaskList;
const hostPerms = (deny: string[]) =>
  call("owner", `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`, {
    method: "PUT",
    body: { deny },
  });

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

describe("datas no fuso do evento", () => {
  it("a data local segue o fuso, não o UTC", () => {
    const instant = new Date("2030-01-02T01:30:00Z");
    expect(localDate(instant, "UTC")).toBe("2030-01-02");
    expect(localDate(instant, "America/Sao_Paulo")).toBe("2030-01-01");
  });

  it("addDays atravessa mês e ano", () => {
    expect(addDays("2030-01-01", -90)).toBe("2029-10-03");
    expect(addDays("2029-12-31", 1)).toBe("2030-01-01");
  });
});

describe("CRUD", () => {
  it("cria com prazo absoluto, relativo e sem prazo", async () => {
    const abs = await created("Absoluta", { due: { kind: "date", date: "2030-02-10" } });
    expect(abs).toMatchObject({ dueOn: "2030-02-10", dueOffsetDays: null, status: "todo" });
    expect(abs.category).toBe("geral");

    const rel = await created("Relativa", { due: { kind: "offset", days: -30 } });
    expect(rel).toMatchObject({ dueOn: "2029-12-02", dueOffsetDays: -30 });

    const none = await created("Sem prazo");
    expect(none).toMatchObject({ dueOn: null, dueOffsetDays: null, overdue: false });
  });

  it("valida o corpo (título, categoria, data) com 422", async () => {
    expect((await post("")).status).toBe(422);
    expect((await post("X", { category: "inexistente" })).status).toBe(422);
    expect((await post("X", { due: { kind: "date", date: "10/02/2030" } })).status).toBe(422);
    expect((await post("X", { due: { kind: "offset", days: 99999 } })).status).toBe(422);
  });

  it("PATCH muda campos e troca o tipo de prazo", async () => {
    const t = await created("Muda", { due: { kind: "offset", days: -10 } });
    const url = `${base(ev.eventA.id)}/${t.id}`;
    const res = await call("owner", url, {
      method: "PATCH",
      body: { title: "Mudou", category: "festa", due: { kind: "date", date: "2030-03-03" } },
    });
    const { task } = (await res.json()) as { task: TaskRow };
    expect(task).toMatchObject({
      title: "Mudou",
      category: "festa",
      dueOn: "2030-03-03",
      dueOffsetDays: null,
    });
    const cleared = await call("owner", url, { method: "PATCH", body: { due: null } });
    expect(((await cleared.json()) as { task: TaskRow }).task.dueOn).toBeNull();
  });

  it("concluir grava quem e quando; reabrir limpa", async () => {
    const t = await created("Concluir");
    const url = `${base(ev.eventA.id)}/${t.id}`;
    const done = await call("host", url, { method: "PATCH", body: { status: "done" } });
    const row = ((await done.json()) as { task: TaskRow }).task;
    expect(row.status).toBe("done");
    expect(row.completedAt).toBe(NOW.toISOString());
    const [rec] = await db
      .select({ by: eventTasks.completedBy })
      .from(eventTasks)
      .where(and(eq(eventTasks.eventId, ev.eventA.id), eq(eventTasks.id, t.id)));
    expect(rec?.by).toBe(ev.users.host.id);

    const reopened = await call("owner", url, { method: "PATCH", body: { status: "doing" } });
    expect(((await reopened.json()) as { task: TaskRow }).task).toMatchObject({
      status: "doing",
      completedAt: null,
    });
  });

  it("exclui; repetir dá 404", async () => {
    const t = await created("Apagar");
    const url = `${base(ev.eventA.id)}/${t.id}`;
    expect((await call("owner", url, { method: "DELETE" })).status).toBe(200);
    expect((await call("owner", url, { method: "DELETE" })).status).toBe(404);
    expect((await call("owner", url, { method: "PATCH", body: { title: "x" } })).status).toBe(404);
  });
});

describe("responsável", () => {
  it("aceita membro da org e anfitrião do evento; rejeita estranho com 422 e campo", async () => {
    const asOwner = await created("De dono", { assigneeUserId: ev.users.owner.id });
    expect(asOwner.assignee).toEqual({ userId: ev.users.owner.id, name: ev.users.owner.name });
    const asHost = await created("De anfitrião", { assigneeUserId: ev.users.host.id });
    expect(asHost.assignee?.userId).toBe(ev.users.host.id);

    const bad = await post("De estranho", { assigneeUserId: ev.users.stranger.id });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as ApiError).error.field).toBe("assigneeUserId");
    expect((await post("Fantasma", { assigneeUserId: "nao-existe" })).status).toBe(422);
  });

  it("PATCH também confere o responsável", async () => {
    const t = await created("Troca");
    const res = await call("owner", `${base(ev.eventA.id)}/${t.id}`, {
      method: "PATCH",
      body: { assigneeUserId: ev.users.stranger.id },
    });
    expect(res.status).toBe(422);
  });

  it("GET /assignees lista membros e anfitriões do evento, sem gente de outra org", async () => {
    const res = await call("owner", `${base(ev.eventA.id)}/assignees`);
    const { people } = (await res.json()) as { people: { userId: string; role: string }[] };
    const ids = people.map((p) => p.userId).sort();
    expect(ids).toEqual([ev.users.owner.id, ev.users.member.id, ev.users.host.id].sort());
    expect(people.find((p) => p.userId === ev.users.host.id)?.role).toBe("event_host");
    expect(ids).not.toContain(ev.users.stranger.id);
  });
});

describe("visões e contagens (relógio fixo)", () => {
  it("atrasadas, próximas, abertas e feitas", async () => {
    // Evento da org B: sem ruído dos outros testes.
    const mk = (title: string, extra: Record<string, unknown>) =>
      call("stranger", base(ev.eventB.id), { method: "POST", body: { title, ...extra } });
    await mk("Atrasada", { due: { kind: "date", date: "2029-12-19" } });
    await mk("Hoje", { due: { kind: "date", date: "2029-12-20" } });
    await mk("Daqui a 30 dias", { due: { kind: "date", date: "2030-01-19" } });
    await mk("Daqui a 31 dias", { due: { kind: "date", date: "2030-01-20" } });
    await mk("Sem prazo", {});
    await mk("Feita atrasada", { status: "done", due: { kind: "date", date: "2029-01-01" } });

    const all = await list("all", ev.eventB.id, "stranger");
    expect(all.counts).toEqual({ open: 5, overdue: 1, upcoming: 2, done: 1 });
    expect(all.today).toBe("2029-12-20");
    expect(all.eventDate).toBe("2030-01-01");

    const titles = async (v: string) =>
      (await list(v, ev.eventB.id, "stranger")).tasks.map((t) => t.title);
    expect(await titles("overdue")).toEqual(["Atrasada"]);
    expect(await titles("upcoming")).toEqual(["Hoje", "Daqui a 30 dias"]);
    expect(await titles("done")).toEqual(["Feita atrasada"]);
    expect((await titles("open")).sort()).toEqual(
      ["Atrasada", "Hoje", "Daqui a 30 dias", "Daqui a 31 dias", "Sem prazo"].sort(),
    );
    expect(all.tasks.find((t) => t.title === "Atrasada")?.overdue).toBe(true);
  });

  it("visão inválida → 422", async () => {
    expect((await call("owner", `${base(ev.eventA.id)}?view=xyz`)).status).toBe(422);
  });
});

describe("recalcular prazos relativos", () => {
  it("segue a data local do evento (virada de dia em UTC) e a mudança de data", async () => {
    const t = await created("Recalcula", { due: { kind: "offset", days: -7 } });
    const abs = await created("Fica", { due: { kind: "date", date: "2030-05-05" } });
    expect(t.dueOn).toBe("2029-12-25");

    // 01:30Z de 2/1 = 22:30 de 1/1 em São Paulo: o dia local continua 2030-01-01.
    const sameDay = { ...ev.eventA, startsAt: new Date("2030-01-02T01:30:00Z") };
    expect(await recalculateTaskDues(db, sameDay)).toBe(0);

    // Em UTC o mesmo instante é 2/1: uma tarefa criada nesse fuso nasce em 26/12.
    const inUtc = await createTask(
      db,
      { ...sameDay, timezone: "UTC" },
      {
        title: "Em UTC",
        description: null,
        category: "geral",
        status: "todo",
        assigneeUserId: null,
        due: { kind: "offset", days: -7 },
      },
      { id: ev.users.owner.id },
      NOW,
    );
    expect(inUtc.dueOn).toBe("2029-12-26");

    // A data do evento muda: recalcula só as relativas.
    const moved = { ...ev.eventA, startsAt: new Date("2030-03-01T15:00:00Z") };
    expect(await recalculateTaskDues(db, moved)).toBeGreaterThanOrEqual(2);
    const all = (await list()).tasks;
    expect(all.find((x) => x.id === t.id)?.dueOn).toBe("2030-02-22");
    expect(all.find((x) => x.id === abs.id)?.dueOn).toBe("2030-05-05");

    // A rota usa a data vigente do evento (2030-01-01) e volta tudo.
    const res = await call("owner", `${base(ev.eventA.id)}/recalculate`, { method: "POST" });
    expect(((await res.json()) as { updated: number }).updated).toBeGreaterThanOrEqual(2);
    expect((await list()).tasks.find((x) => x.id === t.id)?.dueOn).toBe("2029-12-25");
  });

  it("evento sem data: relativas perdem due_on; absolutas ficam", async () => {
    const t = await created("Sem data do evento", { due: { kind: "offset", days: -3 } });
    await recalculateTaskDues(db, { ...ev.eventA, startsAt: null });
    const row = (await list()).tasks.find((x) => x.id === t.id);
    expect(row).toMatchObject({ dueOn: null, dueOffsetDays: -3 });
    await call("owner", `${base(ev.eventA.id)}/recalculate`, { method: "POST" });
    expect((await list()).tasks.find((x) => x.id === t.id)?.dueOn).toBe("2029-12-29");
  });
});

describe("data do evento mudada nas configurações", () => {
  it("PUT /settings com nova data atualiza o evento e recalcula os prazos relativos", async () => {
    // Conteúdo público válido (o PUT confere o site inteiro): base do evento 1.
    const base = await legacySettingsBase(db);
    await db
      .insert(eventSettings)
      .values(base.map((r) => ({ ...r, eventId: ev.eventA.id })))
      .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
    const t = await created("Segue a data", { due: { kind: "offset", days: -7 } });
    const abs = await created("Não segue", { due: { kind: "date", date: "2030-05-05" } });
    expect(t.dueOn).toBe("2029-12-25");

    const put = (datetime: string, timezone = "America/Sao_Paulo") =>
      call("owner", `/api/admin/events/${ev.eventA.id}/settings`, {
        method: "PUT",
        body: { values: { "wedding.datetime": datetime, "wedding.timezone": timezone } },
      });
    try {
      expect((await put("2030-03-01T12:00:00-03:00")).status).toBe(200);
      const [row] = await db
        .select({ startsAt: events.startsAt })
        .from(events)
        .where(eq(events.id, ev.eventA.id));
      expect(row!.startsAt!.toISOString()).toBe("2030-03-01T15:00:00.000Z");
      let tasks = (await list()).tasks;
      expect(tasks.find((x) => x.id === t.id)?.dueOn).toBe("2030-02-22");
      expect(tasks.find((x) => x.id === abs.id)?.dueOn).toBe("2030-05-05");

      // Só o fuso muda: 23h30 em São Paulo vira o dia seguinte em Tóquio.
      expect((await put("2030-03-01T23:30:00-03:00", "Asia/Tokyo")).status).toBe(200);
      tasks = (await list()).tasks;
      expect(tasks.find((x) => x.id === t.id)?.dueOn).toBe("2030-02-23");
    } finally {
      expect((await put("2030-01-01T12:00:00-03:00")).status).toBe(200);
    }
    expect((await list()).tasks.find((x) => x.id === t.id)?.dueOn).toBe("2029-12-25");
  });
});

describe("isolamento e permissões", () => {
  it("evento alheio ou sem vínculo → 404 em todas as rotas", async () => {
    const t = await created("Só da A");
    const probes: [string, string, unknown?][] = [
      ["GET", base(ev.eventA.id)],
      ["POST", base(ev.eventA.id), { title: "x" }],
      ["PATCH", `${base(ev.eventA.id)}/${t.id}`, { title: "x" }],
      ["DELETE", `${base(ev.eventA.id)}/${t.id}`],
      ["GET", `${base(ev.eventA.id)}/assignees`],
      ["GET", `${base(ev.eventA.id)}/templates`],
      ["POST", `${base(ev.eventA.id)}/apply-template`, { templateId: 1 }],
      ["POST", `${base(ev.eventA.id)}/recalculate`],
    ];
    for (const [method, path, body] of probes) {
      const res = await call("stranger", path, { method, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("tarefa de outro evento não aparece nem se altera pelo evento errado", async () => {
    const mine = await created("Da A privada");
    const eventB = await call("stranger", base(ev.eventB.id), {
      method: "POST",
      body: { title: "Da B" },
    });
    const bTask = ((await eventB.json()) as { task: TaskRow }).task;
    expect((await list("all", ev.eventA.id)).tasks.map((x) => x.id)).not.toContain(bTask.id);
    const cross = `${base(ev.eventA.id)}/${bTask.id}`;
    expect((await call("owner", cross, { method: "PATCH", body: { title: "x" } })).status).toBe(
      404,
    );
    expect((await call("owner", cross, { method: "DELETE" })).status).toBe(404);
    expect((await list("all", ev.eventB.id, "stranger")).tasks.map((x) => x.id)).not.toContain(
      mine.id,
    );
  });

  it("anfitrião com tasks.read negado → 403 (leitura e escrita)", async () => {
    expect((await hostPerms(["tasks.read"])).status).toBe(200);
    expect((await call("host", base(ev.eventA.id))).status).toBe(403);
    expect((await call("host", `${base(ev.eventA.id)}/assignees`)).status).toBe(403);
    const write = await call("host", base(ev.eventA.id), { method: "POST", body: { title: "x" } });
    expect(write.status).toBe(403); // negar a leitura nega a escrita
    expect((await call("owner", base(ev.eventA.id))).status).toBe(200);
    await hostPerms([]);
  });

  it("tasks.write negado: anfitrião lê, mas não escreve", async () => {
    await hostPerms(["tasks.write"]);
    expect((await call("host", base(ev.eventA.id))).status).toBe(200);
    const body = { title: "x" };
    expect((await call("host", base(ev.eventA.id), { method: "POST", body })).status).toBe(403);
    const recalc = await call("host", `${base(ev.eventA.id)}/recalculate`, { method: "POST" });
    expect(recalc.status).toBe(403);
    await hostPerms([]);
  });
});

describe("modelos aplicados ao evento", () => {
  const tpl = (kind: TestUserKind, orgId: number, body: unknown) =>
    call(kind, `/api/admin/orgs/${orgId}/task-templates`, { method: "POST", body });

  it("aplica gerando tarefas com prazo relativo calculado; duplica ao repetir", async () => {
    const res = await tpl("owner", ev.orgA.id, {
      name: "Casamento",
      eventType: "wedding",
      items: [
        { title: "Reservar o local", category: "fornecedores", offsetDays: -180 },
        { title: "Dia do evento", offsetDays: 0 },
        { title: "Agradecer", offsetDays: 3 },
      ],
    });
    const id = ((await res.json()) as { template: { id: number } }).template.id;

    const apply = () =>
      call("owner", `${base(ev.eventA.id)}/apply-template`, {
        method: "POST",
        body: { templateId: id },
      });
    expect(await (await apply()).json()).toEqual({ created: 3 });
    const tasks = (await list()).tasks.filter((t) => t.title === "Reservar o local");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      dueOn: "2029-07-05",
      dueOffsetDays: -180,
      category: "fornecedores",
    });
    expect((await list()).tasks.find((t) => t.title === "Agradecer")?.dueOn).toBe("2030-01-04");
    await apply();
    expect((await list()).tasks.filter((t) => t.title === "Dia do evento")).toHaveLength(2);

    const listed = await call("owner", `${base(ev.eventA.id)}/templates`);
    const { templates } = (await listed.json()) as { templates: { id: number }[] };
    expect(templates.map((t) => t.id)).toContain(id);
  });

  it("modelo de outra organização → 404 e nunca aparece na lista", async () => {
    const other = await tpl("stranger", ev.orgB.id, {
      name: "Da org B",
      items: [{ title: "Segredo da B", offsetDays: -1 }],
    });
    const otherId = ((await other.json()) as { template: { id: number } }).template.id;
    const res = await call("owner", `${base(ev.eventA.id)}/apply-template`, {
      method: "POST",
      body: { templateId: otherId },
    });
    expect(res.status).toBe(404);
    expect((await list()).tasks.some((t) => t.title === "Segredo da B")).toBe(false);
    const listed = await call("owner", `${base(ev.eventA.id)}/templates`);
    const { templates } = (await listed.json()) as { templates: { id: number }[] };
    expect(templates.map((t) => t.id)).not.toContain(otherId);
  });

  it("lista só modelos do tipo do evento e os de qualquer tipo", async () => {
    await tpl("owner", ev.orgA.id, { name: "De aniversário", eventType: "birthday" });
    await tpl("owner", ev.orgA.id, { name: "Para qualquer tipo", eventType: null });
    const listed = await call("owner", `${base(ev.eventA.id)}/templates`);
    const { templates } = (await listed.json()) as { templates: { name: string }[] };
    const names = templates.map((t) => t.name);
    expect(names).toContain("Para qualquer tipo");
    expect(names).toContain("Casamento");
    expect(names).not.toContain("De aniversário");
  });

  it("apply-template valida o corpo (422)", async () => {
    const res = await call("owner", `${base(ev.eventA.id)}/apply-template`, {
      method: "POST",
      body: { templateId: "abc" },
    });
    expect(res.status).toBe(422);
  });
});
