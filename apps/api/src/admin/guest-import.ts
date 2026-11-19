import { guests, invitations, newPublicId, type Database } from "@casamento/db";
import type { EventCtx } from "../tenancy/types.ts";
import {
  AdminInvitationInput,
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  type AgeRange,
  type ImportInvitationPreview,
  type ImportPreview,
  type ImportResult,
  type ImportRowPreview,
} from "@casamento/shared";
import { readSpreadsheet, SpreadsheetError } from "./spreadsheet.ts";

/*
 * Importação de convidados: lê a planilha, valida linha a linha (mensagens em pt-BR),
 * agrupa por convite e marca como duplicado o convite cujo nome já existe no painel
 * (reimportar o mesmo arquivo não duplica nada). A prévia e a confirmação usam a mesma
 * função; a confirmação só grava se não houver erro.
 */

/** Compara sem acento, maiúsculas, espaços e pontuação. */
export const foldKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");

/** Nome comparável (sem acento, espaços colapsados). */
const foldName = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

const HEADER_MAP = new Map<string, ColumnKey>();
for (const col of IMPORT_COLUMNS) {
  for (const name of [col.key, ...col.aliases]) HEADER_MAP.set(foldKey(name), col.key);
}

const YES = new Set(["sim", "s", "x", "1", "true", "verdadeiro", "yes"]);
const NO = new Set(["nao", "n", "0", "false", "falso", "no", ""]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAge(raw: string): AgeRange | null | "invalid" {
  const k = foldKey(raw).replace(/anos?$/, "");
  if (!k) return null;
  if (["02", "0a2", "ate2"].includes(k)) return "0-2";
  if (["37", "3a7"].includes(k)) return "3-7";
  if (["812", "8a12"].includes(k)) return "8-12";
  return "invalid";
}

interface ParsedRow {
  line: number;
  invitation: string;
  side: "dani" | "gustavo" | null;
  name: string;
  isChild: boolean;
  ageRange: AgeRange | null;
  phone: string | null;
  email: string | null;
  plusOne: boolean;
  maxGuests: number | null;
  dietaryNotes: string | null;
  errors: string[];
  raw: { side: string; type: string };
}

const q = (s: string) => `“${s}”`;

function parseRow(line: number, get: (k: ColumnKey) => string): ParsedRow {
  const errors: string[] = [];
  const invitation = get("convite").replace(/\s+/g, " ");
  const name = get("nome").replace(/\s+/g, " ");
  const sideRaw = get("lado");
  const typeRaw = get("tipo");

  if (!invitation) errors.push("Falta o nome do convite (coluna convite).");
  else if (invitation.length < 2) errors.push("Nome do convite: informe pelo menos 2 letras.");
  else if (invitation.length > 191) errors.push("Nome do convite: use até 191 caracteres.");

  if (!name) errors.push("Falta o nome do convidado (coluna nome).");
  else if (name.length < 2) errors.push("Nome do convidado: informe pelo menos 2 letras.");
  else if (name.length > 191) errors.push("Nome do convidado: use até 191 caracteres.");

  const sideKey = foldKey(sideRaw);
  const side = sideKey === "dani" ? "dani" : sideKey === "gustavo" ? "gustavo" : null;
  if (!sideRaw) errors.push("Falta o lado (coluna lado): use Dani ou Gustavo.");
  else if (!side) errors.push(`Lado ${q(sideRaw)} não reconhecido: use Dani ou Gustavo.`);

  const typeKey = foldKey(typeRaw);
  let isChild = false;
  if (["crianca", "c", "infantil"].includes(typeKey)) isChild = true;
  else if (!["", "adulto", "a"].includes(typeKey)) {
    errors.push(`Tipo ${q(typeRaw)} não reconhecido: use adulto ou criança.`);
  }

  const ageRaw = get("faixa_etaria");
  const age = parseAge(ageRaw);
  let ageRange: AgeRange | null = null;
  if (age === "invalid") {
    errors.push(`Faixa etária ${q(ageRaw)} não reconhecida: use 0-2, 3-7 ou 8-12.`);
  } else if (isChild && !age) {
    errors.push("Criança precisa da faixa etária: 0-2, 3-7 ou 8-12.");
  } else if (!isChild && age) {
    errors.push("Faixa etária só vale para criança: marque o tipo como criança ou apague a faixa.");
  } else ageRange = age;

  const phone = get("telefone") || null;
  if (phone && phone.length > 32) errors.push("Telefone: use até 32 caracteres.");
  else if (phone && phone.replace(/\D/g, "").length < 8) {
    errors.push(`Telefone ${q(phone)} incompleto: informe com DDD.`);
  }

  const email = get("email").toLowerCase() || null;
  if (email && (!EMAIL.test(email) || email.length > 191)) {
    errors.push(`E-mail ${q(email)} inválido.`);
  }

  const plusRaw = get("acompanhante");
  const plusKey = foldKey(plusRaw);
  const plusOne = YES.has(plusKey);
  if (!plusOne && !NO.has(plusKey)) {
    errors.push(`Acompanhante ${q(plusRaw)}: use sim ou não.`);
  }

  const maxRaw = get("max_pessoas");
  let maxGuests: number | null = null;
  if (maxRaw) {
    const n = Number(maxRaw.replace(",", "."));
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      errors.push(`Máximo de pessoas ${q(maxRaw)}: use um número inteiro de 1 a 30.`);
    } else maxGuests = n;
  }

  const dietaryNotes = get("restricao_alimentar") || null;
  if (dietaryNotes && dietaryNotes.length > 500) {
    errors.push("Restrição alimentar: use até 500 caracteres.");
  }

  return {
    line,
    invitation,
    side,
    name,
    isChild,
    ageRange,
    phone,
    email,
    plusOne,
    maxGuests,
    dietaryNotes,
    errors,
    raw: { side: sideRaw, type: typeRaw },
  };
}

