import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  account,
  and,
  eq,
  eventSettings,
  giftOrders,
  gifts,
  inArray,
  invitations,
  LEGACY_EVENT_ID,
  messages,
  payments,
  user,
} from "@casamento/db";
import type {
  AdminGift,
  AdminInvitation,
  AdminOrderDetail,
  DashboardData,
  ReconcileResult,
} from "@casamento/shared";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CacheTag } from "../src/admin/index.ts";
import { csvCell, describeRsvp, invitationStatus } from "../src/admin/invitations.ts";
import { sniffImage, slugify } from "../src/admin/gifts.ts";
import type { Mailer } from "../src/mailer.ts";
import { createSimulatedProvider } from "../src/payments/index.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Usa o banco de DATABASE_URL já migrado e com seed. Cria um usuário do painel, convites e
// presentes próprios e apaga tudo no fim.

const run = Date.now().toString(36);
const uploadDir = await mkdtemp(join(tmpdir(), "casamento-uploads-"));
const revalidated: CacheTag[][] = [];
const mailer: Mailer = { send: () => Promise.resolve() };
const provider = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const { app, db } = testApp(
  {
    mailer,
    provider,
    notifier: { telegram: () => Promise.resolve() },
    revalidate: (tags) => {
      revalidated.push(tags);
      return Promise.resolve();
    },
  },
  { UPLOAD_DIR: uploadDir },
);

const email = `painel-${run}@exemplo.com`;
const password = "senha-de-teste-123";
const userId = ulid();
let cookie = "";
const createdInvitations: number[] = [];
const createdGifts: number[] = [];

const admin = (path: string, init: RequestInit = {}) =>
  app.request(`/api/admin${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
const json = (body: unknown) => JSON.stringify(body);

beforeAll(async () => {
  await db.insert(user).values({ id: userId, name: "Teste", email, emailVerified: true });
  await db.insert(account).values({
    id: ulid(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${run.length}` },
    body: json({ email, password }),
  });
  expect(res.status).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  if (createdInvitations.length) {
    await db.delete(invitations).where(inArray(invitations.id, createdInvitations));
  }
  if (createdGifts.length) {
    const orders = await db
      .select({ id: giftOrders.id })
      .from(giftOrders)
      .where(inArray(giftOrders.giftId, createdGifts));
    const ids = orders.map((o) => o.id);
    if (ids.length) {
      await db.delete(messages).where(inArray(messages.giftOrderId, ids));
      await db.delete(payments).where(inArray(payments.orderId, ids));
      await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
    }
    await db.delete(gifts).where(inArray(gifts.id, createdGifts));
  }
  await db.delete(user).where(eq(user.id, userId));
  await rm(uploadDir, { recursive: true, force: true });
  await db.$client.end();
});

describe("acesso ao painel", () => {
  it.each([
    ["GET", "/dashboard"],
    ["GET", "/invitations"],
    ["POST", "/invitations"],
    ["GET", "/gifts"],
    ["GET", "/orders"],
    ["POST", "/orders/reconcile"],
    ["GET", "/messages"],
    ["PUT", "/settings"],
    ["GET", "/invitations/export.csv"],
  ])("%s %s sem sessão → 401", async (method, path) => {
    const res = await app.request(`/api/admin${path}`, { method });
    expect(res.status).toBe(401);
  });

  it("a X-Web-Key do site não abre o painel", async () => {
    const res = await app.request("/api/admin/dashboard", {
      headers: { "X-Web-Key": TEST_WEB_KEY },
    });
    expect(res.status).toBe(401);
  });

  it("recusa formulário de outra origem (CSRF)", async () => {
    const res = await app.request("/api/admin/uploads", {
      method: "POST",
      headers: {
        cookie,
        Origin: "https://site-malicioso.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "file=x",
    });
    expect(res.status).toBe(403);
  });

  it("troca a senha (Better Auth) e a nova passa a valer", async () => {
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, Origin: "http://localhost:3333" },
      body: json({ currentPassword: password, newPassword: "outra-senha-forte-456" }),
    });
    expect(res.status).toBe(200);
    const login = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.200" },
      body: json({ email, password: "outra-senha-forte-456" }),
    });
    expect(login.status).toBe(200);
  });
});

