import {
  and,
  asc,
  byEvent,
  count,
  eq,
  eventVendors,
  isNull,
  isUniqueViolation,
  newPublicId,
  quotes,
  scheduleItems,
  vendorContracts,
  vendors,
  type Database,
} from "@casamento/db";
import {
  CONTRACT_MAX_BYTES,
  ContractMeta,
  EventVendorInput,
  EventVendorUpdate,
  type ContractRow,
  type EventVendorRow,
} from "@casamento/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { apiError, ERROR_CODES } from "../errors.ts";
import { addStorageUsage, checkPlanLimit, planLimitResponse } from "../plans/limits.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import {
  attachment,
  cleanFileName,
  CONTRACT_MIME_BY_EXT,
  sniffContract,
} from "../vendors/files.ts";
import { categoriesProblem, categoryOptions, customLabels } from "../vendors/categories.ts";
import { can } from "../tenancy/permissions.ts";
import {
  eventCounts,
  findVendor,
  INVALID_DOCUMENT,
  normalizeDocument,
  toVendorRow,
  vendorValues,
} from "../vendors/service.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "./context.ts";

/*
 * Fase 4, frente B (docs/saas/fase-4.md): fornecedores do evento e contratos.
 *
 * /api/admin/events/:eventId/vendor-catalog (adminVendorCatalogRoutes)
 * - GET /  → { vendors: VendorRow[] } do catálogo da organização do evento (sem arquivados)
 *
 * /api/admin/events/:eventId/vendors (adminEventVendorRoutes)
 * - GET    /                                          → { vendors: EventVendorRow[] }
 * - POST   /                                          EventVendorInput → { vendor }
 * - PATCH  /:eventVendorId                            EventVendorUpdate → { vendor }
 * - DELETE /:eventVendorId                            → { ok } (orçamento contratado → 409)
 * - GET    /:eventVendorId/contracts                  → { contracts: ContractRow[] }
 * - POST   /:eventVendorId/contracts                  multipart (file + ContractMeta) → { contract }
 * - GET    /:eventVendorId/contracts/:contractId/file → o arquivo (Content-Disposition)
 * - DELETE /:eventVendorId/contracts/:contractId      → { ok }
 *
 * O catálogo é da organização (o anfitrião só lê e cadastra ao ligar ao evento); os contratos
 * ficam na área privada do Storage e só saem por esta rota, com sessão e `vendors.read`.
 */
export function adminVendorCatalogRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("vendors.read"), async (c) => {
    const ev = c.get("event");
    const rows = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.organizationId, ev.orgId), isNull(vendors.archivedAt)))
      .orderBy(asc(vendors.name), asc(vendors.id));
    const counts = await eventCounts(
      db,
      ev.orgId,
      rows.map((r) => r.id),
    );
    return c.json({ vendors: rows.map((r) => toVendorRow(r, counts.get(r.id) ?? 0)) });
  });
  /** Categorias para escolher (fixas + próprias da organização do evento). */
  app.get("/categories", requirePermission("vendors.read"), async (c) => {
    const orgId = c.get("event").orgId;
    return c.json({
      options: await categoryOptions(db, orgId),
      labels: await customLabels(db, orgId),
    });
  });
  return app;
}

type ContractRecord = typeof vendorContracts.$inferSelect;

const contractRow = (ev: EventCtx, r: ContractRecord): ContractRow => ({
  id: r.id,
  eventVendorId: r.eventVendorId,
  title: r.title,
  originalName: r.originalName,
  mime: r.mime as ContractRow["mime"],
  bytes: r.bytes,
  signedOn: r.signedOn,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  downloadUrl: `/api/admin/events/${ev.id}/vendors/${r.eventVendorId}/contracts/${r.id}/file`,
});

/** Linhas do evento com os dados do catálogo (join pelas duas colunas de escopo). */
async function listEventVendors(
  db: Database,
  ev: EventCtx,
  onlyId?: number,
): Promise<EventVendorRow[]> {
  const rows = await db
    .select({ link: eventVendors, vendor: vendors })
    .from(eventVendors)
    .innerJoin(
      vendors,
      and(
        eq(vendors.organizationId, eventVendors.organizationId),
        eq(vendors.id, eventVendors.vendorId),
      ),
    )
    .where(
      and(
        byEvent(eventVendors, ev),
        eq(vendors.organizationId, ev.orgId),
        onlyId === undefined ? undefined : eq(eventVendors.id, onlyId),
      ),
    )
    .orderBy(asc(vendors.name), asc(eventVendors.id));
  const contracts = await db
    .select({ id: vendorContracts.eventVendorId, n: count() })
    .from(vendorContracts)
    .where(byEvent(vendorContracts, ev))
    .groupBy(vendorContracts.eventVendorId);
  const byVendor = new Map(contracts.map((r) => [r.id, Number(r.n)]));
  return rows.map(({ link, vendor }) => ({
    id: link.id,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      category: vendor.category as EventVendorRow["category"],
      contactName: vendor.contactName,
      email: vendor.email,
      phone: vendor.phone,
      website: vendor.website,
      rating: vendor.rating,
    },
    category: link.category as EventVendorRow["category"],
    status: link.status,
    notes: link.notes,
    contractCount: byVendor.get(link.id) ?? 0,
  }));
}