export interface ImportPlan {
  preview: ImportPreview;
  /** Convites prontos para gravar (sem duplicados), só quando não há erro. */
  create: { input: ReturnType<typeof AdminInvitationInput.parse> }[];
}

function emptyPreview(fileName: string, format: "csv" | "xlsx", fileError: string): ImportPreview {
  return {
    fileName,
    format,
    fileError,
    rows: [],
    invitations: [],
    errorCount: 1,
    warnings: [],
    toCreate: { invitations: 0, guests: 0 },
    duplicates: { invitations: 0, guests: 0 },
  };
}

/** Lê o arquivo e monta a prévia; `existing` = convites já no painel (para duplicados). */
export function planImport(
  fileName: string,
  bytes: Uint8Array,
  existing: { label: string; guestNames: string[] }[],
): ImportPlan {
  const guessedFormat = /\.xlsx$/i.test(fileName) ? "xlsx" : "csv";
  let sheet: { format: "csv" | "xlsx"; rows: string[][] };
  try {
    sheet = readSpreadsheet(bytes);
  } catch (e) {
    const msg =
      e instanceof SpreadsheetError ? e.message : "Não deu para ler o arquivo. Confira o formato.";
    return { preview: emptyPreview(fileName, guessedFormat, msg), create: [] };
  }
  const { format, rows } = sheet;
  const fail = (msg: string) => ({ preview: emptyPreview(fileName, format, msg), create: [] });

  const headerIndex = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIndex < 0) return fail("A planilha está vazia.");
  const header = rows[headerIndex]!;
  const warnings: string[] = [];
  const colIndex = new Map<ColumnKey, number>();
  header.forEach((h, i) => {
    const key = HEADER_MAP.get(foldKey(h));
    if (key && !colIndex.has(key)) colIndex.set(key, i);
    else if (h.trim()) warnings.push(`Coluna ${q(h.trim())} não reconhecida: foi ignorada.`);
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !colIndex.has(c.key));
  if (missing.length) {
    return fail(
      `Faltam colunas obrigatórias: ${missing.map((c) => c.key).join(", ")}. ` +
        "A primeira linha deve ter os nomes das colunas (baixe o modelo).",
    );
  }

  const body = rows
    .map((cells, i) => ({ cells, line: i + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((c) => c.trim() !== ""));
  if (body.length === 0) return fail("A planilha só tem o cabeçalho: nenhum convidado.");
  if (body.length > IMPORT_MAX_ROWS) {
    return fail(`Até ${IMPORT_MAX_ROWS} convidados por arquivo. Divida a planilha.`);
  }

  const parsed = body.map(({ cells, line }) =>
    parseRow(line, (k) => {
      const i = colIndex.get(k);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    }),
  );

  // Agrupa por convite (nome sem acento/maiúsculas) e valida o grupo.
  const groups = new Map<string, ParsedRow[]>();
  for (const r of parsed) {
    if (!r.invitation) continue;
    const key = foldName(r.invitation);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const existingByLabel = new Map(existing.map((e) => [foldName(e.label), e]));
  const existingGuest = new Map<string, string>();
  for (const e of existing) for (const n of e.guestNames) existingGuest.set(foldName(n), e.label);

  const invitationsOut: ImportInvitationPreview[] = [];
  const create: ImportPlan["create"] = [];
  const duplicateKeys = new Set<string>();

  for (const [key, list] of groups) {
    const first = list[0]!;
    const label = first.invitation;
    const dup = existingByLabel.get(key);
    if (dup) {
      duplicateKeys.add(key);
      warnings.push(
        `O convite ${q(dup.label)} já existe no painel: as linhas ${list.map((r) => r.line).join(", ")} serão ignoradas.`,
      );
    }
    const side = list.find((r) => r.side)?.side ?? null;
    for (const r of list) {
      if (r.side && side && r.side !== side) {
        r.errors.push(
          `O convite ${q(label)} está com lados diferentes (veja a linha ${first.line}).`,
        );
      }
    }
    const seen = new Map<string, number>();
    for (const r of list) {
      if (!r.name) continue;
      const n = foldName(r.name);
      const prev = seen.get(n);
      if (prev !== undefined) {
        r.errors.push(`${q(r.name)} aparece duas vezes no convite ${q(label)} (linha ${prev}).`);
      } else seen.set(n, r.line);
      if (!dup && existingGuest.has(n)) {
        warnings.push(
          `Linha ${r.line}: ${q(r.name)} já está no convite ${q(existingGuest.get(n)!)} do painel. Confira se não é a mesma pessoa.`,
        );
      }
    }
    const allowPlusOne = list.some((r) => r.plusOne);
    const maxValues = [...new Set(list.map((r) => r.maxGuests).filter((n) => n !== null))];
    if (maxValues.length > 1) {
      list[list.length - 1]!.errors.push(
        `O convite ${q(label)} tem máximos de pessoas diferentes (${maxValues.join(" e ")}).`,
      );
    }
    const maxGuests = maxValues[0] ?? Math.min(30, list.length + (allowPlusOne ? 1 : 0));
    if (list.length > 30) {
      list[30]!.errors.push(`O convite ${q(label)} passa de 30 convidados.`);
    } else if (maxGuests < list.length) {
      list[list.length - 1]!.errors.push(
        `O convite ${q(label)} tem ${list.length} convidados, mas o máximo de pessoas é ${maxGuests}.`,
      );
    }

    const preview: ImportInvitationPreview = {
      label,
      side: side ?? "dani",
      maxGuests,
      allowPlusOne,
      contactPhone: list.find((r) => r.phone)?.phone ?? null,
      contactEmail: list.find((r) => r.email)?.email ?? null,
      guests: list.map((r) => ({
        line: r.line,
        name: r.name,
        isChild: r.isChild,
        ageRange: r.ageRange,
        phone: r.phone,
        email: r.email,
        dietaryNotes: r.dietaryNotes,
      })),
      duplicate: !!dup,
    };
    invitationsOut.push(preview);

    if (!dup && list.every((r) => r.errors.length === 0)) {
      // Última barreira: o mesmo contrato do formulário do painel.
      const input = AdminInvitationInput.safeParse({
        label: preview.label,
        side: preview.side,
        maxGuests: preview.maxGuests,
        allowPlusOne: preview.allowPlusOne,
        contactEmail: preview.contactEmail,
        contactPhone: preview.contactPhone,
        guests: preview.guests.map((g) => ({
          name: g.name,
          isChild: g.isChild,
          ageRange: g.ageRange,
          dietaryNotes: g.dietaryNotes,
          phone: g.phone,
          email: g.email,
        })),
      });
      if (input.success) create.push({ input: input.data });
      else first.errors.push(input.error.issues[0]?.message ?? "Convite inválido.");
    }
  }

  const rowsOut: ImportRowPreview[] = parsed.map((r) => ({
    line: r.line,
    invitation: r.invitation,
    name: r.name,
    side: r.raw.side,
    type: r.isChild
      ? `Criança${r.ageRange ? ` (${r.ageRange})` : ""}`
      : ["", "adulto", "a"].includes(foldKey(r.raw.type))
        ? "Adulto"
        : r.raw.type,
    errors: r.errors,
    duplicate: duplicateKeys.has(foldName(r.invitation)),
  }));
  const errorCount = rowsOut.reduce((n, r) => n + r.errors.length, 0);
  const dupInvs = invitationsOut.filter((i) => i.duplicate);

  return {
    preview: {
      fileName,
      format,
      fileError: null,
      rows: rowsOut,
      invitations: invitationsOut,
      errorCount,
      warnings,
      toCreate:
        errorCount > 0
          ? { invitations: 0, guests: 0 }
          : {
              invitations: create.length,
              guests: create.reduce((n, c) => n + c.input.guests.length, 0),
            },
      duplicates: {
        invitations: dupInvs.length,
        guests: dupInvs.reduce((n, i) => n + i.guests.length, 0),
      },
    },
    create: errorCount > 0 ? [] : create,
  };
}

/** Grava os convites do plano numa transação só (tudo ou nada). */
export async function applyImport(
  ev: EventCtx,
  db: Database,
  plan: ImportPlan,
  moment: Date,
): Promise<ImportResult> {
  const ids: number[] = [];
  await db.transaction(async (tx) => {
    for (const { input } of plan.create) {
      const [res] = await tx.insert(invitations).values({
        eventId: ev.id,
        token: newPublicId(),
        label: input.label,
        side: input.side,
        maxGuests: input.maxGuests,
        allowPlusOne: input.allowPlusOne,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        createdAt: moment,
        updatedAt: moment,
      });
      ids.push(res.insertId);
      await tx.insert(guests).values(
        input.guests.map((g) => ({
          eventId: ev.id,
          invitationId: res.insertId,
          name: g.name,
          isChild: g.isChild,
          ageRange: g.isChild ? g.ageRange : null,
          rsvpStatus: "pending" as const,
          dietaryNotes: g.dietaryNotes,
          phone: g.phone,
          email: g.email,
          createdAt: moment,
          updatedAt: moment,
        })),
      );
    }
  });
  return {
    ids,
    created: {
      invitations: plan.create.length,
      guests: plan.create.reduce((n, c) => n + c.input.guests.length, 0),
    },
    skipped: plan.preview.duplicates,
  };
}
