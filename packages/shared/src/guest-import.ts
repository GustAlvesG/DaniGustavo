import type { AgeRange } from "./rsvp.ts";

/*
 * Importação de convidados (CSV ou XLSX) e listas para buffet, cerimonial e portaria.
 * Uma linha por pessoa; linhas com o mesmo "convite" formam um convite só.
 */

export interface ImportColumn {
  /** Nome recomendado do cabeçalho. */
  key: string;
  required: boolean;
  /** Outros cabeçalhos aceitos (comparados sem acento, maiúsculas, espaços ou pontuação). */
  aliases: string[];
  help: string;
}

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: "convite",
    required: true,
    aliases: ["grupo", "familia", "nome do convite"],
    help: "Nome do convite como aparece para o convidado (ex.: Família Silva). Linhas com o mesmo convite viram um convite só.",
  },
  {
    key: "lado",
    required: true,
    aliases: [],
    help: "Dani ou Gustavo.",
  },
  {
    key: "nome",
    required: true,
    aliases: ["convidado", "nome do convidado"],
    help: "Nome da pessoa.",
  },
  {
    key: "tipo",
    required: false,
    aliases: ["adulto/criança", "adulto ou criança"],
    help: "adulto ou criança (vazio = adulto).",
  },
  {
    key: "faixa_etaria",
    required: false,
    aliases: ["faixa", "idade", "faixa etária"],
    help: "Só para criança: 0-2, 3-7 ou 8-12.",
  },
  {
    key: "telefone",
    required: false,
    aliases: ["whatsapp", "celular", "fone"],
    help: "Com DDD. O primeiro telefone do convite vira o WhatsApp do convite.",
  },
  {
    key: "email",
    required: false,
    aliases: ["e-mail"],
    help: "O primeiro e-mail do convite recebe a confirmação da resposta.",
  },
  {
    key: "acompanhante",
    required: false,
    aliases: ["pode levar acompanhante", "+1", "mais um"],
    help: "sim ou não (vazio = não). Basta marcar em uma linha do convite.",
  },
  {
    key: "max_pessoas",
    required: false,
    aliases: ["máximo de pessoas", "maximo", "max"],
    help: "Máximo de pessoas do convite (vazio = número de convidados, +1 se aceita acompanhante).",
  },
  {
    key: "restricao_alimentar",
    required: false,
    aliases: ["restrição", "restricoes", "restrições alimentares"],
    help: "Opcional. Alergia é dado de saúde: usado só pelo buffet.",
  },
];

/** Limites do arquivo de importação. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;

export interface ImportGuestPreview {
  /** Linha da planilha (1 = cabeçalho). */
  line: number;
  name: string;
  isChild: boolean;
  ageRange: AgeRange | null;
  phone: string | null;
  email: string | null;
  dietaryNotes: string | null;
}

export interface ImportInvitationPreview {
  label: string;
  side: "dani" | "gustavo";
  maxGuests: number;
  allowPlusOne: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
  guests: ImportGuestPreview[];
  /** Já existe um convite com esse nome no painel: será ignorado. */
  duplicate: boolean;
}

export interface ImportRowPreview {
  line: number;
  invitation: string;
  name: string;
  side: string;
  type: string;
  errors: string[];
  /** O convite já existe no painel (a linha será ignorada). */
  duplicate: boolean;
}

export interface ImportPreview {
  fileName: string;
  format: "csv" | "xlsx";
  /** Erro que impede ler o arquivo inteiro (ex.: coluna obrigatória faltando). */
  fileError: string | null;
  rows: ImportRowPreview[];
  invitations: ImportInvitationPreview[];
  errorCount: number;
  warnings: string[];
  toCreate: { invitations: number; guests: number };
  duplicates: { invitations: number; guests: number };
}

export interface ImportResult {
  /** IDs dos convites criados (para imprimir os QR em seguida). */
  ids: number[];
  created: { invitations: number; guests: number };
  skipped: { invitations: number; guests: number };
}

/* ------------------------------------------------------------------ listas */

export const GUEST_LIST_KINDS = ["buffet", "cerimonial", "portaria"] as const;
export type GuestListKind = (typeof GUEST_LIST_KINDS)[number];

export interface GuestList {
  kind: GuestListKind;
  title: string;
  /** Explicação curta do uso da lista (impressa no topo). */
  note: string;
  columns: string[];
  rows: string[][];
  /** Totais (ex.: "Adultos" → "82"). */
  summary: { label: string; value: string }[];
  generatedAt: string;
}
