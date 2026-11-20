import { and, asc, byEvent, eq, guests, invitations, type Database } from "@casamento/db";
import {
  GUEST_LIST_KINDS,
  sideLabel,
  vocabularyFor,
  VocabularyOverrides,
  type GuestList,
  type GuestListKind,
} from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";
import { eventSides } from "./event-config.ts";
import { readSetting } from "./event-settings.ts";

/*
 * Listas dos confirmados para os fornecedores. Restrição alimentar é dado de saúde (LGPD):
 * vai para o buffet e o cerimonial (que coordena o serviço), nunca para a portaria.
 */

const AGE_LABEL: Record<string, string> = {
  "0-2": "0 a 2 anos",
  "3-7": "3 a 7 anos",
  "8-12": "8 a 12 anos",
};

export const isGuestListKind = (k: string): k is GuestListKind =>
  (GUEST_LIST_KINDS as readonly string[]).includes(k);

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export async function buildGuestList(
  ev: EventCtx,
  db: Database,
  kind: GuestListKind,
  now: Date,
): Promise<GuestList> {
  const rows = await db
    .select({
      name: guests.name,
      isChild: guests.isChild,
      ageRange: guests.ageRange,
      isPlusOne: guests.isPlusOne,
      dietaryNotes: guests.dietaryNotes,
      phone: guests.phone,
      label: invitations.label,
      side: invitations.side,
      contactPhone: invitations.contactPhone,
    })
    .from(guests)
    .innerJoin(invitations, and(eq(guests.invitationId, invitations.id), byEvent(invitations, ev)))
    .where(and(byEvent(guests, ev), eq(guests.rsvpStatus, "confirmed")))
    .orderBy(asc(invitations.label), asc(guests.isPlusOne), asc(guests.id));

  const sides = await eventSides(ev, db);
  const sideWord = vocabularyFor(
    ev.type,
    VocabularyOverrides.parse((await readSetting(ev, db, "event.vocabulary")) ?? {}),
  ).sideLabel;
  const type = (g: (typeof rows)[number]) => (g.isChild ? "Criança" : "Adulto");
  const age = (g: (typeof rows)[number]) => (g.ageRange ? (AGE_LABEL[g.ageRange] ?? "") : "");
  const adults = rows.filter((g) => !g.isChild).length;
  const kids = (r: string) => rows.filter((g) => g.isChild && g.ageRange === r).length;
  const generatedAt = now.toISOString();

  if (kind === "buffet") {
    return {
      kind,
      title: "Lista do buffet",
      note: "Confirmados com restrições alimentares. Alergia é dado de saúde: use só para preparar o cardápio e não repasse.",
      columns: ["Convidado", "Convite", "Adulto/criança", "Faixa etária", "Restrição alimentar"],
      rows: rows.map((g) => [g.name, g.label, type(g), age(g), g.dietaryNotes ?? ""]),
      summary: [
        { label: "Pessoas", value: String(rows.length) },
        { label: "Adultos", value: String(adults) },
        { label: "Crianças 0 a 2", value: String(kids("0-2")) },
        { label: "Crianças 3 a 7", value: String(kids("3-7")) },
        { label: "Crianças 8 a 12", value: String(kids("8-12")) },
        { label: "Com restrição", value: String(rows.filter((g) => g.dietaryNotes).length) },
      ],
      generatedAt,
    };
  }

  if (kind === "cerimonial") {
    const invs = new Set(rows.map((g) => g.label));
    return {
      kind,
      title: "Lista do cerimonial",
      note: "Confirmados por convite, com contato e restrições alimentares (dado de saúde: só para combinar o serviço com o buffet).",
      columns: [
        "Convite",
        sideWord,
        "Convidado",
        "Adulto/criança",
        "Faixa etária",
        "Acompanhante",
        "Restrição alimentar",
        "Telefone",
      ],
      rows: rows.map((g) => [
        g.label,
        sideLabel(sides, g.side),
        g.name,
        type(g),
        age(g),
        g.isPlusOne ? "Sim" : "",
        g.dietaryNotes ?? "",
        g.phone ?? g.contactPhone ?? "",
      ]),
      summary: [
        { label: "Convites", value: String(invs.size) },
        { label: "Pessoas", value: String(rows.length) },
        ...sides.map((side) => ({
          label: `${sideWord} ${side.label}`,
          value: String(rows.filter((g) => g.side === side.key).length),
        })),
        { label: "Crianças", value: String(rows.length - adults) },
      ],
      generatedAt,
    };
  }

  const sorted = [...rows].sort((a, b) => collator.compare(a.name, b.name));
  return {
    kind,
    title: "Lista da portaria",
    note: "Confirmados em ordem alfabética. Sem telefone nem restrições: a portaria só confere nomes.",
    columns: ["Convidado", "Convite", "Adulto/criança", "Chegou"],
    rows: sorted.map((g) => [g.name, g.label, type(g), ""]),
    summary: [
      { label: "Pessoas", value: String(rows.length) },
      { label: "Adultos", value: String(adults) },
      { label: "Crianças", value: String(rows.length - adults) },
    ],
    generatedAt,
  };
}
