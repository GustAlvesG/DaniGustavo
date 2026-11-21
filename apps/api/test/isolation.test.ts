import {
  and,
  eq,
  events,
  eventSettings,
  giftOrders,
  gifts,
  guests,
  invitations,
  LEGACY_EVENT_ID,
  messages,
  newPublicId,
  payments,
  rsvpLogs,
  webhookEvents,
} from "@casamento/db";
import {
  GiftsResponse,
  Invitation,
  LookupResponse,
  OrderView,
  SiteContent,
  WallResponse,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createSimulatedProvider } from "../src/payments/index.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import {
  createTestEvents,
  legacySettingsBase,
  TEST_WEB_KEY,
  testApp,
  type TestEvents,
} from "./helpers.ts";

// Rotas públicas por evento (/api/e/:slug/*): nada de B aparece em A, e o que é de B usado em A
// (slug de presente, token de convite, publicId de pedido) é 404. As rotas antigas seguem
// como apelido do evento 1.

const mailer: Mailer = { send: () => Promise.resolve() };
const simulated = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const hookEvents = new Set<string>();
const provider = {
  ...simulated,
  approve(id: string) {
    const hook = simulated.approve(id);
    hookEvents.add((hook.body as { id: string }).id);
    return hook;
  },
  // Cartão hospedado de mentira, só para a rota card-checkout responder.
  createCardCheckout: (input: { publicId: string; amountCents: number }) =>
    Promise.resolve({
      providerOrderId: `cc_${input.publicId}`,
      externalReference: input.publicId,
      status: "pending" as const,
      statusDetail: "pending",
      method: "card" as const,
      paymentId: null,
      amountCents: input.amountCents,
      pix: null,
      checkoutUrl: `https://pagamento.exemplo/${input.publicId}`,
      raw: {},
    }),
};
const { app, db } = testApp({ mailer, provider });

let t: TestEvents;
let A: EventCtx;
let B: EventCtx;
let legacySlug: string;
const SAME_SLUG = "mesmo-slug";
const giftIds: Record<"sameA" | "sameB" | "onlyB", number> = { sameA: 0, sameB: 0, onlyB: 0 };
const tokens = { a: "", b: "" };
const guestNames = { a: "", b: "" };

let n = 0;
const write = () => ({
  "Content-Type": "application/json",
  "X-Web-Key": TEST_WEB_KEY,
  "X-Client-Ip": `198.51.100.${(++n % 250) + 1}`,
});
const e = (ev: EventCtx, path: string) => `/api/e/${ev.slug}${path}`;
const buyer = {
  buyerName: "Ana Isolada",
  buyerEmail: "ana.isolada@exemplo.com",
  message: "Parabéns!",
  showOnWall: true,
};
const createOrder = (ev: EventCtx, giftSlug: string) =>
  app.request(e(ev, "/orders"), {
    method: "POST",
    headers: write(),
    body: JSON.stringify({ ...buyer, giftSlug, quantity: 1, method: "pix" }),
  });

async function quotaSold(id: number) {
  const [g] = await db.select().from(gifts).where(eq(gifts.id, id));
  return g!.quotaSold;
}

beforeAll(async () => {
  t = await createTestEvents(db, { paymentReceiver: "platform" });
  A = t.eventA;
  B = t.eventB;
  const [legacy] = await db.select().from(events).where(eq(events.id, LEGACY_EVENT_ID));
  legacySlug = legacy!.slug;

  // Configurações do evento 1 copiadas para A e B, com nome e prazo próprios.
  const base = await legacySettingsBase(db);
  for (const ev of [A, B]) {
    await db.insert(eventSettings).values(
      base.map((s) => ({
        eventId: ev.id,
        key: s.key,
        isPublic: s.isPublic,
        value:
          s.key === "couple.names"
            ? `Casal ${ev.slug}`
            : s.key === "rsvp.deadline"
              ? "2099-12-31T23:59:59-03:00"
              : s.value,
      })),
    );
  }

  const gift = async (ev: EventCtx, slug: string, priceCents: number) => {
    const [res] = await db.insert(gifts).values({
      eventId: ev.id,
      slug,
      title: `Presente ${slug} de ${ev.slug}`,
      priceCents,
      quotaTotal: 3,
      category: "casa",
      tileDesign: "flor",
    });
    return res.insertId;
  };
  giftIds.sameA = await gift(A, SAME_SLUG, 1000);
  giftIds.sameB = await gift(B, SAME_SLUG, 2000);
  giftIds.onlyB = await gift(B, "so-de-b", 3000);

  const invite = async (ev: EventCtx, name: string) => {
    const token = newPublicId();
    const [res] = await db.insert(invitations).values({
      eventId: ev.id,
      token,
      label: `Família ${name}`,
      side: "dani",
      maxGuests: 1,
    });
    await db.insert(guests).values({ eventId: ev.id, invitationId: res.insertId, name });
    return token;
  };
  guestNames.a = `Fulano Isoladoa${t.run}`;
  guestNames.b = `Beltrano Isoladob${t.run}`;
  tokens.a = await invite(A, guestNames.a);
  tokens.b = await invite(B, guestNames.b);

  await db.insert(messages).values([
    { eventId: A.id, author: "Autor A", body: `Recado de A ${t.run}`, approved: true },
    { eventId: B.id, author: "Autor B", body: `Recado de B ${t.run}`, approved: true },
  ]);
});