export function adminEventVendorRoutes(deps: AdminDeps) {
  const { db, storage } = deps;
  const app = new Hono<EventAdminEnv>();
  const one = "/:eventVendorId{[0-9]+}";
  const contract = `${one}/contracts/:contractId{[0-9]+}`;
  const vendorName = "Fornecedor";

  const findLink = async (ev: EventCtx, id: number) => {
    const [row] = await db
      .select()
      .from(eventVendors)
      .where(and(eq(eventVendors.id, id), byEvent(eventVendors, ev)));
    return row;
  };

  app.get("/", requirePermission("vendors.read"), async (c) => {
    return c.json({ vendors: await listEventVendors(db, c.get("event")) });
  });

  app.post("/", requirePermission("vendors.write"), async (c) => {
    const ev = c.get("event");
    const parsed = EventVendorInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    // Fornecedor novo no catálogo da organização: o anfitrião só liga um que já existe.
    if (input.vendor && !can(c.get("eventRole"), "vendors.catalog", c.get("hostDeny"))) {
      return apiError(
        c,
        403,
        ERROR_CODES.unauthorized,
        "Só a organização cadastra fornecedores novos no catálogo. Escolha um que já exista.",
      );
    }
    const bad = await categoriesProblem(
      db,
      ev.orgId,
      [input.category, input.vendor?.category].filter((k): k is string => k !== undefined),
      { allowArchived: false },
    );
    if (bad) return invalid(c, [{ message: bad }]);
    let document: string | null = null;
    let catalogCategory = input.vendor?.category;
    if (input.vendor) {
      const d = normalizeDocument(input.vendor.document);
      if (d === "invalid") return invalid(c, [{ message: INVALID_DOCUMENT }]);
      document = d;
    } else {
      // Fornecedor de outra organização: 404, como se não existisse.
      const found = await findVendor(db, ev.orgId, input.vendorId!);
      if (!found) return notFound(c, vendorName);
      if (found.archivedAt) {
        return invalid(c, [{ message: "Este fornecedor está arquivado no catálogo." }]);
      }
      catalogCategory = found.category as typeof catalogCategory;
    }
    try {
      const id = await db.transaction(async (tx) => {
        let vendorId = input.vendorId;
        if (input.vendor) {
          const [res] = await tx
            .insert(vendors)
            .values({ organizationId: ev.orgId, ...vendorValues(input.vendor, document) });
          vendorId = res.insertId;
        }
        const [res] = await tx.insert(eventVendors).values({
          eventId: ev.id,
          organizationId: ev.orgId,
          vendorId: vendorId!,
          category: input.category ?? catalogCategory!,
          status: input.status,
          notes: input.notes,
        });
        return res.insertId;
      });
      return c.json({ vendor: (await listEventVendors(db, ev, id))[0] }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return apiError(c, 409, ERROR_CODES.conflict, "Este fornecedor já está neste evento.");
      }
      throw err;
    }
  });

  app.patch(one, requirePermission("vendors.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("eventVendorId"));
    const parsed = EventVendorUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    if (!(await findLink(ev, id))) return notFound(c, vendorName);
    const bad = await categoriesProblem(
      db,
      ev.orgId,
      parsed.data.category ? [parsed.data.category] : [],
    );
    if (bad) return invalid(c, [{ message: bad }]);
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(changes).length) {
      await db
        .update(eventVendors)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(eventVendors.id, id), byEvent(eventVendors, ev)));
    }
    return c.json({ vendor: (await listEventVendors(db, ev, id))[0] });
  });

  app.delete(one, requirePermission("vendors.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("eventVendorId"));
    if (!(await findLink(ev, id))) return notFound(c, vendorName);
    const [hired] = await db
      .select({ n: count() })
      .from(quotes)
      .where(
        and(byEvent(quotes, ev), eq(quotes.eventVendorId, id), eq(quotes.status, "contracted")),
      );
    if (Number(hired?.n ?? 0) > 0) {
      return apiError(
        c,
        409,
        ERROR_CODES.conflict,
        "Este fornecedor tem orçamento contratado e não pode sair do evento.",
      );
    }
    const files = await db
      .select({ file: vendorContracts.file })
      .from(vendorContracts)
      .where(and(byEvent(vendorContracts, ev), eq(vendorContracts.eventVendorId, id)));
    await db.transaction(async (tx) => {
      // O cronograma guarda o fornecedor sem FK: a aplicação anula.
      await tx
        .update(scheduleItems)
        .set({ eventVendorId: null })
        .where(and(byEvent(scheduleItems, ev), eq(scheduleItems.eventVendorId, id)));
      await tx.delete(eventVendors).where(and(eq(eventVendors.id, id), byEvent(eventVendors, ev)));
    });
    await Promise.all(files.map((f) => storage.deletePrivate(ev.id, f.file)));
    return c.json({ ok: true });
  });

  app.get(`${one}/contracts`, requirePermission("vendors.read"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("eventVendorId"));
    if (!(await findLink(ev, id))) return notFound(c, vendorName);
    const rows = await db
      .select()
      .from(vendorContracts)
      .where(and(byEvent(vendorContracts, ev), eq(vendorContracts.eventVendorId, id)))
      .orderBy(asc(vendorContracts.createdAt), asc(vendorContracts.id));
    return c.json({ contracts: rows.map((r) => contractRow(ev, r)) });
  });

  const tooBig = `O contrato pode ter até ${CONTRACT_MAX_BYTES / (1024 * 1024)} MB.`;
  app.post(
    `${one}/contracts`,
    requirePermission("vendors.write"),
    sensitiveLimit(deps.limiter, "contract-upload"),
    bodyLimit({
      maxSize: CONTRACT_MAX_BYTES + 64 * 1024,
      onError: (c) => apiError(c, 413, ERROR_CODES.invalidRequest, tooBig),
    }),
    async (c) => {
      const ev = c.get("event");
      const id = Number(c.req.param("eventVendorId"));
      if (!(await findLink(ev, id))) return notFound(c, vendorName);
      let form: Record<string, unknown>;
      try {
        form = await c.req.parseBody();
      } catch {
        form = {};
      }
      const file = form["file"];
      if (!(file instanceof File)) {
        return invalid(c, [{ message: "Escolha o arquivo do contrato." }]);
      }
      if (file.size > CONTRACT_MAX_BYTES) {
        return apiError(c, 413, ERROR_CODES.invalidRequest, tooBig);
      }
      const meta = ContractMeta.safeParse({
        title: form["title"],
        signedOn: form["signedOn"] || null,
        notes: form["notes"],
      });
      if (!meta.success) return invalid(c, meta.error.issues);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = sniffContract(bytes);
      if (!ext || bytes.byteLength === 0) {
        return invalid(c, [{ message: "Formato não aceito. Envie PDF, JPG, PNG ou WebP." }]);
      }
      const limit = await checkPlanLimit(db, ev.orgId, {
        kind: "storageMb",
        addingBytes: bytes.byteLength,
      });
      if (!limit.ok) return planLimitResponse(c, limit);
      const name = `${newPublicId()}.${ext}`;
      await storage.putPrivate(ev.id, name, bytes);
      try {
        const [res] = await db.insert(vendorContracts).values({
          eventId: ev.id,
          eventVendorId: id,
          title: meta.data.title,
          file: name,
          originalName: cleanFileName(file.name),
          mime: CONTRACT_MIME_BY_EXT[ext],
          bytes: bytes.byteLength,
          signedOn: meta.data.signedOn,
          notes: meta.data.notes,
          uploadedBy: c.get("user").id,
        });
        const [row] = await db
          .select()
          .from(vendorContracts)
          .where(and(eq(vendorContracts.id, res.insertId), byEvent(vendorContracts, ev)));
        // O próximo upload já vê o espaço novo (a rotina de uso recalcula pelo disco depois).
        await addStorageUsage(db, ev.orgId, bytes.byteLength);
        return c.json({ contract: contractRow(ev, row!) }, 201);
      } catch (err) {
        await storage.deletePrivate(ev.id, name);
        throw err;
      }
    },
  );

  const findContract = async (ev: EventCtx, id: number, contractId: number) => {
    const [row] = await db
      .select()
      .from(vendorContracts)
      .where(
        and(
          eq(vendorContracts.id, contractId),
          eq(vendorContracts.eventVendorId, id),
          byEvent(vendorContracts, ev),
        ),
      );
    return row;
  };

  app.get(`${contract}/file`, requirePermission("vendors.read"), async (c) => {
    const ev = c.get("event");
    const row = await findContract(
      ev,
      Number(c.req.param("eventVendorId")),
      Number(c.req.param("contractId")),
    );
    if (!row) return notFound(c, "Contrato");
    const bytes = await storage.getPrivate(ev.id, row.file);
    if (!bytes) return notFound(c, "Arquivo do contrato");
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": attachment(row.originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
  });

  app.delete(contract, requirePermission("vendors.write"), async (c) => {
    const ev = c.get("event");
    const row = await findContract(
      ev,
      Number(c.req.param("eventVendorId")),
      Number(c.req.param("contractId")),
    );
    if (!row) return notFound(c, "Contrato");
    await db
      .delete(vendorContracts)
      .where(and(eq(vendorContracts.id, row.id), byEvent(vendorContracts, ev)));
    await storage.deletePrivate(ev.id, row.file);
    return c.json({ ok: true });
  });

  return app;
}
