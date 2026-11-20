import { eq, guests, inArray, invitations } from "@casamento/db";
import type { GuestList, ImportPreview, ImportResult } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReminderEmail } from "../src/reminder-email.ts";
import { buildRsvpEmail } from "../src/rsvp-email.ts";
import { eventVocabulary, inEvent } from "../src/tenancy/modules.ts";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Lados genéricos (Fase 2, D): convite, CSV, importação, listas e e-mails sem "Dani/Gustavo" fixo.

const { app, db } = testApp({ revalidate: () => Promise.resolve() });
let t!: TestEvents;
let cookie = "";
const base = () => `/api/admin/events/${t.eventA.id}`;
const api = (path: string, init: RequestInit = {}) =>
  app.request(`${base()}${path}`, {
    ...init,
    headers: { cookie, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const invitation = (side: string, label = "Convite") => ({
  label: `${label} ${Math.random().toString(36).slice(2, 7)}`,
  side,
  maxGuests: 2,
  allowPlusOne: false,
  guests: [{ name: "Fulana de Tal" }],
});

beforeAll(async () => {
  t = await createTestEvents(db);
  // Evento de 15 anos com dois grupos próprios.
  await setEventSetting(
    db,
    t.eventA.id,
    "event.sides",
    [
      { key: "familia", label: "Família" },
      { key: "amigos", label: "Amigos da Lia" },
    ],
    false,
  );
  await setEventSetting(db, t.eventA.id, "event.vocabulary", {
    hosts: "a debutante",
    sideLabel: "Grupo",
  });
  cookie = await t.login(app, "host");
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("convites com lados do evento", () => {
  it("aceita lado do evento e recusa lado que ele não tem", async () => {
    const ok = await api("/invitations", {
      method: "POST",
      body: JSON.stringify(invitation("familia")),
    });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { invitation: { side: string } }).invitation.side).toBe("familia");

    for (const side of ["dani", "gustavo", "inexistente"]) {
      const res = await api("/invitations", {
        method: "POST",
        body: JSON.stringify(invitation(side)),
      });
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { message: string } }).error.message).toContain(
        "lado",
      );
    }
  });

  it("editar um convite para um lado inexistente: 422", async () => {
    const created = await api("/invitations", {
      method: "POST",
      body: JSON.stringify(invitation("amigos")),
    });
    const id = ((await created.json()) as { invitation: { id: number } }).invitation.id;
    const bad = await api(`/invitations/${id}`, {
      method: "PUT",
      body: JSON.stringify(invitation("noivo")),
    });
    expect(bad.status).toBe(422);
    const good = await api(`/invitations/${id}`, {
      method: "PUT",
      body: JSON.stringify(invitation("familia")),
    });
    expect(good.status).toBe(200);
  });

  it("o CSV de convidados mostra o rótulo do lado", async () => {
    await api("/invitations", { method: "POST", body: JSON.stringify(invitation("amigos")) });
    const csv = await (await api("/invitations/export.csv?status=all")).text();
    expect(csv).toContain("Amigos da Lia");
    expect(csv).toContain("Família");
    expect(csv).not.toContain("Dani");
  });
});

