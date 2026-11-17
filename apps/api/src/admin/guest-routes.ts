import { guests, invitations } from "@casamento/db";
import { IMPORT_COLUMNS, IMPORT_MAX_BYTES } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { apiError, ERROR_CODES } from "../errors.ts";
import { invalid, sensitiveLimit, type AdminDeps, type AdminEnv } from "./context.ts";
import { applyImport, planImport } from "./guest-import.ts";
import { buildGuestList, isGuestListKind } from "./guest-lists.ts";
import { toCsv } from "./invitations.ts";
import { buildXlsx } from "./spreadsheet.ts";

/** Linhas de exemplo do modelo de importação (mesma ordem de IMPORT_COLUMNS). */
export const TEMPLATE_ROWS: string[][] = [
  IMPORT_COLUMNS.map((c) => c.key),
  [
    "Família Silva",
    "Dani",
    "Ana Silva",
    "adulto",
    "",
    "(24) 99999-0001",
    "ana@exemplo.com",
    "não",
    "",
    "",
  ],
  ["Família Silva", "Dani", "Bruno Silva", "adulto", "", "", "", "não", "", "Vegetariano"],
  ["Família Silva", "Dani", "Lia Silva", "criança", "3-7", "", "", "não", "", ""],
  ["Carlos Souza", "Gustavo", "Carlos Souza", "adulto", "", "(21) 98888-0002", "", "sim", "", ""],
];

const tooBig = `O arquivo passa de ${IMPORT_MAX_BYTES / 1024 / 1024} MB. Divida a planilha.`;

async function readUpload(c: Context<AdminEnv>) {
  let file: unknown;
  try {
    file = (await c.req.parseBody())["file"];
  } catch {
    file = undefined;
  }
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name || "planilha", bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** /api/admin/invitations/import — prévia, confirmação e modelos. */
export function adminImportRoutes(deps: AdminDeps) {
  const { db, now } = deps;
  const app = new Hono<AdminEnv>();
  const limit = bodyLimit({
    maxSize: IMPORT_MAX_BYTES + 64 * 1024,
    onError: (c) => apiError(c, 413, ERROR_CODES.invalidRequest, tooBig),
  });

  const existing = async () => {
    const [invs, gs] = await Promise.all([
      db.select({ id: invitations.id, label: invitations.label }).from(invitations),
      db.select({ invitationId: guests.invitationId, name: guests.name }).from(guests),
    ]);
    return invs.map((i) => ({
      label: i.label,
      guestNames: gs.filter((g) => g.invitationId === i.id).map((g) => g.name),
    }));
  };

  const handle = (commit: boolean) => async (c: Context<AdminEnv>) => {
    const upload = await readUpload(c);
    if (!upload) return invalid(c, [{ message: "Escolha um arquivo CSV ou XLSX para importar." }]);
    if (upload.bytes.length > IMPORT_MAX_BYTES) {
      return apiError(c, 413, ERROR_CODES.invalidRequest, tooBig);
    }
    const plan = planImport(upload.name, upload.bytes, await existing());
    if (!commit) return c.json({ preview: plan.preview });
    const p = plan.preview;
    if (p.fileError) return invalid(c, [{ message: p.fileError }]);
    if (p.errorCount > 0) {
      return invalid(c, [
        {
          message: `A planilha tem ${p.errorCount} ${p.errorCount === 1 ? "erro" : "erros"}. Corrija e envie de novo.`,
        },
      ]);
    }
    if (plan.create.length === 0) {
      return invalid(c, [
        { message: "Nada novo para importar: todos os convites da planilha já estão no painel." },
      ]);
    }
    const result = await applyImport(db, plan, now());
    return c.json({ result }, 201);
  };

  app.post("/preview", limit, handle(false));
  app.post("/", sensitiveLimit(deps.limiter, "import"), limit, handle(true));

  app.get("/modelo.csv", (c) =>
    c.body(toCsv(TEMPLATE_ROWS), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-convidados.csv"',
    }),
  );
  app.get("/modelo.xlsx", (c) =>
    c.body(buildXlsx(TEMPLATE_ROWS), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-convidados.xlsx"',
    }),
  );
  return app;
}

/** /api/admin/invitations/lists/:kind — buffet, cerimonial e portaria (JSON ou CSV). */
export function adminGuestListRoutes(deps: AdminDeps) {
  const app = new Hono<AdminEnv>();
  app.get("/:kind", async (c) => {
    const raw = c.req.param("kind");
    const csv = raw.endsWith(".csv");
    const kind = raw.replace(/\.csv$/, "");
    if (!isGuestListKind(kind)) {
      return apiError(c, 404, ERROR_CODES.notFound, "Lista não encontrada.");
    }
    const list = await buildGuestList(deps.db, kind, deps.now());
    if (!csv) return c.json({ list });
    return c.body(toCsv([list.columns, ...list.rows]), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lista-${kind}.csv"`,
    });
  });
  return app;
}
