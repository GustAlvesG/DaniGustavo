import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  eq,
  eventSettings,
  guests,
  invitations,
  newPublicId,
  rsvpReminders,
  type giftOrders,
  type gifts,
} from "@casamento/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runReminderRound } from "../src/jobs.ts";
import { fromHeader, type Mailer, type MailMessage } from "../src/mailer.ts";
import { eventNotifyRecipients, notifyPaid, type Notifier } from "../src/orders/notify.ts";
import { resolverFor, type EventResolver } from "../src/tenancy/resolver.ts";
import { eventBaseUrl } from "../src/tenancy/urls.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";

// Etapa 6: jobs por evento, avisos por evento, links com o host do evento e uploads por evento.
// Tudo em eventos criados pela fixture (os eventos reais só são lidos).

const sent: MailMessage[] = [];
const telegrams: string[] = [];
let failTo: string | null = null;
const mailer: Mailer = {
  send(m) {
    if (failTo && m.to === failTo) return Promise.reject(new Error("SMTP fora do ar"));
    sent.push(m);
    return Promise.resolve();
  },
};
const notifier: Notifier = {
  telegram(text) {
    telegrams.push(text);
    return Promise.resolve();
  },
};
const uploadDir = await mkdtemp(join(tmpdir(), "casamento-uploads-e6-"));
let clock = new Date("2027-03-01T12:00:00Z");
const { app, db, env } = testApp({ mailer, notifier, now: () => clock }, { UPLOAD_DIR: uploadDir });

let T: TestEvents;
const resolver = resolverFor(db);
const inviteIds: Record<"a" | "b", number> = { a: 0, b: 0 };
const tokens: Record<"a" | "b", string> = { a: "", b: "" };

async function setting(eventId: number, key: string, value: unknown) {
  await db
    .insert(eventSettings)
    .values({ eventId, key, value, isPublic: false })
    .onDuplicateKeyUpdate({ set: { value } });
}

async function invite(key: "a" | "b", eventId: number) {
  tokens[key] = newPublicId();
  const [res] = await db.insert(invitations).values({
    eventId,
    token: tokens[key],
    label: `Lembrete ${key}`,
    side: "dani",
    maxGuests: 2,
    contactEmail: `${key}-${T.run}@exemplo.com`,
  });
  inviteIds[key] = res.insertId;
  await db.insert(guests).values({
    eventId,
    invitationId: res.insertId,
    name: `Convidado ${key}`,
    rsvpStatus: "pending",
  });
}

beforeAll(async () => {
  T = await createTestEvents(db);
  // A: prazo em 7 dias, lembrete 10 dias antes (já devido), fuso padrão (São Paulo).
  await setting(T.eventA.id, "rsvp.deadline", "2027-03-08T20:00:00.000Z");
  await setting(T.eventA.id, "reminders", { enabled: true, daysBefore: [10] });
  await setting(T.eventA.id, "wedding.datetime", "2027-06-01T18:00:00.000Z");
  // B: prazo em 30 dias, lembrete 3 dias antes (ainda não), fuso de Tóquio.
  await setting(T.eventB.id, "rsvp.deadline", "2027-03-31T20:00:00.000Z");
  await setting(T.eventB.id, "reminders", { enabled: true, daysBefore: [3] });
  await setting(T.eventB.id, "wedding.datetime", "2027-06-01T18:00:00.000Z");
  await setting(T.eventB.id, "wedding.timezone", "Asia/Tokyo");
  await invite("a", T.eventA.id);
  await invite("b", T.eventB.id);
});

afterAll(async () => {
  await T.cleanup();
  await rm(uploadDir, { recursive: true, force: true });
  await db.$client.end();
});

const deps = () => ({
  env,
  db,
  mailer,
  now: () => clock,
  only: [inviteIds.a, inviteIds.b],
});
const mine = () => sent.filter((m) => m.to.endsWith(`-${T.run}@exemplo.com`));