describe("importação com lados genéricos", () => {
  const HEADER =
    "convite;lado;nome;tipo;faixa_etaria;telefone;email;acompanhante;max_pessoas;restricao_alimentar";
  const upload = (path: string, csv: string) => {
    const form = new FormData();
    form.append("file", new File([csv], "convidados.csv"));
    return app.request(`${base()}/invitations/import${path}`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });
  };
  const csv = (side: string) => `${HEADER}\nImport ${t.run};${side};Beltrano Importado;;;;;;;\n`;

  it("aceita o rótulo (sem acento e maiúsculas) ou a chave do lado", async () => {
    for (const [side, key] of [
      ["amigos da lia", "amigos"],
      ["FAMILIA", "familia"],
    ] as const) {
      const form = (await (await upload("/preview", csv(side))).json()) as {
        preview: ImportPreview;
      };
      expect(form.preview.errorCount).toBe(0);
      expect(form.preview.invitations[0]?.side).toBe(key);
    }
  });

  it("lado desconhecido: o erro lista os lados do evento", async () => {
    const { preview } = (await (await upload("/preview", csv("Dani"))).json()) as {
      preview: ImportPreview;
    };
    expect(preview.rows[0]?.errors).toEqual([
      "Lado “Dani” não reconhecido: use Família ou Amigos da Lia.",
    ]);
  });

  it("confirma e grava a chave do lado", async () => {
    const res = await upload("", csv("Amigos da Lia"));
    expect(res.status).toBe(201);
    const { result } = (await res.json()) as { result: ImportResult };
    const [row] = await db
      .select({ side: invitations.side })
      .from(invitations)
      .where(inArray(invitations.id, result.ids));
    expect(row?.side).toBe("amigos");
  });

  it("o modelo de planilha usa os lados do evento", async () => {
    const text = await (await api("/invitations/import/modelo.csv")).text();
    expect(text).toContain("Família");
    expect(text).toContain("Amigos da Lia");
    expect(text).not.toContain("Dani");
  });
});

describe("listas com lados e palavras do evento", () => {
  it("cerimonial: coluna do rótulo do tipo, rótulo do lado e um total por lado", async () => {
    // O convite do evento A confirmado entra na lista.
    await db.update(guests).set({ rsvpStatus: "confirmed" }).where(eq(guests.eventId, t.eventA.id));
    const { list } = (await (await api("/invitations/lists/cerimonial")).json()) as {
      list: GuestList;
    };
    expect(list.columns).toContain("Grupo");
    expect(list.columns).not.toContain("Lado");
    expect(list.rows.some((r) => ["Família", "Amigos da Lia"].includes(r[1]!))).toBe(true);
    const labels = list.summary.map((s) => s.label);
    expect(labels).toContain("Grupo Família");
    expect(labels).toContain("Grupo Amigos da Lia");
    expect(labels.join()).not.toMatch(/Dani|Gustavo/);
  });
});

describe("e-mails com o vocabulário do evento", () => {
  const rsvp = (eventLabel?: string) =>
    buildRsvpEmail({
      to: "x@exemplo.com",
      invitation: {
        label: "Família",
        side: "familia",
        maxGuests: 2,
        allowPlusOne: false,
        guests: [
          {
            id: 1,
            name: "Ana",
            isChild: false,
            ageRange: null,
            isPlusOne: false,
            rsvpStatus: "confirmed",
            dietaryNotes: null,
          },
        ],
        contact: { email: null, phone: null },
        deadline: "2030-01-01T23:59:59-03:00",
        isClosed: false,
      },
      token: "T",
      siteUrl: "http://x.test",
      coupleNames: "Lia",
      weddingDatetime: "2030-02-01T12:00:00-03:00",
      timezone: "America/Sao_Paulo",
      eventLabel,
    });

  it("confirmação: sem rótulo é o casamento; com rótulo, a preposição concorda", () => {
    expect(rsvp().subject).toBe("Presença confirmada no casamento");
    expect(rsvp("A festa").subject).toBe("Presença confirmada na festa");
    expect(rsvp("O chá").subject).toBe("Presença confirmada no chá");
    expect(inEvent("Reunião")).toBe("em reunião");
  });

  it("lembrete: fala do evento certo", () => {
    const m = buildReminderEmail({
      to: "x@exemplo.com",
      label: "Família",
      link: "http://x.test/c/T",
      coupleNames: "Lia",
      eventLabel: "A festa",
      weddingDatetime: "2030-02-01T12:00:00-03:00",
      timezone: "America/Sao_Paulo",
      deadline: "2030-01-01T23:59:59-03:00",
    });
    expect(m.text).toContain("para a festa");
    expect(m.text).not.toContain("casamento");
  });

  it("o vocabulário do evento vem das configurações (tipo + palavras trocadas)", async () => {
    const v = await eventVocabulary(t.eventA, db);
    expect(v.hosts).toBe("a debutante");
    expect(v.eventLabel).toBe("O casamento"); // o tipo do evento de teste é casamento
  });
});
