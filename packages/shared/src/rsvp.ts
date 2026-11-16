import { z } from "zod";

export const RSVP_STATUSES = ["pending", "confirmed", "declined"] as const;
export const RsvpStatus = z.enum(RSVP_STATUSES);
export type RsvpStatus = z.infer<typeof RsvpStatus>;

export const AGE_RANGES = ["0-2", "3-7", "8-12"] as const;
export const AgeRange = z.enum(AGE_RANGES);
export type AgeRange = z.infer<typeof AgeRange>;

export const InvitationGuest = z.object({
  /** ID do convidado, válido só dentro deste convite (a escrita confere o convite). */
  id: z.number().int().positive(),
  name: z.string(),
  isChild: z.boolean(),
  ageRange: AgeRange.nullable(),
  /** Acompanhante (+1) informado pelo próprio convidado. */
  isPlusOne: z.boolean(),
  rsvpStatus: RsvpStatus,
  dietaryNotes: z.string().nullable(),
});
export type InvitationGuest = z.infer<typeof InvitationGuest>;

/** Resposta de GET /api/invitations/{token}. */
export const Invitation = z.object({
  label: z.string(),
  side: z.enum(["dani", "gustavo"]),
  maxGuests: z.number().int().positive(),
  allowPlusOne: z.boolean(),
  guests: z.array(InvitationGuest),
  contact: z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
  deadline: z.iso.datetime({ offset: true }),
  isClosed: z.boolean(),
});
export type Invitation = z.infer<typeof Invitation>;

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const RsvpGuestAnswer = z.object({
  id: z.number().int().positive({ error: "Convidado inválido." }),
  attending: z.boolean({ error: "Diga se cada convidado vai ou não." }),
  /** Dado sensível (saúde): opcional, só o buffet usa. */
  dietaryNotes: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(500, { error: "Restrição alimentar: use até 500 caracteres." })
      .nullable()
      .optional(),
  ),
});
export type RsvpGuestAnswer = z.infer<typeof RsvpGuestAnswer>;

/** Corpo de PUT /api/invitations/{token}/rsvp. */
export const RsvpRequest = z.object({
  /** Uma resposta para cada convidado do convite. */
  guests: z.array(RsvpGuestAnswer).min(1, { error: "Responda por pelo menos um convidado." }),
  /** Nome do acompanhante (+1), só em convites que permitem. O corpo descreve o estado final: omitir, null ou vazio remove o acompanhante. */
  plusOneName: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(2, { error: "Nome do acompanhante: informe nome e sobrenome." })
      .max(120, { error: "Nome do acompanhante: use até 120 caracteres." })
      .nullable()
      .optional(),
  ),
  /** Omitir mantém o contato atual; null apaga. */
  contact: z
    .object({
      email: z.preprocess(
        emptyToNull,
        z
          .email({ error: "E-mail inválido. Confira se tem @ e o domínio." })
          .max(191)
          .nullable()
          .optional(),
      ),
      phone: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(32, { error: "Telefone: use até 32 caracteres." })
          .regex(/^[0-9+()\-\s]{8,}$/, { error: "Telefone inválido. Use DDD e número." })
          .nullable()
          .optional(),
      ),
    })
    .optional(),
  /** Honeypot: campo escondido no formulário. Se vier preenchido, a API finge sucesso. */
  website: z.string().optional(),
});
export type RsvpRequest = z.infer<typeof RsvpRequest>;

/** Resposta de PUT /api/invitations/{token}/rsvp: o convite já atualizado. */
export const RsvpResponse = z.object({
  ok: z.literal(true),
  invitation: Invitation,
});
export type RsvpResponse = z.infer<typeof RsvpResponse>;

/** Corpo de POST /api/invitations/lookup. */
export const LookupRequest = z.object({
  firstName: z.string().trim().min(1, { error: "Informe o primeiro nome." }).max(80),
  lastName: z.string().trim().min(1, { error: "Informe o sobrenome." }).max(80),
  /** Honeypot. */
  website: z.string().optional(),
});
export type LookupRequest = z.infer<typeof LookupRequest>;

/** Resposta de POST /api/invitations/lookup: só token e rótulo dos convites encontrados. */
export const LookupResponse = z.object({
  matches: z.array(z.object({ token: z.string().length(26), label: z.string() })).min(1),
});
export type LookupResponse = z.infer<typeof LookupResponse>;