describe("lembretes com dois eventos", () => {
  it("cada evento usa a sua configuração e o seu host nos links", async () => {
    sent.length = 0;
    const r = await runReminderRound(deps());
    expect(r.get(T.eventA.id)).toEqual({ sent: 1, failed: 0 });
    expect(r.get(T.eventB.id)).toEqual({ sent: 0, failed: 0 }); // fora da janela de B

    const [mail] = mine();
    expect(mail?.to).toBe(`a-${T.run}@exemplo.com`);
    expect(mail?.fromName).toBe(T.eventA.name);
    expect(mail?.subject).toContain(T.eventA.name);
    expect(mail?.text).toContain(`http://${T.primaryHostA}/c/${tokens.a}`);
  });

  it("B entra na janela com o prazo no fuso de B; sem domínio o link cai no SITE_URL", async () => {
    clock = new Date("2027-03-29T12:00:00Z");
    sent.length = 0;
    const r = await runReminderRound(deps());
    // A já passou do prazo (8/3): não envia. B está a 2 dias do prazo.
    expect(r.get(T.eventA.id)).toEqual({ sent: 0, failed: 0 });
    expect(r.get(T.eventB.id)).toEqual({ sent: 1, failed: 0 });
    const [mail] = mine();
    expect(mail?.to).toBe(`b-${T.run}@exemplo.com`);
    expect(mail?.text).toContain(`${env.SITE_URL.replace(/\/+$/, "")}/c/${tokens.b}`);
    // 31/3 20:00Z = 1/4 05:00 em Tóquio.
    expect(mail?.text).toContain("1 de abril");
  });

  it("erro num evento não interrompe os outros", async () => {
    clock = new Date("2027-03-01T12:00:00Z");
    await setting(T.eventB.id, "rsvp.deadline", "2027-03-03T20:00:00.000Z"); // B devido também
    await db.delete(rsvpReminders).where(eq(rsvpReminders.eventId, T.eventA.id));
    await db.delete(rsvpReminders).where(eq(rsvpReminders.eventId, T.eventB.id));
    sent.length = 0;
    const broken: EventResolver = {
      ...resolver,
      byId: (id) =>
        id === T.eventA.id ? Promise.reject(new Error("falha de teste")) : resolver.byId(id),
    };
    const quiet = console.error;
    console.error = () => undefined;
    let r;
    try {
      r = await runReminderRound({ ...deps(), eventResolver: broken });
    } finally {
      console.error = quiet;
    }
    expect(r.get(T.eventA.id)).toBeInstanceOf(Error);
    expect(r.get(T.eventB.id)).toEqual({ sent: 1, failed: 0 });
    expect(mine().map((m) => m.to)).toEqual([`b-${T.run}@exemplo.com`]);
  });
});

describe("avisos por evento", () => {
  const order = {
    publicId: "PUB",
    buyerName: "Ana Teste",
    buyerEmail: "ana-e6@exemplo.com",
    amountCents: 10000,
    feeCents: 0,
    feeCovered: false,
    quantity: 1,
    method: "pix",
    message: "Felicidades!",
    showOnWall: false,
  } as unknown as typeof giftOrders.$inferSelect;
  const gift = { title: "Jantar", openAmount: false } as typeof gifts.$inferSelect;

  it("destinatários: anfitriões; owners da org só pela configuração (ou sem anfitrião)", async () => {
    const host = T.users.host.email;
    const owner = T.users.owner.email;
    expect(await eventNotifyRecipients(T.eventA, db)).toEqual([host]);
    await setting(T.eventA.id, "notify.org_owners", true);
    expect((await eventNotifyRecipients(T.eventA, db)).sort()).toEqual([host, owner].sort());
    await setting(T.eventA.id, "notify.org_owners", false);
    expect(await eventNotifyRecipients(T.eventA, db)).toEqual([host]);

    // B não tem anfitrião: owners da org B por padrão; false desliga.
    expect(await eventNotifyRecipients(T.eventB, db)).toEqual([T.users.stranger.email]);
    await setting(T.eventB.id, "notify.org_owners", false);
    expect(await eventNotifyRecipients(T.eventB, db)).toEqual([]);
  });

  it("e-mails com o nome e o host do evento; Telegram com prefixo", async () => {
    await setting(T.eventA.id, "notify.org_owners", true);
    sent.length = 0;
    telegrams.length = 0;
    await notifyPaid({ env, db, mailer, notifier }, T.eventA, order, gift);

    const thanks = sent.find((m) => m.to === "ana-e6@exemplo.com")!;
    expect(thanks.fromName).toBe(T.eventA.name);
    expect(thanks.text).toContain(`http://${T.primaryHostA}/presentes/obrigado/PUB`);
    expect(thanks.text).toContain(T.eventA.name);
    expect(thanks.text).not.toContain("Dani");
    const hostMails = sent.filter((m) => m.to !== "ana-e6@exemplo.com").map((m) => m.to);
    expect(hostMails.sort()).toEqual([T.users.host.email, T.users.owner.email].sort());
    expect(telegrams).toHaveLength(1);
    expect(telegrams[0]?.startsWith(`[${T.eventA.name}] Presente recebido: Jantar`)).toBe(true);
  });

  it("falha num destinatário não impede os outros", async () => {
    failTo = T.users.host.email;
    sent.length = 0;
    const quiet = console.error;
    console.error = () => undefined;
    try {
      await notifyPaid({ env, db, mailer, notifier }, T.eventA, order, gift);
    } finally {
      console.error = quiet;
      failTo = null;
    }
    expect(sent.map((m) => m.to)).toContain(T.users.owner.email);
  });

  it("nome de exibição do remetente", () => {
    expect(fromHeader("nao-responda@x.com", "Dani & Gustavo")).toBe(
      '"Dani & Gustavo" <nao-responda@x.com>',
    );
    expect(fromHeader("Antigo <a@x.com>", "Festa")).toBe('"Festa" <a@x.com>');
    expect(fromHeader("a@x.com", 'Má"\r\nBcc: x')).not.toMatch(/[\r\n]/);
    expect(fromHeader("a@x.com")).toBe("a@x.com");
  });

  it("eventBaseUrl usa o host primário e cai no SITE_URL", async () => {
    expect(await eventBaseUrl(T.eventA, { env, resolver })).toBe(`http://${T.primaryHostA}`);
    expect(await eventBaseUrl(T.eventB, { env, resolver })).toBe(env.SITE_URL.replace(/\/+$/, ""));
  });
});

