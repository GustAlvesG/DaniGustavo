import { and, byEvent, eq, newPublicId, vendorContracts } from "@casamento/db";
import {
  CONTRACT_MAX_BYTES,
  VendorPortalDocumentInput,
  VendorPortalQuoteInput,
} from "@casamento/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { invalid, notFound, readJson, type AdminDeps } from "../admin/context.ts";
import { BudgetError, createQuote } from "../budget/service.ts";
import { apiError, ERROR_CODES, errorBody } from "../errors.ts";
import { addStorageUsage, checkPlanLimit, planLimitResponse } from "../plans/limits.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import {
  portalDocument,
  portalDocuments,
  portalMe,
  portalQuotes,
  portalSchedule,
  portalTasks,
  toPortalDocument,
} from "../vendor-portal/service.ts";
import { requirePortalLink, type PortalEnv } from "../vendor-portal/session.ts";
import {
  attachment,
  cleanFileName,
  CONTRACT_MIME_BY_EXT,
  sniffContract,
} from "../vendors/files.ts";

/*
 * Fase 7, frente C (docs/saas/fase-7.md): portal do fornecedor, sem conta, em
 * /api/vendor-portal. Isento de X-Web-Key (web-key.ts): o navegador do fornecedor chama com
 * `Authorization: Bearer <token do link>` (sem cookie, sem CSRF). Link achado pelo SHA-256 do
 * token dentro de `crossEvent`; inexistente/expirado/revogado → o mesmo 401; rate limit por IP
 * (e 429 depois de muitos tokens recusados). Daí em diante tudo filtra pelo evento e pelo
 * `event_vendor_id` do link (vendor-portal/session.ts).
 *
 * - GET  /me                         → VendorPortalMe
 * - GET  /schedule                   → VendorPortalSchedule (itens dos outros sem detalhes)
 * - GET  /tasks                      → { tasks: VendorPortalTask[] }
 * - GET  /quotes                     → { quotes: VendorPortalQuote[] } (só os dele)
 * - POST /quotes                     VendorPortalQuoteInput → { quote } ("received", portal;
 *   total calculado aqui)
 * - GET  /documents                  → { documents: VendorPortalDocument[] }
 * - POST /documents                  multipart (file + title + notes) → { document } (tipo pelos
 *   bytes, CONTRACT_MAX_BYTES, limite de espaço do plano; área privada do Storage)
 * - GET  /documents/:documentId/file → arquivo (attachment + nosniff; só os do fornecedor)
 */

const MINUTE = 60_000;
/** Envios (orçamentos + documentos) por link a cada 10 minutos. */
export const VENDOR_PORTAL_WRITE_LIMIT = 20;

export function vendorPortalRoutes(deps: AdminDeps) {
  const { db, storage, limiter } = deps;
  const app = new Hono<PortalEnv>();
  app.use(
    "*",
    requirePortalLink({
      db,
      limiter,
      resolver: resolverFor(db, deps.eventResolver),
      now: deps.now,
    }),
  );

  const writeLimited = (c: Context, linkId: number) => {
    const r = limiter.hit(`vendor-portal:write:${linkId}`, VENDOR_PORTAL_WRITE_LIMIT, 10 * MINUTE);
    if (r.allowed) return null;
    return apiError(
      c,
      429,
      ERROR_CODES.tooManyRequests,
      `Muitos envios seguidos. Aguarde ${r.retryAfter} segundos e tente de novo.`,
      { "Retry-After": String(r.retryAfter) },
    );
  };

  app.get("/me", async (c) => c.json(await portalMe(db, c.get("portal"))));
  app.get("/schedule", async (c) => c.json(await portalSchedule(db, c.get("portal"))));
  app.get("/tasks", async (c) => c.json({ tasks: await portalTasks(db, c.get("portal")) }));
  app.get("/quotes", async (c) => c.json({ quotes: await portalQuotes(db, c.get("portal")) }));

  app.post("/quotes", async (c) => {
    const p = c.get("portal");
    const parsed = VendorPortalQuoteInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const blocked = writeLimited(c, p.linkId);
    if (blocked) return blocked;
    const input = parsed.data;
    try {
      // Categoria = a do fornecedor no evento; o total sai dos itens, nunca do navegador.
      const created = await createQuote(
        { db, now: deps.now },
        p.ev,
        {
          eventVendorId: p.eventVendorId,
          title: input.title,
          discountCents: input.discountCents,
          validUntil: input.validUntil,
          notes: input.notes,
          items: input.items,
        },
        { portalLinkId: p.linkId },
      );
      const [quote] = await portalQuotes(db, p, created.id);
      return c.json({ quote }, 201);
    } catch (err) {
      if (err instanceof BudgetError) {
        const code = err.status === 404 ? ERROR_CODES.notFound : ERROR_CODES.invalidRequest;
        return c.json(errorBody(code, err.message, err.field), err.status);
      }
      throw err;
    }
  });

  app.get("/documents", async (c) => {
    const rows = await portalDocuments(db, c.get("portal"));
    return c.json({ documents: rows.map(toPortalDocument) });
  });

  const tooBig = `O documento pode ter até ${CONTRACT_MAX_BYTES / (1024 * 1024)} MB.`;
  app.post(
    "/documents",
    bodyLimit({
      maxSize: CONTRACT_MAX_BYTES + 64 * 1024,
      onError: (c) => apiError(c, 413, ERROR_CODES.invalidRequest, tooBig),
    }),
    async (c) => {
      const p = c.get("portal");
      const ev = p.ev;
      let form: Record<string, unknown>;
      try {
        form = await c.req.parseBody();
      } catch {
        form = {};
      }
      const file = form["file"];
      if (!(file instanceof File)) return invalid(c, [{ message: "Escolha o arquivo." }]);
      if (file.size > CONTRACT_MAX_BYTES) {
        return apiError(c, 413, ERROR_CODES.invalidRequest, tooBig);
      }
      const meta = VendorPortalDocumentInput.safeParse({
        title: form["title"],
        notes: form["notes"],
      });
      if (!meta.success) return invalid(c, meta.error.issues);
      const blocked = writeLimited(c, p.linkId);
      if (blocked) return blocked;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = bytes.byteLength > 0 ? sniffContract(bytes) : null;
      if (!ext) {
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
          eventVendorId: p.eventVendorId,
          title: meta.data.title,
          file: name,
          originalName: cleanFileName(file.name),
          mime: CONTRACT_MIME_BY_EXT[ext],
          bytes: bytes.byteLength,
          notes: meta.data.notes,
          uploadedBy: null,
          source: "portal",
          portalLinkId: p.linkId,
        });
        const [row] = await db
          .select()
          .from(vendorContracts)
          .where(and(byEvent(vendorContracts, ev), eq(vendorContracts.id, res.insertId)));
        // O próximo envio já vê o espaço novo (a rotina de uso recalcula pelo disco depois).
        await addStorageUsage(db, ev.orgId, bytes.byteLength);
        return c.json({ document: toPortalDocument(row!) }, 201);
      } catch (err) {
        await storage.deletePrivate(ev.id, name);
        throw err;
      }
    },
  );

  app.get("/documents/:documentId{[0-9]+}/file", async (c) => {
    const p = c.get("portal");
    const row = await portalDocument(db, p, Number(c.req.param("documentId")));
    if (!row) return notFound(c, "Documento");
    const bytes = await storage.getPrivate(p.ev.id, row.file);
    if (!bytes) return notFound(c, "Arquivo do documento");
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": attachment(row.originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
  });

  return app;
}
