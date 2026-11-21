import { eq, guests, invitations, newPublicId } from "@casamento/db";
import type { GuestLimitStatus } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { notifyGuestOverage } from "../src/plans/guest-overage.ts";
import {
  createTestEvents,
  setEventSetting,
  testApp,
  TEST_WEB_KEY,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";
import { clearSubscription, createPlan, dropPlans, setSubscription } from "./plan-fixtures.ts";

// Fase 7, frente D: acompanhantes passam do limite do plano; o RSVP nunca é recusado, a equipe
// recebe um e-mail por estouro e o painel mostra o aviso.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(m) {
    sent.push(m);
    return Promise.resolve();
  },
};
const { app, db, env } = testApp({ mailer });
let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const run = Date.now().toString(36);
const planCode = `f7d-limite-${run}`;
let n = 0;

const overageMails = () => sent.filter((m) => m.subject.includes(ev.eventA.name));

async function invitation(label: string) {
  const token = newPublicId();
  const [res] = await db.insert(invitations).values({
    eventId: ev.eventA.id,
    token,
    label,
    side: "dani",
    maxGuests: 2,
    allowPlusOne: true,
  });
  const [g] = await db.insert(guests).values({
    eventId: ev.eventA.id,
    invitationId: res.insertId,
    name: `${label} convidado`,
  });
  return { token, id: res.insertId, guestId: g.insertId };
}

async function rsvp(inv: { token: string; guestId: number }, plusOneName?: string) {
  n += 1;
  return app.request(`/api/e/${ev.eventA.slug}/invitations/${inv.token}/rsvp`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Web-Key": TEST_WEB_KEY,
      "X-Client-Ip": `10.7.0.${n}`,
    },
    body: JSON.stringify({
      guests: [{ id: inv.guestId, attending: true }],
      ...(plusOneName ? { plusOneName } : {}),
      consent: true,
    }),
  });
}

const limitStatus = async (kind: TestUserKind = "owner", eventId = ev.eventA.id) => {
  const res = await app.request(`/api/admin/events/${eventId}/guest-limit`, {
    headers: { cookie: cookies[kind] },
  });
  return { status: res.status, body: (await res.json()) as GuestLimitStatus };
};

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  await setEventSetting(db, ev.eventA.id, "wedding.datetime", "2030-01-01T18:00:00.000Z");
  await setEventSetting(db, ev.eventA.id, "rsvp.deadline", "2029-12-01T23:00:00.000Z");
  await createPlan(db, { code: planCode, limits: { guestsPerEvent: 2 } });
});

afterAll(async () => {
  await clearSubscription(db, ev.orgA.id);
  await ev.cleanup();
  await dropPlans(db, [planCode]);
  await db.$client.end();
});

describe("sem assinatura ou com plano interno", () => {
  it("não há limite: nada de aviso nem e-mail", async () => {
    const a = await invitation("Sem plano A");
    const b = await invitation("Sem plano B");
    expect((await rsvp(a, "Acompanhante A")).status).toBe(200);
    expect((await rsvp(b, "Acompanhante B")).status).toBe(200);
    expect(overageMails()).toHaveLength(0);
    expect((await limitStatus()).body).toMatchObject({ limit: null, over: false });
    await db.delete(invitations).where(eq(invitations.id, a.id));
    await db.delete(invitations).where(eq(invitations.id, b.id));
  });
});

describe("plano com limite de 2 pessoas", () => {
  const made: Awaited<ReturnType<typeof invitation>>[] = [];

  beforeAll(async () => {
    await setSubscription(db, ev.orgA.id, planCode);
  });

  it("dentro do limite: sem aviso", async () => {
    made.push(await invitation("Convite 1"));
    expect((await rsvp(made[0]!, "Acompanhante 1")).status).toBe(200); // 2 pessoas
    expect(overageMails()).toHaveLength(0);
    expect((await limitStatus()).body).toMatchObject({ used: 2, limit: 2, over: false });
  });

  it("passou do limite: o RSVP é aceito (200), e-mail para a equipe e aviso no painel", async () => {
    made.push(await invitation("Convite 2")); // 3 pessoas, já acima
    const res = await rsvp(made[1]!, "Acompanhante 2"); // 4 pessoas
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const mails = overageMails();
    expect(mails).toHaveLength(2); // anfitrião e dono
    expect(mails.map((m) => m.to).sort()).toEqual(
      [ev.users.host.email, ev.users.owner.email].sort(),
    );
    expect(mails[0]!.text).toContain("4 pessoas");
    expect(mails[0]!.text).toContain("o plano permite 2");
    expect(mails[0]!.text).toContain(`/painel/#/e/${ev.eventA.id}`);

    const st = await limitStatus("host");
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ used: 4, limit: 2, over: true });
    expect(st.body.notifiedAt).not.toBeNull();
  });

  it("outro RSVP no mesmo estouro não repete o e-mail", async () => {
    made.push(await invitation("Convite 3"));
    expect((await rsvp(made[2]!, "Acompanhante 3")).status).toBe(200);
    expect(overageMails()).toHaveLength(2);
    // Reenviar o mesmo RSVP também não.
    expect((await rsvp(made[2]!, "Acompanhante 3")).status).toBe(200);
    expect(overageMails()).toHaveLength(2);
  });

  it("volta ao limite e estoura de novo: avisa de novo", async () => {
    await db.delete(invitations).where(eq(invitations.id, made[1]!.id));
    await db.delete(invitations).where(eq(invitations.id, made[2]!.id));
    await notifyGuestOverage(ev.eventA, { env, db, mailer }); // 2 pessoas: limpa a marca
    expect((await limitStatus()).body).toMatchObject({ used: 2, over: false, notifiedAt: null });

    const again = await invitation("Convite 4");
    expect((await rsvp(again, "Acompanhante 4")).status).toBe(200); // 4 pessoas
    expect(overageMails()).toHaveLength(4);
  });

  it("falha no e-mail não derruba o RSVP", async () => {
    const failing: Mailer = { send: () => Promise.reject(new Error("SMTP fora do ar")) };
    await notifyGuestOverage(ev.eventA, { env, db, mailer: failing });
  });

  it("isolamento: o outro evento não vê o estado, e quem não participa recebe 404", async () => {
    expect((await limitStatus("stranger")).status).toBe(404);
    const other = await limitStatus("stranger", ev.eventB.id);
    expect(other.status).toBe(200);
    expect(other.body.used).toBe(0);
    expect(other.body.notifiedAt).toBeNull();
  });

  it("sem sessão: 401", async () => {
    const res = await app.request(`/api/admin/events/${ev.eventA.id}/guest-limit`);
    expect(res.status).toBe(401);
  });
});
