import {
  eq,
  guests,
  inArray,
  invitations,
  newPublicId,
  rsvpLogs,
  type Database,
} from "@casamento/db";
import { ApiError, Invitation, LookupResponse, RsvpResponse } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Usa o banco de DATABASE_URL já migrado e com seed. Cria os próprios convites (nomes
// únicos) e remove tudo no fim; não mexe nos convites do seed.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(message) {
    sent.push(message);
    return Promise.resolve();
  },
};

const { app, db } = testApp({ mailer });
const created: number[] = [];
let n = 0;
const ip = () => `10.0.0.${++n}`;

const json = { "Content-Type": "application/json" };
const writeHeaders = (clientIp = ip()) => ({
  ...json,
  "X-Web-Key": TEST_WEB_KEY,
  "X-Client-Ip": clientIp,
});

async function makeInvitation(
  database: Database,
  opts: {
    label: string;
    names: { name: string; isChild?: boolean }[];
    maxGuests?: number;
    allowPlusOne?: boolean;
    contactEmail?: string;
  },
) {
  const token = newPublicId();
  const [res] = await database.insert(invitations).values({
    token,
    label: opts.label,
    side: "dani",
    maxGuests: opts.maxGuests ?? opts.names.length,
    allowPlusOne: opts.allowPlusOne ?? false,
    contactEmail: opts.contactEmail ?? null,
  });
  created.push(res.insertId);
  await database.insert(guests).values(
    opts.names.map((g) => ({
      invitationId: res.insertId,
      name: g.name,
      isChild: g.isChild ?? false,
    })),
  );
  return token;
}

const getInvitation = async (token: string) => {
  const res = await app.request(`/api/invitations/${token}`);
  return { res, body: res.status === 200 ? Invitation.parse(await res.json()) : null };
};