afterAll(async () => {
  for (const id of hookEvents) await db.delete(webhookEvents).where(eq(webhookEvents.eventId, id));
  await t.cleanup();
  await db.$client.end();
});

describe("/api/e/:slug resolve o evento", () => {
  it("slug inexistente ou evento em rascunho → 404", async () => {
    expect((await app.request(`/api/e/nao-existe-${t.run}/site`)).status).toBe(404);
    expect((await app.request(e(t.draftA, "/site"))).status).toBe(404);
    expect((await app.request(e(t.draftA, "/gifts"))).status).toBe(404);
  });

  it("site: cada evento lê as próprias configurações", async () => {
    const a = SiteContent.parse(await (await app.request(e(A, "/site"))).json());
    const b = SiteContent.parse(await (await app.request(e(B, "/site"))).json());
    expect(a.couple.names).toBe(`Casal ${A.slug}`);
    expect(b.couple.names).toBe(`Casal ${B.slug}`);
  });
});

describe("presentes", () => {
  it("a lista de A só tem os presentes de A (mesmo slug, preço de A)", async () => {
    const res = await app.request(e(A, "/gifts"));
    expect(res.status).toBe(200);
    const body = GiftsResponse.parse(await res.json());
    expect(body.gifts.map((g) => g.slug)).toEqual([SAME_SLUG]);
    expect(body.gifts[0]!.priceCents).toBe(1000);

    const bBody = GiftsResponse.parse(await (await app.request(e(B, "/gifts"))).json());
    expect(bBody.gifts.map((g) => g.slug).sort()).toEqual([SAME_SLUG, "so-de-b"]);
    expect(bBody.gifts.find((g) => g.slug === SAME_SLUG)!.priceCents).toBe(2000);
  });
});

describe("pedidos", () => {
  let publicIdA = "";

  it("presente que só existe em B não pode ser pedido em A (404)", async () => {
    const res = await createOrder(A, "so-de-b");
    expect(res.status).toBe(404);
    expect(await quotaSold(giftIds.onlyB)).toBe(0);
  });

  it("mesmo slug: o pedido em A reserva o presente de A, não o de B", async () => {
    const res = await createOrder(A, SAME_SLUG);
    expect(res.status).toBe(201);
    const order = OrderView.parse(await res.json());
    publicIdA = order.publicId;
    expect(order.amountCents).toBe(1000);
    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, publicIdA));
    expect(row).toMatchObject({ eventId: A.id, giftId: giftIds.sameA });
    expect(await quotaSold(giftIds.sameA)).toBe(1);
    expect(await quotaSold(giftIds.sameB)).toBe(0);
  });

  it("publicId de A em B → 404 (GET, cartão, cartão hospedado, aprovação simulada)", async () => {
    expect((await app.request(e(B, `/orders/${publicIdA}`))).status).toBe(404);
    const card = await app.request(e(B, `/orders/${publicIdA}/card`), {
      method: "POST",
      headers: write(),
      body: JSON.stringify({
        token: "1111",
        paymentMethodId: "visa",
        paymentType: "credit_card",
        installments: 1,
        coverFee: false,
      }),
    });
    expect(card.status).toBe(404);
    const checkout = await app.request(e(B, `/orders/${publicIdA}/card-checkout`), {
      method: "POST",
      headers: write(),
      body: JSON.stringify({ coverFee: true }),
    });
    expect(checkout.status).toBe(404);
    const approve = await app.request(e(B, `/dev/orders/${publicIdA}/approve`), {
      method: "POST",
      headers: write(),
    });
    expect(approve.status).toBe(404);
    // E pelo apelido do evento 1 também não aparece.
    expect((await app.request(`/api/e/dani-gustavo/orders/${publicIdA}`)).status).toBe(404);

    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, publicIdA));
    expect(row).toMatchObject({ status: "pending", feeCents: 0 });
  });

  it("no próprio evento: cartão hospedado e aprovação funcionam, e o webhook grava o evento", async () => {
    expect((await app.request(e(A, `/orders/${publicIdA}`))).status).toBe(200);
    const checkout = await app.request(e(A, `/orders/${publicIdA}/card-checkout`), {
      method: "POST",
      headers: write(),
      body: JSON.stringify({ coverFee: false }),
    });
    expect(checkout.status).toBe(200);

    const approve = await app.request(e(A, `/dev/orders/${publicIdA}/approve`), {
      method: "POST",
      headers: write(),
    });
    expect(approve.status).toBe(200);
    const view = OrderView.parse(await (await app.request(e(A, `/orders/${publicIdA}`))).json());
    expect(view.status).toBe("paid");

    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, publicIdA));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, row!.id));
    expect(pay!.eventId).toBe(A.id);
    const [msg] = await db.select().from(messages).where(eq(messages.giftOrderId, row!.id));
    expect(msg).toMatchObject({ eventId: A.id, approved: false });
    const hooks = await db.select().from(webhookEvents).where(eq(webhookEvents.appEventId, A.id));
    expect(hooks.length).toBe(1);
    expect(hooks[0]!.processedAt).not.toBeNull();
    expect(await quotaSold(giftIds.sameA)).toBe(1);
    expect(await quotaSold(giftIds.sameB)).toBe(0);
  });
});