describe("dashboard", () => {
  it("devolve contagens, dinheiro e prazo", async () => {
    const res = await admin("/dashboard");
    expect(res.status).toBe(200);
    const d = (await res.json()) as DashboardData;
    expect(d.invitations.total).toBeGreaterThan(0);
    expect(d.guests.total).toBe(d.guests.pending + d.guests.confirmed + d.guests.declined);
    expect(d.money.netCents).toBeLessThanOrEqual(d.money.grossCents);
    expect(d.rsvpDeadline).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("convites", () => {
  let inv: AdminInvitation;

  it("cria com convidados e gera link", async () => {
    const res = await admin("/invitations", {
      method: "POST",
      body: json({
        label: `Família Teste ${run}`,
        side: "dani",
        maxGuests: 3,
        guests: [
          { name: "Ana Teste", rsvpStatus: "confirmed", dietaryNotes: "Sem glúten" },
          { name: "Bia Teste", isChild: true, ageRange: "3-7" },
        ],
      }),
    });
    expect(res.status).toBe(201);
    inv = ((await res.json()) as { invitation: AdminInvitation }).invitation;
    createdInvitations.push(inv.id);
    expect(inv.status).toBe("confirmed");
    expect(inv.link).toMatch(new RegExp(`/c/${inv.token}$`));
    expect(inv.guests).toHaveLength(2);
  });

  it("valida o formulário com mensagem em português", async () => {
    const res = await admin("/invitations", {
      method: "POST",
      body: json({ label: "X", side: "dani", maxGuests: 1, guests: [] }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/Nome do convite/);
  });

  it("busca por nome do convidado e filtra por situação", async () => {
    const res = await admin(`/invitations?q=bia%20teste&status=confirmed`);
    const body = (await res.json()) as { invitations: AdminInvitation[] };
    expect(body.invitations.map((i) => i.id)).toContain(inv.id);
    const none = await admin(`/invitations?q=bia%20teste&status=declined`);
    expect(((await none.json()) as { invitations: unknown[] }).invitations).toHaveLength(0);
  });

  it("edita: muda resposta, remove e adiciona convidado", async () => {
    const [ana] = inv.guests;
    const res = await admin(`/invitations/${inv.id}`, {
      method: "PUT",
      body: json({
        label: inv.label,
        side: "gustavo",
        maxGuests: 2,
        guests: [
          { id: ana!.id, name: "Ana Teste", rsvpStatus: "declined" },
          { name: "Caio Teste" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { invitation: AdminInvitation }).invitation;
    expect(updated.side).toBe("gustavo");
    expect(updated.guests.map((g) => g.name)).toEqual(["Ana Teste", "Caio Teste"]);
    expect(updated.status).toBe("pending");
  });

  it("não aceita convidado de outro convite", async () => {
    const res = await admin(`/invitations/${inv.id}`, {
      method: "PUT",
      body: json({
        label: inv.label,
        side: "dani",
        maxGuests: 2,
        guests: [{ id: 1, name: "Outro" }],
      }),
    });
    // O id 1 é um convidado do seed, de outro convite.
    expect(res.status).toBe(422);
  });

  it("gera um link novo e o antigo para de funcionar", async () => {
    const res = await admin(`/invitations/${inv.id}/token`, { method: "POST" });
    const fresh = ((await res.json()) as { invitation: AdminInvitation }).invitation;
    expect(fresh.token).not.toBe(inv.token);
    expect((await app.request(`/api/invitations/${inv.token}`)).status).toBe(404);
    expect((await app.request(`/api/invitations/${fresh.token}`)).status).toBe(200);
  });

  it("detalhe traz as respostas de RSVP", async () => {
    const res = await admin(`/invitations/${inv.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ invitation: { id: inv.id }, responses: [] });
  });

  it("exporta CSV dos confirmados para o buffet", async () => {
    await admin(`/invitations/${inv.id}`, {
      method: "PUT",
      body: json({
        label: inv.label,
        side: "dani",
        maxGuests: 2,
        guests: [
          {
            id: inv.guests[0]!.id,
            name: "Ana Teste",
            rsvpStatus: "confirmed",
            dietaryNotes: "Sem glúten",
          },
        ],
      }),
    });
    const res = await admin("/invitations/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM: acentos certos no Excel
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("Convidado;Convite")).toBe(true);
    expect(text).toContain("Ana Teste;");
    expect(text).toContain("Sem glúten");
  });

  it("exclui", async () => {
    expect((await admin(`/invitations/${inv.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await admin(`/invitations/${inv.id}`)).status).toBe(404);
  });
});

describe("presentes", () => {
  let gift: AdminGift;

  it("cria, com slug e no fim da lista", async () => {
    revalidated.length = 0;
    const res = await admin("/gifts", {
      method: "POST",
      body: json({
        title: `Jantar à luz de velas ${run}`,
        category: "casa",
        priceCents: 15000,
        quotaTotal: 2,
      }),
    });
    expect(res.status).toBe(201);
    gift = ((await res.json()) as { gift: AdminGift }).gift;
    createdGifts.push(gift.id);
    expect(gift.slug).toBe(`jantar-a-luz-de-velas-${run}`);
    expect(revalidated).toContainEqual(["gifts"]);
  });

  it("envia imagem (só JPG/PNG/WebP de verdade)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.set("file", new File([png], "foto.png", { type: "image/png" }));
    const res = await app.request("/api/admin/uploads", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const { path } = (await res.json()) as { path: string };
    expect(path).toMatch(/^\/uploads\/[0-9A-Z]{26}\.png$/);
    const served = await app.request(path);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    const fake = new FormData();
    fake.set("file", new File(["<svg/>"], "x.png", { type: "image/png" }));
    const bad = await app.request("/api/admin/uploads", {
      method: "POST",
      headers: { cookie },
      body: fake,
    });
    expect(bad.status).toBe(422);

    const edited = await admin(`/gifts/${gift.id}`, {
      method: "PUT",
      body: json({ ...pick(gift), image: path }),
    });
    expect(((await edited.json()) as { gift: AdminGift }).gift.image).toBe(path);
  });

  it("não deixa o total de cotas abaixo do vendido", async () => {
    await db.update(gifts).set({ quotaSold: 2 }).where(eq(gifts.id, gift.id));
    const res = await admin(`/gifts/${gift.id}`, {
      method: "PUT",
      body: json({ ...pick(gift), quotaTotal: 1 }),
    });
    expect(res.status).toBe(422);
    await db.update(gifts).set({ quotaSold: 0 }).where(eq(gifts.id, gift.id));
  });

  it("desativa e tira da lista pública", async () => {
    await admin(`/gifts/${gift.id}/active`, { method: "PATCH", body: json({ active: false }) });
    const pub = (await (await app.request("/api/gifts")).json()) as { gifts: { slug: string }[] };
    expect(pub.gifts.map((g) => g.slug)).not.toContain(gift.slug);
    await admin(`/gifts/${gift.id}/active`, { method: "PATCH", body: json({ active: true }) });
  });

  it("reordena", async () => {
    const list = ((await (await admin("/gifts")).json()) as { gifts: AdminGift[] }).gifts;
    const ids = [gift.id, ...list.filter((g) => g.id !== gift.id).map((g) => g.id)];
    const res = await admin("/gifts/order", { method: "PUT", body: json({ ids }) });
    const after = ((await res.json()) as { gifts: AdminGift[] }).gifts;
    expect(after[0]!.id).toBe(gift.id);
  });

  it("exclui presente sem pedidos", async () => {
    const res = await admin("/gifts", {
      method: "POST",
      body: json({
        title: `Descartável ${run}`,
        category: "casa",
        priceCents: 1000,
        quotaTotal: 1,
      }),
    });
    const tmp = ((await res.json()) as { gift: AdminGift }).gift;
    expect((await admin(`/gifts/${tmp.id}`, { method: "DELETE" })).status).toBe(200);
  });
});

describe("pedidos", () => {
  let giftId = 0;
  let slug = "";

  beforeAll(async () => {
    const res = await admin("/gifts", {
      method: "POST",
      body: json({
        title: `Pedido teste ${run}`,
        category: "casa",
        priceCents: 10000,
        quotaTotal: 3,
      }),
    });
    const g = ((await res.json()) as { gift: AdminGift }).gift;
    giftId = g.id;
    slug = g.slug;
    createdGifts.push(g.id);
  });

  const buy = (method: "pix" | "card") =>
    app.request("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Web-Key": TEST_WEB_KEY,
        "X-Client-Ip": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      },
      body: json({
        giftSlug: slug,
        quantity: 1,
        buyerName: "Convidada Teste",
        buyerEmail: "convidada@exemplo.com",
        message: "Muitas felicidades!",
        showOnWall: true,
        method,
        ...(method === "card"
          ? {
              card: {
                token: "sim_1111_x",
                paymentMethodId: "visa",
                paymentType: "credit_card",
                installments: 1,
              },
            }
          : {}),
      }),
    });

  it("lista com filtros e reembolsa um pedido pago (simulado)", async () => {
    const created = (await (await buy("card")).json()) as { publicId: string; status: string };
    expect(created.status).toBe("paid");

    const list = await admin(
      `/orders?status=paid&method=card&q=${encodeURIComponent("Pedido teste " + run)}`,
    );
    const { orders } = (await list.json()) as { orders: { publicId: string }[] };
    expect(orders.map((o) => o.publicId)).toContain(created.publicId);

    const detail = (await (await admin(`/orders/${created.publicId}`)).json()) as {
      order: AdminOrderDetail;
    };
    expect(detail.order.canRefund).toBe(true);
    expect(detail.order.payments).toHaveLength(1);

    const [msg] = await db
      .select()
      .from(messages)
      .innerJoin(giftOrders, eq(giftOrders.id, messages.giftOrderId))
      .where(eq(giftOrders.publicId, created.publicId));
    expect(msg).toBeDefined();
    await admin(`/messages/${msg!.messages.id}`, {
      method: "PATCH",
      body: json({ approved: true }),
    });

    const refund = await admin(`/orders/${created.publicId}/refund`, { method: "POST" });
    expect(refund.status).toBe(200);
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    expect(row!.status).toBe("refunded");
    const [g] = await db.select().from(gifts).where(eq(gifts.id, giftId));
    expect(g!.quotaSold).toBe(0);
    const [hidden] = await db.select().from(messages).where(eq(messages.id, msg!.messages.id));
    expect(hidden!.approved).toBe(false);

    const again = await admin(`/orders/${created.publicId}/refund`, { method: "POST" });
    expect(again.status).toBe(409);
  });

  it("conciliação marca como pago um Pix aprovado cujo webhook se perdeu", async () => {
    const created = (await (await buy("pix")).json()) as { publicId: string };
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    provider.approve(row!.providerOrderId!); // aprova no provedor sem entregar o webhook
    const res = await admin("/orders/reconcile", { method: "POST" });
    expect(res.status).toBe(200);
    const result = (await res.json()) as ReconcileResult;
    expect(result.changed).toContainEqual({
      publicId: created.publicId,
      from: "pending",
      to: "paid",
    });
  });
});

describe("recados", () => {
  it("lista e aprova/oculta", async () => {
    const [res] = await db.insert(messages).values({ author: "Tia Teste", body: `Oi ${run}` });
    try {
      const list = (await (await admin("/messages?status=pending")).json()) as {
        messages: { id: number }[];
      };
      expect(list.messages.map((m) => m.id)).toContain(res.insertId);
      revalidated.length = 0;
      expect(
        (
          await admin(`/messages/${res.insertId}`, {
            method: "PATCH",
            body: json({ approved: true }),
          })
        ).status,
      ).toBe(200);
      expect(revalidated).toContainEqual(["messages"]);
      const [m] = await db.select().from(messages).where(eq(messages.id, res.insertId));
      expect(m!.approved).toBe(true);
    } finally {
      await db.delete(messages).where(eq(messages.id, res.insertId));
    }
  });
});

describe("configurações", () => {
  it("lê, valida e salva (e invalida o cache do site)", async () => {
    const res = await admin("/settings");
    const { values } = (await res.json()) as { values: Record<string, unknown> };
    expect(values["rsvp.deadline"]).toBeTruthy();
    const original = values["payments.card_fee_percent"];

    const bad = await admin("/settings", {
      method: "PUT",
      body: json({ values: { "payments.card_fee_percent": -1 } }),
    });
    expect(bad.status).toBe(422);
    const unknown = await admin("/settings", {
      method: "PUT",
      body: json({ values: { "nao.existe": 1 } }),
    });
    expect(unknown.status).toBe(422);

    revalidated.length = 0;
    try {
      const ok = await admin("/settings", {
        method: "PUT",
        body: json({ values: { "payments.card_fee_percent": 3.5 } }),
      });
      expect(ok.status).toBe(200);
      expect(revalidated).toContainEqual(["site", "gifts"]);
      const [row] = await db
        .select()
        .from(eventSettings)
        .where(
          and(
            eq(eventSettings.eventId, LEGACY_EVENT_ID),
            eq(eventSettings.key, "payments.card_fee_percent"),
          ),
        );
      expect(row!.value).toBe(3.5);
    } finally {
      await admin("/settings", {
        method: "PUT",
        body: json({ values: { "payments.card_fee_percent": original } }),
      });
    }
  });
});

describe("funções puras", () => {
  it("situação do convite", () => {
    expect(invitationStatus([{ rsvpStatus: "pending" }])).toBe("pending");
    expect(invitationStatus([{ rsvpStatus: "declined" }, { rsvpStatus: "confirmed" }])).toBe(
      "confirmed",
    );
    expect(invitationStatus([{ rsvpStatus: "declined" }])).toBe("declined");
  });

  it("CSV neutraliza fórmulas e escapa aspas", () => {
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
  });

  it("resumo da resposta de RSVP", () => {
    expect(
      describeRsvp(
        { guests: [{ id: 1, attending: true, dietaryNotes: "Vegano" }], plusOneName: "Léo" },
        new Map([[1, "Ana"]]),
      ),
    ).toEqual(["Ana: vai (restrição: Vegano)", "Acompanhante: Léo"]);
  });

  it("slug e tipo de imagem", () => {
    expect(slugify("Lua de mel em Gramado!")).toBe("lua-de-mel-em-gramado");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("<svg>"))).toBeNull();
  });
});

function pick(g: AdminGift) {
  return {
    title: g.title,
    description: g.description,
    category: g.category,
    priceCents: g.priceCents,
    quotaTotal: g.quotaTotal,
    openAmount: g.openAmount,
    active: g.active,
    image: g.image,
  };
}