const put = (token: string, body: unknown, headers: Record<string, string> = writeHeaders()) =>
  app.request(`/api/invitations/${token}/rsvp`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

let quintanilha: string;
let pontes: string;
let solo: string;

beforeAll(async () => {
  quintanilha = await makeInvitation(db, {
    label: "Família Quintanilha",
    names: [{ name: "Zélia Quintanilha" }, { name: "Ruy Quintanilha" }],
    contactEmail: "zelia@exemplo.com",
  });
  pontes = await makeInvitation(db, {
    label: "Zélia Pontes",
    names: [{ name: "Zélia Pontes" }],
  });
  solo = await makeInvitation(db, {
    label: "Odete Valadares",
    names: [{ name: "Odete Valadares" }],
    maxGuests: 2,
    allowPlusOne: true,
  });
});

afterAll(async () => {
  if (created.length > 0) await db.delete(invitations).where(inArray(invitations.id, created));
  await db.$client.end();
});

describe("GET /api/invitations/{token}", () => {
  it("devolve o convite e os convidados sem expor o token nem IDs de outros grupos", async () => {
    const { res, body } = await getInvitation(quintanilha);
    expect(res.status).toBe(200);
    expect(body?.label).toBe("Família Quintanilha");
    expect(body?.guests.map((g) => g.name)).toEqual(["Zélia Quintanilha", "Ruy Quintanilha"]);
    expect(body?.guests.every((g) => g.rsvpStatus === "pending")).toBe(true);
    expect(body?.isClosed).toBe(false);
    expect(body?.contact.email).toBe("zelia@exemplo.com");
    expect(JSON.stringify(body)).not.toContain(quintanilha);
  });

  it("responde 404 no formato ApiError para token desconhecido", async () => {
    const res = await app.request("/api/invitations/01ZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error.code).toBe("not_found");
  });
});

describe("PUT /api/invitations/{token}/rsvp", () => {
  it("exige X-Web-Key", async () => {
    const res = await put(quintanilha, { guests: [] }, { ...json });
    expect(res.status).toBe(401);
  });

  it("confirma, altera e recusa, registrando o log e enviando e-mail", async () => {
    const { body: before } = await getInvitation(quintanilha);
    const [a, b] = before!.guests;

    const confirm = await put(quintanilha, {
      guests: [
        { id: a!.id, attending: true, dietaryNotes: "Sem glúten" },
        { id: b!.id, attending: false },
      ],
    });
    expect(confirm.status).toBe(200);
    const confirmed = RsvpResponse.parse(await confirm.json()).invitation;
    expect(confirmed.guests.map((g) => g.rsvpStatus)).toEqual(["confirmed", "declined"]);
    expect(confirmed.guests[0]?.dietaryNotes).toBe("Sem glúten");

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.to).toBe("zelia@exemplo.com");
    expect(sent[0]?.subject).toBe("Presença confirmada no casamento");
    expect(sent[0]?.text).toContain("Confirmados: Zélia Quintanilha");
    expect(sent[0]?.text).toContain("Não poderão ir: Ruy Quintanilha");
    expect(sent[0]?.text).toContain(`/c/${quintanilha}`);
    expect(sent[0]?.html).toContain("<ul>");

    // Alterar: agora os dois vão.
    const change = await put(quintanilha, {
      guests: [
        { id: a!.id, attending: true },
        { id: b!.id, attending: true },
      ],
    });
    expect(change.status).toBe(200);
    const { body: changed } = await getInvitation(quintanilha);
    expect(changed?.guests.map((g) => g.rsvpStatus)).toEqual(["confirmed", "confirmed"]);
    expect(changed?.guests[0]?.dietaryNotes).toBeNull();

    // Recusar tudo.
    const decline = await put(quintanilha, {
      guests: [
        { id: a!.id, attending: false },
        { id: b!.id, attending: false },
      ],
    });
    expect(decline.status).toBe(200);
    const { body: declined } = await getInvitation(quintanilha);
    expect(declined?.guests.map((g) => g.rsvpStatus)).toEqual(["declined", "declined"]);

    const [inv] = await db.select().from(invitations).where(eq(invitations.token, quintanilha));
    const logs = await db.select().from(rsvpLogs).where(eq(rsvpLogs.invitationId, inv!.id));
    expect(logs).toHaveLength(3);
    expect(logs[0]?.ip).toMatch(/^10\.0\.0\./);
    expect(JSON.stringify(logs[0]?.payload)).toContain("Sem glúten");
  });

  it("envia exatamente um e-mail por RSVP bem-sucedido", async () => {
    const token = await makeInvitation(db, {
      label: "Heloísa Tavares",
      names: [{ name: "Heloísa Tavares" }],
      contactEmail: "heloisa@exemplo.com",
    });
    const { body } = await getInvitation(token);
    const before = sent.length;
    const res = await put(token, { guests: [{ id: body!.guests[0]!.id, attending: true }] });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(before));
    // Dá tempo de um eventual segundo envio aparecer antes de contar.
    await new Promise((r) => setTimeout(r, 100));
    const mine = sent.slice(before).filter((m) => m.to === "heloisa@exemplo.com");
    expect(mine).toHaveLength(1);
  });

  it("recusa convidado de outro convite e resposta incompleta", async () => {
    const { body: other } = await getInvitation(pontes);
    const { body: mine } = await getInvitation(quintanilha);
    const foreign = await put(quintanilha, {
      guests: [
        { id: mine!.guests[0]!.id, attending: true },
        { id: other!.guests[0]!.id, attending: true },
      ],
    });
    expect(foreign.status).toBe(422);
    const partial = await put(quintanilha, {
      guests: [{ id: mine!.guests[0]!.id, attending: true }],
    });
    expect(partial.status).toBe(422);
    expect(ApiError.parse(await partial.json()).error.code).toBe("invalid_request");
  });

  it("aceita acompanhante dentro do limite e remove depois", async () => {
    const { body: before } = await getInvitation(solo);
    const id = before!.guests[0]!.id;
    const ok = await put(solo, {
      guests: [{ id, attending: true }],
      plusOneName: "Valter Souza",
      contact: { email: "odete@exemplo.com", phone: "(11) 99999-0000" },
    });
    expect(ok.status).toBe(200);
    const withPlusOne = RsvpResponse.parse(await ok.json()).invitation;
    expect(withPlusOne.guests.map((g) => [g.name, g.isPlusOne, g.rsvpStatus])).toEqual([
      ["Odete Valadares", false, "confirmed"],
      ["Valter Souza", true, "confirmed"],
    ]);
    expect(withPlusOne.contact).toEqual({ email: "odete@exemplo.com", phone: "(11) 99999-0000" });

    const removed = await put(solo, { guests: [{ id, attending: true }], plusOneName: null });
    expect(RsvpResponse.parse(await removed.json()).invitation.guests).toHaveLength(1);
  });

  it("recusa acompanhante em convite que não permite e acima do máximo", async () => {
    const { body: noPlus } = await getInvitation(pontes);
    const denied = await put(pontes, {
      guests: [{ id: noPlus!.guests[0]!.id, attending: true }],
      plusOneName: "Alguém Qualquer",
    });
    expect(denied.status).toBe(422);

    const { body: full } = await getInvitation(quintanilha);
    const over = await put(quintanilha, {
      guests: full!.guests.map((g) => ({ id: g.id, attending: true })),
      plusOneName: "Alguém Qualquer",
    });
    expect(over.status).toBe(422);
  });

  it("finge sucesso e não grava quando o honeypot vem preenchido", async () => {
    const { body: before } = await getInvitation(pontes);
    const res = await put(pontes, {
      guests: [{ id: before!.guests[0]!.id, attending: true }],
      website: "http://spam.example",
    });
    expect(res.status).toBe(200);
    expect(RsvpResponse.parse(await res.json()).ok).toBe(true);
    const { body: after } = await getInvitation(pontes);
    expect(after?.guests[0]?.rsvpStatus).toBe("pending");
  });

  it("recusa com 409 rsvp_closed depois do prazo", async () => {
    const late = testApp({ mailer, now: () => new Date("2027-04-16T12:00:00-03:00") });
    try {
      const { body } = await getInvitation(pontes);
      const res = await late.app.request(`/api/invitations/${pontes}/rsvp`, {
        method: "PUT",
        headers: writeHeaders(),
        body: JSON.stringify({ guests: [{ id: body!.guests[0]!.id, attending: true }] }),
      });
      expect(res.status).toBe(409);
      const err = ApiError.parse(await res.json()).error;
      expect(err.code).toBe("rsvp_closed");
      expect(err.message).toContain("contato@exemplo.com");

      const view = await late.app.request(`/api/invitations/${pontes}`);
      expect(Invitation.parse(await view.json()).isClosed).toBe(true);
    } finally {
      await late.db.$client.end();
    }
  });

  it("limita a 10 tentativas por minuto por IP", async () => {
    const same = writeHeaders("10.9.9.9");
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await put(pontes, { guests: [] }, same)).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/invitations/lookup", () => {
  const lookup = (body: unknown, headers: Record<string, string> = writeHeaders()) =>
    app.request("/api/invitations/lookup", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

  it("exige X-Web-Key", async () => {
    const res = await lookup({ firstName: "Zélia", lastName: "Quintanilha" }, { ...json });
    expect(res.status).toBe(401);
  });

  it("acha só o próprio grupo, sem diferenciar acentos nem caixa", async () => {
    const res = await lookup({ firstName: "  ZELIA ", lastName: "quintanilha" });
    expect(res.status).toBe(200);
    const body = LookupResponse.parse(await res.json());
    expect(body.matches).toEqual([{ token: quintanilha, label: "Família Quintanilha" }]);
    expect(JSON.stringify(body)).not.toContain("Ruy");
  });

  it("exige primeiro nome e sobrenome juntos", async () => {
    const onlyFirst = await lookup({ firstName: "Zélia", lastName: "Inexistente" });
    expect(onlyFirst.status).toBe(404);
    expect(ApiError.parse(await onlyFirst.json()).error.code).toBe("not_found");
    const onlyLast = await lookup({ firstName: "Fulano", lastName: "Quintanilha" });
    expect(onlyLast.status).toBe(404);
  });

  it("trata o honeypot como sem resultado", async () => {
    const res = await lookup({ firstName: "Zélia", lastName: "Quintanilha", website: "x" });
    expect(res.status).toBe(404);
  });

  it("devolve 429 com Retry-After na 6ª tentativa do mesmo IP", async () => {
    const same = writeHeaders("10.8.8.8");
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await lookup({ firstName: "Odete", lastName: "Valadares" }, same);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(ApiError.parse(await last?.json()).error.code).toBe("too_many_requests");
    // Outro IP não é afetado.
    const other = await lookup({ firstName: "Odete", lastName: "Valadares" });
    expect(other.status).toBe(200);
  });
});
