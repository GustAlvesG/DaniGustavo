"use client";

import { useActionState } from "react";
import Link from "next/link";
import { lookupInvitation, type LookupState } from "@/app/(site)/confirmar/actions";
import { Button, TextField } from "@/components/ui";
import { ContactLinks, type CoupleContact } from "./ContactLinks";

const idle: LookupState = { status: "idle" };

/*
 * Formulário simples de dois campos: `useActionState` + <form action> basta
 * (funciona até sem JS, como um form POST do Laravel). O RSVP, com 3 etapas,
 * usa react-hook-form; veja RsvpForm.
 */
export function LookupForm({ contact }: { contact: CoupleContact }) {
  const [state, action, pending] = useActionState(lookupInvitation, idle);

  const values = state.status === "idle" ? { firstName: "", lastName: "" } : state.values;
  const invalid = state.status === "invalid";
  const firstError = invalid && values.firstName.trim() === "" ? state.message : undefined;
  const lastError =
    invalid && values.lastName.trim() === "" && !firstError ? state.message : undefined;

  return (
    <div className="flex flex-col gap-8">
      <form action={action} noValidate className="flex flex-col gap-6" data-testid="lookup-form">
        {/* A key refaz os campos com o que a pessoa digitou (o React limpa o form após a ação). */}
        <div className="grid gap-6 sm:grid-cols-2" key={`${values.firstName}|${values.lastName}`}>
          <TextField
            name="firstName"
            label="Primeiro nome"
            autoComplete="given-name"
            defaultValue={values.firstName}
            error={firstError}
            required
          />
          <TextField
            name="lastName"
            label="Sobrenome"
            autoComplete="family-name"
            defaultValue={values.lastName}
            error={lastError}
            required
          />
        </div>

        {/* Honeypot: fora da tela e do teclado; só robôs preenchem. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Não preencha este campo
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div>
          <Button type="submit" size="lg" loading={pending}>
            Buscar convite
          </Button>
        </div>
      </form>

      {/* Região viva: o resultado é anunciado sem tirar o foco do formulário. */}
      <div aria-live="polite" role="status" data-testid="lookup-result">
        {state.status === "not_found" ? (
          <div className="flex flex-col gap-2 border-l-2 border-danger pl-5">
            <p className="text-lg text-ink">
              Não encontramos esse nome. Confira a grafia ou fale com os noivos.
            </p>
            <p className="text-sm text-ink-soft">
              Use o nome e o sobrenome como estão no convite. Acentos não fazem diferença.
            </p>
            <ContactLinks contact={contact} />
          </div>
        ) : null}

        {state.status === "rate_limited" || state.status === "error" ? (
          <p className="border-l-2 border-danger pl-5 text-lg text-ink">{state.message}</p>
        ) : null}

        {state.status === "choose" ? (
          <div className="flex flex-col gap-3">
            <p className="text-lg text-ink">Encontramos mais de um convite. Qual é o seu?</p>
            <ul className="flex flex-col">
              {state.matches.map((m) => (
                <li key={m.token} className="border-t border-line-soft last:border-b">
                  <Link
                    href={`/c/${m.token}`}
                    className="flex min-h-14 items-center py-2 text-lg text-accent underline underline-offset-[0.22em]"
                  >
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="max-w-[56ch] text-sm text-ink-soft">
        Privacidade: usamos seu nome só para achar o seu convite. Ao confirmar, guardamos presença,
        contato e restrições alimentares apenas para organizar a festa, e apagamos esses dados
        depois do casamento.
      </p>
    </div>
  );
}
