import { z } from "zod";

/*
 * Tipos de evento, vocabulário e lados dos convites (Fase 2).
 *
 * O tipo (`events.type`) decide os padrões: palavras do site e do painel, módulos ligados e
 * tema. Cada evento pode trocar palavras (`event.vocabulary`) e lados (`event.sides`) no
 * painel; o que não foi trocado vem do dicionário do tipo.
 */

/** Mesma lista de `EVENT_TYPES` em `@casamento/db` (schema/tenancy.ts). */
export const EVENT_TYPES = [
  "wedding",
  "fifteen",
  "birthday",
  "baby_shower",
  "corporate",
  "other",
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

/** Nome do tipo no painel. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Casamento",
  fifteen: "15 anos",
  birthday: "Aniversário",
  baby_shower: "Chá de bebê",
  corporate: "Evento corporativo",
  other: "Outro",
};

/** Tipo gravado no banco (varchar) → tipo conhecido; desconhecido vira "other". */
export function eventTypeOf(raw: string | null | undefined): EventType {
  return (EVENT_TYPES as readonly string[]).includes(raw ?? "") ? (raw as EventType) : "other";
}

/* ------------------------------------------------------------------------ */
/* Vocabulário                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Palavras que mudam com o tipo de evento. Valores com maiúscula inicial quando abrem frase
 * ou título; o site e o painel não montam plural/gênero por conta própria, usam a chave certa.
 */
export const VOCABULARY_KEYS = [
  /** Seção principal e item do menu: "O casamento", "A festa". */
  "eventLabel",
  /** Substantivo no meio da frase: "casamento", "festa de 15 anos". */
  "eventNoun",
  /** Quem recebe: "os noivos", "a debutante" (meio de frase). */
  "hosts",
  /** Linha acima dos nomes no topo do site. */
  "heroKicker",
  /** Título da contagem regressiva. */
  "countdownTitle",
  /** Mensagem no dia, depois do horário. */
  "countdownToday",
  /** Mensagem depois do evento ({data} = data do evento). */
  "countdownAfter",
  /** Grupo de honra no plural: "Padrinhos", "Corte"; vazio = o tipo não tem (módulo desligado). */
  "godparents",
  /** Título da página do grupo de honra: "Manual dos padrinhos". */
  "godparentsPage",
  /** Rótulo da divisão dos convidados no painel: "Lado", "Grupo". */
  "sideLabel",
] as const;
export type VocabularyKey = (typeof VOCABULARY_KEYS)[number];

export const Vocabulary = z.object(
  Object.fromEntries(VOCABULARY_KEYS.map((k) => [k, z.string().max(120)])) as Record<
    VocabularyKey,
    z.ZodString
  >,
);
export type Vocabulary = z.infer<typeof Vocabulary>;

/** O que o evento trocou (`event_settings` › `event.vocabulary`); chave ausente = do tipo. */
export const VocabularyOverrides = Vocabulary.partial();
export type VocabularyOverrides = z.infer<typeof VocabularyOverrides>;

const NEUTRAL_COUNTDOWN = {
  countdownTitle: "Faltam para o grande dia",
  countdownToday: "É hoje! Nos vemos lá.",
  countdownAfter: "A festa foi em {data}. Obrigado por fazer parte.",
} satisfies Partial<Vocabulary>;

/** Dicionário por tipo (pt-BR). */
export const VOCABULARY: Record<EventType, Vocabulary> = {
  wedding: {
    eventLabel: "O casamento",
    eventNoun: "casamento",
    hosts: "os noivos",
    heroKicker: "Vamos nos casar",
    countdownTitle: "Faltam para o nosso sim",
    countdownToday: "É hoje! Nos vemos no altar.",
    countdownAfter: "Casamos em {data}. Obrigado por fazer parte.",
    godparents: "Padrinhos",
    godparentsPage: "Manual dos padrinhos",
    sideLabel: "Lado",
  },
  fifteen: {
    eventLabel: "A festa",
    eventNoun: "festa de 15 anos",
    hosts: "a debutante",
    heroKicker: "Meus 15 anos",
    ...NEUTRAL_COUNTDOWN,
    godparents: "Corte",
    godparentsPage: "Manual da corte",
    sideLabel: "Grupo",
  },
  birthday: {
    eventLabel: "A festa",
    eventNoun: "aniversário",
    hosts: "o aniversariante",
    heroKicker: "Vem comemorar comigo",
    ...NEUTRAL_COUNTDOWN,
    godparents: "",
    godparentsPage: "",
    sideLabel: "Grupo",
  },
  baby_shower: {
    eventLabel: "O chá",
    eventNoun: "chá de bebê",
    hosts: "os papais",
    heroKicker: "Vem aí um bebê",
    ...NEUTRAL_COUNTDOWN,
    countdownAfter: "O chá foi em {data}. Obrigado por fazer parte.",
    godparents: "",
    godparentsPage: "",
    sideLabel: "Grupo",
  },
  corporate: {
    eventLabel: "O evento",
    eventNoun: "evento",
    hosts: "a organização",
    heroKicker: "Você está convidado",
    countdownTitle: "Faltam para o evento",
    countdownToday: "É hoje! Nos vemos lá.",
    countdownAfter: "O evento foi em {data}. Obrigado pela presença.",
    godparents: "",
    godparentsPage: "",
    sideLabel: "Grupo",
  },
  other: {
    eventLabel: "O evento",
    eventNoun: "evento",
    hosts: "os anfitriões",
    heroKicker: "Você é nosso convidado",
    ...NEUTRAL_COUNTDOWN,
    countdownAfter: "O evento foi em {data}. Obrigado por fazer parte.",
    godparents: "",
    godparentsPage: "",
    sideLabel: "Grupo",
  },
};

/** Vocabulário final do evento: dicionário do tipo + o que o evento trocou. */
export function vocabularyFor(type: string, overrides?: VocabularyOverrides | null): Vocabulary {
  const base = VOCABULARY[eventTypeOf(type)];
  const out: Vocabulary = { ...base };
  for (const key of VOCABULARY_KEYS) {
    const v = overrides?.[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Lados dos convites                                                        */
/* ------------------------------------------------------------------------ */

export const SIDE_KEY_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Um lado (`invitations.side` guarda a `key`). */
export const SideOption = z.object({
  key: z.string().regex(SIDE_KEY_PATTERN, {
    error: "Código do lado: minúsculas, números e -, até 32.",
  }),
  label: z.string().trim().min(1, { error: "Nome do lado: obrigatório." }).max(40),
});
export type SideOption = z.infer<typeof SideOption>;

/** `event_settings` › `event.sides` (privado): 1 a 6 lados, chaves únicas. */
export const EventSides = z
  .array(SideOption)
  .min(1, { error: "Defina pelo menos um lado." })
  .max(6, { error: "Até 6 lados." })
  .refine((list) => new Set(list.map((s) => s.key)).size === list.length, {
    error: "Há dois lados com o mesmo código.",
  });
export type EventSides = z.infer<typeof EventSides>;

/** Lados de um evento sem `event.sides` gravado. */
export function defaultSides(type: string): EventSides {
  switch (eventTypeOf(type)) {
    case "wedding":
      return [
        { key: "noiva", label: "Noiva" },
        { key: "noivo", label: "Noivo" },
      ];
    case "fifteen":
    case "birthday":
      return [
        { key: "familia", label: "Família" },
        { key: "amigos", label: "Amigos" },
      ];
    default:
      return [{ key: "geral", label: "Convidados" }];
  }
}

/** Rótulo de uma chave de lado (chave desconhecida aparece como está). */
export function sideLabel(sides: readonly SideOption[], key: string): string {
  return sides.find((s) => s.key === key)?.label ?? key;
}
