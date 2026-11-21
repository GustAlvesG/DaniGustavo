import {
  eq,
  guests,
  inArray,
  invitations,
  newPublicId,
  whatsappSends,
  whatsappTemplates,
} from "@casamento/db";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  waLink,
  waPhone,
  type WhatsappQueueResponse,
  type WhatsappTemplatesResponse,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestEvents,
  setEventSetting,
  testApp,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

// Fase 7, frente D: WhatsApp por links prontos (modelos, fila, marcação de enviado).

const { app, db } = testApp();
let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const ids: Record<string, number> = {};
const otherIds: number[] = [];

const base = (eventId: number) => `/api/admin/events/${eventId}/whatsapp`;
const call = (kind: TestUserKind, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const queue = async (kind = "invite", filter = "all", who: TestUserKind = "owner") => {
  const res = await call(who, `${base(ev.eventA.id)}/queue?kind=${kind}&filter=${filter}`);
  expect(res.status).toBe(200);
  return (await res.json()) as WhatsappQueueResponse;
};
const item = (q: WhatsappQueueResponse, key: string) =>
  q.items.find((i) => i.invitationId === ids[key])!;
const putTemplate = (kind: string, body: string) =>
  call("owner", `${base(ev.eventA.id)}/templates/${kind}`, { method: "PUT", body: { body } });

async function invite(
  eventId: number,
  label: string,
  opts: { phone?: string; guestPhone?: string; status?: "pending" | "confirmed" | "declined" },
) {
  const [res] = await db.insert(invitations).values({
    eventId,
    token: newPublicId(),
    label,
    side: "dani",
    maxGuests: 2,
    contactPhone: opts.phone ?? null,
  });
  await db.insert(guests).values({
    eventId,
    invitationId: res.insertId,
    name: `${label} pessoa`,
    phone: opts.guestPhone ?? null,
    rsvpStatus: opts.status ?? "pending",
  });
  return res.insertId;
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  await setEventSetting(db, ev.eventA.id, "wedding.datetime", "2030-01-01T18:00:00.000Z");
  await setEventSetting(db, ev.eventA.id, "rsvp.deadline", "2029-12-01T23:00:00.000Z");
  ids.fmt = await invite(ev.eventA.id, "Família Silva", { phone: "(11) 98765-4321" });
  ids.guestPhone = await invite(ev.eventA.id, "Tia Rita", { guestPhone: "+55 21 91234-5678" });
  ids.noPhone = await invite(ev.eventA.id, "Sem Telefone", {});
  ids.bad = await invite(ev.eventA.id, "Telefone Ruim", { phone: "123" });
  ids.yes = await invite(ev.eventA.id, "Confirmados", {
    phone: "11911112222",
    status: "confirmed",
  });
  ids.no = await invite(ev.eventA.id, "Recusaram", { phone: "11933334444", status: "declined" });
  otherIds.push(await invite(ev.eventB.id, "Convite do outro evento", { phone: "11900000000" }));
});

afterAll(async () => {
  await db
    .delete(whatsappTemplates)
    .where(inArray(whatsappTemplates.eventId, [ev.eventA.id, ev.eventB.id]));
  await ev.cleanup();
  await db.$client.end();
});