describe("recados", () => {
  it("o mural de A só mostra recados de A", async () => {
    const a = (await (await app.request(e(A, "/messages"))).json()) as WallResponse;
    const bodies = a.messages.map((m) => m.body);
    expect(bodies).toContain(`Recado de A ${t.run}`);
    expect(bodies).not.toContain(`Recado de B ${t.run}`);
  });

  it("recado novo em B fica em B, pendente", async () => {
    const body = `Recado novo em B ${t.run}`;
    const res = await app.request(e(B, "/messages"), {
      method: "POST",
      headers: write(),
      body: JSON.stringify({ author: "Visita B", body, consent: true }),
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(messages).where(eq(messages.body, body));
    expect(row).toMatchObject({ eventId: B.id, approved: false });
  });
});

describe("convites e RSVP", () => {
  const rsvp = (ev: EventCtx, token: string, guestId: number) =>
    app.request(e(ev, `/invitations/${token}/rsvp`), {
      method: "PUT",
      headers: write(),
      body: JSON.stringify({ guests: [{ id: guestId, attending: true }], consent: true }),
    });

  async function guestOf(token: string) {
    const [g] = await db
      .select({ id: guests.id, rsvpStatus: guests.rsvpStatus })
      .from(guests)
      .innerJoin(invitations, eq(invitations.id, guests.invitationId))
      .where(eq(invitations.token, token));
    return g!;
  }

  it("token de B em A → 404 (GET e RSVP), e nada muda em B", async () => {
    expect((await app.request(e(A, `/invitations/${tokens.b}`))).status).toBe(404);
    const guestB = await guestOf(tokens.b);
    expect((await rsvp(A, tokens.b, guestB.id)).status).toBe(404);
    expect((await guestOf(tokens.b)).rsvpStatus).toBe("pending");
    // Pelo apelido do evento 1 também não.
    expect((await app.request(`/api/e/dani-gustavo/invitations/${tokens.b}`)).status).toBe(404);
  });

  it("busca por nome só acha convidados do evento", async () => {
    const [first, last] = guestNames.b.split(" ") as [string, string];
    const lookup = (ev: EventCtx) =>
      app.request(e(ev, "/invitations/lookup"), {
        method: "POST",
        headers: write(),
        body: JSON.stringify({ firstName: first, lastName: last }),
      });
    expect((await lookup(A)).status).toBe(404);
    const res = await lookup(B);
    expect(res.status).toBe(200);
    const body = LookupResponse.parse(await res.json());
    expect(body.matches.map((m) => m.token)).toEqual([tokens.b]);
  });

  it("RSVP no próprio evento grava e registra o log no evento", async () => {
    const res = await app.request(e(A, `/invitations/${tokens.a}`));
    const inv = Invitation.parse(await res.json());
    const guestA = inv.guests[0]!;
    expect((await rsvp(A, tokens.a, guestA.id)).status).toBe(200);
    expect((await guestOf(tokens.a)).rsvpStatus).toBe("confirmed");
    const [inviteRow] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.token, tokens.a));
    const logs = await db
      .select()
      .from(rsvpLogs)
      .where(and(eq(rsvpLogs.invitationId, inviteRow!.id)));
    expect(logs.map((l) => l.eventId)).toEqual([A.id]);
  });
});

describe("evento 1 só pelo slug", () => {
  it.each(["site", "gifts", "messages"])("/api/%s sem slug não existe mais", async (p) => {
    expect((await app.request(`/api/${p}`)).status).toBe(404);
    expect((await app.request(`/api/e/${legacySlug}/${p}`)).status).toBe(200);
  });

  it("presentes de A e B não aparecem no evento 1", async () => {
    const body = GiftsResponse.parse(await (await app.request("/api/e/dani-gustavo/gifts")).json());
    expect(body.gifts.map((g) => g.slug)).not.toContain("so-de-b");
  });
});