describe("uploads por evento", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  let path = "";
  let file = "";

  it("grava em UPLOAD_DIR/<eventId> e serve pelo caminho do evento", async () => {
    const cookie = await T.login(app, "host");
    const form = new FormData();
    form.set("file", new File([png], "foto.png", { type: "image/png" }));
    const res = await app.request(`/api/admin/events/${T.eventA.id}/uploads`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(201);
    path = ((await res.json()) as { path: string }).path;
    file = path.split("/").pop()!;
    expect(path).toBe(`/uploads/${T.eventA.id}/${file}`);
    expect(await readdir(join(uploadDir, String(T.eventA.id)))).toEqual([file]);

    const served = await app.request(path);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("o caminho de outro evento não acha o arquivo; traversal é barrado", async () => {
    expect((await app.request(`/uploads/${T.eventB.id}/${file}`)).status).toBe(404);
    for (const bad of [
      `/uploads/${T.eventA.id}/..%2F${file}`,
      `/uploads/${T.eventA.id}/%2e%2e/${file}`,
      `/uploads/..%2F${T.eventA.id}/${file}`,
      `/uploads/%2e%2e/${file}`,
      `/uploads/${T.eventA.id}/${file}%00`,
      `/uploads/${T.eventA.id}/..%5C${file}`,
    ]) {
      expect((await app.request(bad)).status, bad).toBe(404);
    }
  });

  it("presente do evento B não aceita foto do evento A", async () => {
    const cookie = await T.login(app, "stranger");
    const res = await app.request(`/api/admin/events/${T.eventB.id}/gifts`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Presente com foto alheia",
        category: "casa",
        priceCents: 1000,
        quotaTotal: 1,
        image: path,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("rota legada /uploads/:file procura na raiz e depois em 1/", async () => {
    const root = "01ARZ3NDEKTSV4RRFFQ69G5FAV.png";
    const one = "01ARZ3NDEKTSV4RRFFQ69G5FAW.png";
    await writeFile(join(uploadDir, root), png);
    await mkdir(join(uploadDir, "1"), { recursive: true });
    await writeFile(join(uploadDir, "1", one), png);
    expect((await app.request(`/uploads/${root}`)).status).toBe(200);
    expect((await app.request(`/uploads/${one}`)).status).toBe(200);
    expect((await app.request(`/uploads/01ARZ3NDEKTSV4RRFFQ69G5FAX.png`)).status).toBe(404);
  });
});
