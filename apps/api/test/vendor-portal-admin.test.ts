import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, eventTasks, vendorPortalLinks } from "@casamento/db";
import {
  VENDOR_PORTAL_DEFAULT_DAYS,
  type TaskRow,
  type VendorPortalLinksResponse,
  type VendorPortalLinkView,
} from "@casamento/shared";
import { portalFixture, type PortalFixture } from "./vendor-portal-fixtures.ts";

// Fase 7, frente C: links do portal do fornecedor no painel (gerar, e-mail, listar, revogar),
// permissões do anfitrião (`vendors.portal`) e o fornecedor na tarefa.

let f!: PortalFixture;
const DAY = 86_400_000;

beforeAll(async () => {
  f = await portalFixture("vendor-portal-admin");
});
afterAll(async () => {
  await f.cleanup();
});

const linksUrl = (eventId: number, ev: number, path = "") =>
  f.evUrl(eventId, `/vendors/${ev}/portal-links${path}`);

async function setHostDeny(deny: string[]) {
  const res = await f.call(
    "owner",
    `/api/admin/orgs/${f.t.orgA.id}/events/${f.t.eventA.id}/host-permissions`,
    "PUT",
    { deny },
  );
  expect(res.status).toBe(200);
}

describe("gerar link", () => {
  it("usa o e-mail do catálogo, manda o e-mail e guarda só o hash do token", async () => {
    const before = f.sent.length;
    const { token, created } = await f.newLink("owner", f.t.eventA.id, f.a1);
    expect(created.emailSent).toBe(true);
    expect(created.url).toMatch(/^http:\/\/localhost:3333\/fornecedor\/#[A-Za-z0-9_-]{43}$/);
    expect(created.link).toMatchObject({ email: "sabor@x.com", status: "active", revokedAt: null });
    const days = (Date.parse(created.link.expiresAt) - Date.now()) / DAY;
    expect(Math.round(days)).toBe(VENDOR_PORTAL_DEFAULT_DAYS);

    const mail = f.sent[before]!;
    expect(f.sent.length).toBe(before + 1);
    expect(mail.to).toBe("sabor@x.com");
    expect(mail.subject).toContain(f.t.eventA.name);
    expect(mail.text).toContain(created.url);
    expect(mail.text).toMatch(/vale até \d{2}\/\d{2}\/\d{4}/);

    const [row] = await f.db
      .select()
      .from(vendorPortalLinks)
      .where(
        and(
          eq(vendorPortalLinks.eventId, f.t.eventA.id),
          eq(vendorPortalLinks.id, created.link.id),
        ),
      );
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("sem e-mail no catálogo pede o e-mail (422 com campo); com e-mail informado, envia", async () => {
    const res = await f.call("owner", linksUrl(f.t.eventA.id, f.a2), "POST", {});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { field?: string; message: string } };
    expect(body.error.field).toBe("email");
    const { created } = await f.newLink("owner", f.t.eventA.id, f.a2, {
      email: "luz@x.com",
      days: 3,
    });
    expect(created.link.email).toBe("luz@x.com");
    expect(Math.round((Date.parse(created.link.expiresAt) - Date.now()) / DAY)).toBe(3);
  });

  it("e-mail fora do ar não desfaz o link (a equipe copia o endereço)", async () => {
    f.failNextMail();
    const { created } = await f.newLink("owner", f.t.eventA.id, f.a1);
    expect(created.emailSent).toBe(false);
    expect(created.link.status).toBe("active");
  });

  it("validade fora do intervalo → 422", async () => {
    for (const days of [0, 181]) {
      const res = await f.call("owner", linksUrl(f.t.eventA.id, f.a1), "POST", { days });
      expect(res.status).toBe(422);
    }
  });
});

describe("listar e revogar", () => {
  it("lista os links do fornecedor, sem token, e revoga", async () => {
    const { created } = await f.newLink("member", f.t.eventA.id, f.a1);
    const list = await f.call("owner", linksUrl(f.t.eventA.id, f.a1));
    expect(list.status).toBe(200);
    const text = await list.clone().text();
    expect(text).not.toMatch(/token/i);
    const { links } = (await list.json()) as VendorPortalLinksResponse;
    expect(links.some((l) => l.id === created.link.id && l.status === "active")).toBe(true);

    const rev = await f.call(
      "owner",
      linksUrl(f.t.eventA.id, f.a1, `/${created.link.id}/revoke`),
      "POST",
    );
    expect(rev.status).toBe(200);
    const { link } = (await rev.json()) as { link: VendorPortalLinkView };
    expect(link.status).toBe("revoked");
    expect(link.revokedAt).not.toBeNull();
  });

  it("link de outro fornecedor ou evento → 404", async () => {
    const { created } = await f.newLink("owner", f.t.eventA.id, f.a1);
    const other = await f.call(
      "owner",
      linksUrl(f.t.eventA.id, f.a2, `/${created.link.id}/revoke`),
      "POST",
    );
    expect(other.status).toBe(404);
    // Fornecedor do evento B pela rota do evento A.
    expect((await f.call("owner", linksUrl(f.t.eventA.id, f.b1))).status).toBe(404);
    expect((await f.call("owner", linksUrl(f.t.eventA.id, f.b1), "POST", {})).status).toBe(404);
    // Dono da org B não enxerga o evento A.
    expect((await f.call("stranger", linksUrl(f.t.eventA.id, f.a1))).status).toBe(404);
  });

  it("status expirado aparece na lista", async () => {
    const { created } = await f.newLink("owner", f.t.eventA.id, f.a1);
    await f.db
      .update(vendorPortalLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(vendorPortalLinks.eventId, f.t.eventA.id),
          eq(vendorPortalLinks.id, created.link.id),
        ),
      );
    const { links } = (await (
      await f.call("owner", linksUrl(f.t.eventA.id, f.a1))
    ).json()) as VendorPortalLinksResponse;
    expect(links.find((l) => l.id === created.link.id)?.status).toBe("expired");
  });
});

describe("permissões do anfitrião", () => {
  it("anfitrião gera por padrão; sem vendors.portal só vê; sem vendors.read nada", async () => {
    await f.newLink("host", f.t.eventA.id, f.a1);

    await setHostDeny(["vendors.portal"]);
    expect((await f.call("host", linksUrl(f.t.eventA.id, f.a1))).status).toBe(200);
    expect((await f.call("host", linksUrl(f.t.eventA.id, f.a1), "POST", {})).status).toBe(403);
    const { links } = (await (
      await f.call("owner", linksUrl(f.t.eventA.id, f.a1))
    ).json()) as VendorPortalLinksResponse;
    expect(
      (await f.call("host", linksUrl(f.t.eventA.id, f.a1, `/${links[0]!.id}/revoke`), "POST"))
        .status,
    ).toBe(403);

    await setHostDeny(["vendors.read"]);
    expect((await f.call("host", linksUrl(f.t.eventA.id, f.a1))).status).toBe(403);
    expect((await f.call("host", linksUrl(f.t.eventA.id, f.a1), "POST", {})).status).toBe(403);

    await setHostDeny([]);
    // O dono do evento continua podendo tudo.
    expect((await f.call("owner", linksUrl(f.t.eventA.id, f.a1))).status).toBe(200);
  });
});

describe("fornecedor na tarefa", () => {
  it("liga a tarefa ao fornecedor do evento; de outro evento → 422; sair do evento anula", async () => {
    const tasks = f.evUrl(f.t.eventA.id, "/tasks");
    const bad = await f.call("owner", tasks, "POST", { title: "Montagem", eventVendorId: f.b1 });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { field?: string } }).error.field).toBe("eventVendorId");

    const ok = await f.call("owner", tasks, "POST", { title: "Montagem", eventVendorId: f.a2 });
    expect(ok.status).toBe(201);
    const { task } = (await ok.json()) as { task: TaskRow };
    expect(task.eventVendor).toMatchObject({ id: f.a2 });
    expect(task.eventVendor!.name).toContain("Foto Luz");

    // PATCH sem o campo não mexe; com null tira.
    const same = await f.call("owner", `${tasks}/${task.id}`, "PATCH", { status: "doing" });
    expect(((await same.json()) as { task: TaskRow }).task.eventVendor?.id).toBe(f.a2);
    const cleared = await f.call("owner", `${tasks}/${task.id}`, "PATCH", { eventVendorId: null });
    expect(((await cleared.json()) as { task: TaskRow }).task.eventVendor).toBeNull();
    const back = await f.call("owner", `${tasks}/${task.id}`, "PATCH", { eventVendorId: f.a2 });
    expect(back.status).toBe(200);

    // Gera um link, tira o fornecedor do evento: tarefa fica sem fornecedor, link some.
    await f.newLink("owner", f.t.eventA.id, f.a2, { email: "luz@x.com" });
    const del = await f.call("owner", f.evUrl(f.t.eventA.id, `/vendors/${f.a2}`), "DELETE");
    expect(del.status).toBe(200);
    const [row] = await f.db
      .select({ v: eventTasks.eventVendorId })
      .from(eventTasks)
      .where(and(eq(eventTasks.eventId, f.t.eventA.id), eq(eventTasks.id, task.id)));
    expect(row!.v).toBeNull();
    const links = await f.db
      .select()
      .from(vendorPortalLinks)
      .where(
        and(
          eq(vendorPortalLinks.eventId, f.t.eventA.id),
          eq(vendorPortalLinks.eventVendorId, f.a2),
        ),
      );
    expect(links).toHaveLength(0);
  });
});