describe("telefone e link wa.me", () => {
  it("normaliza para DDI 55 e rejeita o inválido", () => {
    expect(waPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(waPhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(waPhone("011987654321")).toBe("5511987654321");
    expect(waPhone("1133334444")).toBe("551133334444");
    expect(waPhone("0055 11 98765-4321")).toBe("5511987654321");
    expect(waPhone("123")).toBeNull();
    expect(waPhone("")).toBeNull();
    expect(waPhone(null)).toBeNull();
    expect(waPhone("+1 202 555 0147")).toBe("12025550147");
    expect(waPhone("+1 202")).toBeNull();
  });

  it("monta o link com a mensagem codificada", () => {
    expect(waLink("5511987654321", "Olá, vocês & nós!")).toBe(
      "https://wa.me/5511987654321?text=Ol%C3%A1%2C%20voc%C3%AAs%20%26%20n%C3%B3s!",
    );
  });
});

describe("modelos", () => {
  it("sem linha, devolve o texto padrão de cada tipo", async () => {
    const res = await call("owner", `${base(ev.eventA.id)}/templates`);
    const body = (await res.json()) as WhatsappTemplatesResponse;
    expect(body.templates.map((t) => t.kind)).toEqual([
      "invite",
      "rsvp_reminder",
      "thanks",
      "day_notice",
    ]);
    expect(body.templates.every((t) => t.isDefault)).toBe(true);
    expect(body.templates[0]!.body).toBe(DEFAULT_WHATSAPP_TEMPLATES.invite);
    expect(body.variables).toContain("{link}");
  });

  it("grava, e o texto vazio volta ao padrão", async () => {
    const saved = (await (await putTemplate("thanks", "Valeu, {convite}!")).json()) as {
      template: { body: string; isDefault: boolean };
    };
    expect(saved.template).toMatchObject({ body: "Valeu, {convite}!", isDefault: false });
    const reset = (await (await putTemplate("thanks", "   ")).json()) as {
      template: { body: string; isDefault: boolean };
    };
    expect(reset.template).toMatchObject({
      body: DEFAULT_WHATSAPP_TEMPLATES.thanks,
      isDefault: true,
    });
  });

  it("tipo desconhecido 404 e corpo longo 422", async () => {
    expect((await putTemplate("xx", "a")).status).toBe(404);
    expect((await putTemplate("invite", "a".repeat(1001))).status).toBe(422);
  });

  it("o modelo é do evento: não vaza para o outro", async () => {
    await putTemplate("invite", "Modelo da A: {convite}");
    const own = await queue("invite");
    expect(item(own, "fmt").message).toBe("Modelo da A: Família Silva");
    const b = await call("stranger", `${base(ev.eventB.id)}/templates`);
    const bodyB = (await b.json()) as WhatsappTemplatesResponse;
    expect(bodyB.templates[0]!.isDefault).toBe(true);
    await putTemplate("invite", "");
  });
});

describe("fila", () => {
  it("monta a mensagem com as variáveis e o link wa.me", async () => {
    const q = await queue("invite");
    const it = item(q, "fmt");
    expect(it.phone).toBe("5511987654321");
    expect(it.message).toContain("Família Silva");
    expect(it.message).toContain(ev.eventA.name);
    expect(it.message).toContain("1 de janeiro de 2030");
    expect(it.message).toMatch(/\/c\/[0-9A-Z]{26}/);
    expect(it.waUrl).toBe(waLink("5511987654321", it.message));
  });

  it("prazo do RSVP e telefone do convidado quando o convite não tem", async () => {
    const q = await queue("rsvp_reminder");
    expect(item(q, "fmt").message).toContain("1 de dezembro de 2029");
    expect(item(q, "guestPhone").phone).toBe("5521912345678");
  });

  it("sem telefone válido: waUrl nulo, contado em withoutPhone", async () => {
    const q = await queue("invite");
    expect(item(q, "noPhone")).toMatchObject({ phone: null, waUrl: null });
    expect(item(q, "bad")).toMatchObject({ phone: null, waUrl: null });
    expect(q.withoutPhone).toBe(2);
  });

  it("filtros: sem resposta e confirmados", async () => {
    const pending = (await queue("invite", "pending_rsvp")).items.map((i) => i.invitationId);
    expect(pending).toContain(ids.fmt);
    expect(pending).not.toContain(ids.yes);
    expect(pending).not.toContain(ids.no);
    const confirmed = (await queue("invite", "confirmed")).items.map((i) => i.invitationId);
    expect(confirmed).toEqual([ids.yes]);
  });

  it("nunca mostra convite de outro evento", async () => {
    const all = (await queue("invite", "all")).items.map((i) => i.invitationId);
    expect(all).not.toContain(otherIds[0]);
  });

  it("tipo e filtro inválidos dão 422", async () => {
    expect((await call("owner", `${base(ev.eventA.id)}/queue?kind=zz`)).status).toBe(422);
    expect((await call("owner", `${base(ev.eventA.id)}/queue?filter=zz`)).status).toBe(422);
  });
});

describe("marcar enviado", () => {
  it("marca, tira da fila de não enviados e desfaz", async () => {
    const mark = await call("owner", `${base(ev.eventA.id)}/sends`, {
      method: "POST",
      body: { kind: "invite", invitationIds: [ids.fmt!, ids.yes!] },
    });
    expect(mark.status).toBe(201);
    expect(await mark.json()).toEqual({ marked: 2 });

    const notSent = (await queue("invite", "not_sent")).items.map((i) => i.invitationId);
    expect(notSent).not.toContain(ids.fmt);
    expect(notSent).toContain(ids.guestPhone);
    // O tipo é independente: o lembrete ainda não foi enviado.
    expect((await queue("rsvp_reminder", "not_sent")).items.map((i) => i.invitationId)).toContain(
      ids.fmt,
    );

    const sent = item(await queue("invite"), "fmt");
    expect(sent.sends).toBe(1);
    expect(sent.lastSentAt).not.toBeNull();

    const undo = await call("owner", `${base(ev.eventA.id)}/sends/${sent.lastSendId}`, {
      method: "DELETE",
    });
    expect(undo.status).toBe(200);
    expect((await queue("invite", "not_sent")).items.map((i) => i.invitationId)).toContain(ids.fmt);
    const again = await call("owner", `${base(ev.eventA.id)}/sends/${sent.lastSendId}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(404);
  });

  it("convite de outro evento: 404 e nada gravado", async () => {
    const res = await call("owner", `${base(ev.eventA.id)}/sends`, {
      method: "POST",
      body: { kind: "invite", invitationIds: [ids.fmt!, otherIds[0]!] },
    });
    expect(res.status).toBe(404);
    const rows = await db
      .select()
      .from(whatsappSends)
      .where(inArray(whatsappSends.invitationId, [ids.fmt!, otherIds[0]!]));
    expect(rows).toHaveLength(0);
  });

  it("não desfaz a marcação de outro evento", async () => {
    const [res] = await db
      .insert(whatsappSends)
      .values({ eventId: ev.eventB.id, invitationId: otherIds[0]!, kind: "invite" });
    const del = await call("owner", `${base(ev.eventA.id)}/sends/${res.insertId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(404);
    const rows = await db.select().from(whatsappSends).where(eq(whatsappSends.id, res.insertId));
    expect(rows).toHaveLength(1);
  });

  it("corpo inválido: 422", async () => {
    const res = await call("owner", `${base(ev.eventA.id)}/sends`, {
      method: "POST",
      body: { kind: "invite", invitationIds: [] },
    });
    expect(res.status).toBe(422);
  });
});

describe("permissões e isolamento", () => {
  const hostPerms = (deny: string[]) =>
    call("owner", `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`, {
      method: "PUT",
      body: { deny },
    });

  it("quem não participa do evento recebe 404", async () => {
    expect((await call("stranger", `${base(ev.eventA.id)}/templates`)).status).toBe(404);
    expect((await call("stranger", `${base(ev.eventA.id)}/queue`)).status).toBe(404);
  });

  it("anfitrião usa, e a organização pode negar whatsapp.send", async () => {
    expect((await call("host", `${base(ev.eventA.id)}/queue`)).status).toBe(200);
    expect((await hostPerms(["whatsapp.send"])).status).toBe(200);
    expect((await call("host", `${base(ev.eventA.id)}/queue`)).status).toBe(403);
    const send = await call("host", `${base(ev.eventA.id)}/sends`, {
      method: "POST",
      body: { kind: "invite", invitationIds: [ids.fmt!] },
    });
    expect(send.status).toBe(403);
    expect((await call("host", `${base(ev.eventA.id)}/templates`)).status).toBe(403);
    // O dono segue usando.
    expect((await call("owner", `${base(ev.eventA.id)}/queue`)).status).toBe(200);
    await hostPerms([]);
  });

  it("sem sessão: 401", async () => {
    const res = await app.request(`${base(ev.eventA.id)}/queue`);
    expect(res.status).toBe(401);
  });
});
