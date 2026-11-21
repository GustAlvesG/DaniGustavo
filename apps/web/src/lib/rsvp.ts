/**
 * Regras puras do formulário de RSVP (sem React, sem servidor): valores do
 * formulário ↔ contrato `RsvpRequest` de @casamento/shared. Ficam aqui para
 * serem testadas no Vitest.
 */
import {
  CONSENT_REQUIRED_MESSAGE,
  RsvpRequest,
  type Invitation,
  type InvitationGuest,
  type RsvpStatus,
} from "@casamento/shared";
import type { z } from "zod";

export type Answer = "yes" | "no" | "";

export type GuestFormValue = {
  id: number;
  attending: Answer;
  dietaryNotes: string;
};

export type RsvpFormValues = {
  guests: GuestFormValue[];
  plusOneName: string;
  email: string;
  phone: string;
  /** Fase 6 (LGPD): aceite do aviso de privacidade. */
  consent: boolean;
  /** Honeypot: pessoas não veem o campo, robôs preenchem. */
  website: string;
};

/** Convidados que respondem um a um (o acompanhante +1 é só um nome). */
export function namedGuests(invitation: Invitation): InvitationGuest[] {
  return invitation.guests.filter((g) => !g.isPlusOne);
}

export function plusOneGuest(invitation: Invitation): InvitationGuest | undefined {
  return invitation.guests.find((g) => g.isPlusOne);
}

export function answerFromStatus(status: RsvpStatus): Answer {
  return status === "confirmed" ? "yes" : status === "declined" ? "no" : "";
}

/** Valores iniciais: respostas e contato já gravados aparecem preenchidos. */
export function initialValues(invitation: Invitation): RsvpFormValues {
  return {
    guests: namedGuests(invitation).map((g) => ({
      id: g.id,
      attending: answerFromStatus(g.rsvpStatus),
      dietaryNotes: g.dietaryNotes ?? "",
    })),
    plusOneName: plusOneGuest(invitation)?.name ?? "",
    email: invitation.contact.email ?? "",
    phone: invitation.contact.phone ?? "",
    consent: invitation.consent?.given ?? false,
    website: "",
  };
}

/** Já existe alguma resposta gravada (revisita)? */
export function hasAnswered(invitation: Invitation): boolean {
  return namedGuests(invitation).some((g) => g.rsvpStatus !== "pending");
}

export function attendingCount(guests: readonly Pick<GuestFormValue, "attending">[]): number {
  return guests.filter((g) => g.attending === "yes").length;
}

/** O convite permite acompanhante e ainda há lugar para ele? */
export function plusOneAvailable(invitation: Invitation, attending: number): boolean {
  return invitation.allowPlusOne && attending >= 1 && attending + 1 <= invitation.maxGuests;
}

const clean = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** Monta o corpo de PUT /rsvp: descreve o estado final do convite. */
export function toRsvpRequest(values: RsvpFormValues, invitation: Invitation): RsvpRequest {
  const attending = attendingCount(values.guests);
  const plusOne = plusOneAvailable(invitation, attending) ? clean(values.plusOneName) : null;
  return {
    guests: values.guests.map((g) => ({
      id: g.id,
      attending: g.attending === "yes",
      dietaryNotes: g.attending === "yes" ? clean(g.dietaryNotes) : null,
    })),
    plusOneName: plusOne,
    contact: { email: clean(values.email), phone: clean(values.phone) },
    ...(values.consent ? { consent: true } : {}),
    website: values.website,
  };
}

/* Mensagens de validação: reaproveitam os schemas zod do contrato. */

const contactShape = RsvpRequest.shape.contact.unwrap().shape;

/** Primeira mensagem de erro do schema para o valor, ou `true` se válido (formato do `validate` do react-hook-form). */
export function check(schema: z.ZodType, value: unknown): string | true {
  const parsed = schema.safeParse(value);
  return parsed.success ? true : (parsed.error.issues[0]?.message ?? "Valor inválido.");
}

export const validateEmail = (value: string) => check(contactShape.email, value);
export const validatePhone = (value: string) => check(contactShape.phone, value);
export const validateDietary = (value: string) =>
  check(RsvpRequest.shape.guests.element.shape.dietaryNotes, value);
export const validatePlusOneName = (value: string) => check(RsvpRequest.shape.plusOneName, value);

/** O evento exige o aceite? (A caixa já vem marcada se o convite aceitou a versão atual.) */
export function consentNeeded(invitation: Invitation): boolean {
  return !!invitation.consent?.required;
}

export const validateConsent = (value: boolean): string | true =>
  value ? true : CONSENT_REQUIRED_MESSAGE;

export function validateAnswer(value: Answer, name: string): string | true {
  return value === "yes" || value === "no"
    ? true
    : `Diga se ${name} vai ou não. Escolha uma das opções.`;
}
