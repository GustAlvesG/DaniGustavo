"use client";

import { useActionState } from "react";
import { PRIVACY_REQUEST_KIND_LABELS, PRIVACY_REQUEST_KINDS } from "@casamento/shared";
import {
  sendPrivacyRequest,
  type PrivacyRequestState,
} from "@/app/[host]/(site)/privacidade/actions";
import { Button, FieldError, Select, TextArea, TextField } from "@/components/ui";

const idle: PrivacyRequestState = { status: "idle" };

/**
 * Pedido do titular (LGPD): ver, corrigir ou apagar os próprios dados. `useActionState` +
 * <form action> funciona até sem JavaScript; honeypot escondido como no mural.
 */
export function PrivacyRequestForm() {
  const [state, action, pending] = useActionState(sendPrivacyRequest, idle);

  if (state.status === "sent") {
    return (
      <div role="status" data-testid="privacidade-enviado" className="flex flex-col gap-3">
        <h3 className="titulo m-0 text-2xl">Pedido recebido</h3>
        <p className="m-0 max-w-[56ch] text-ink">
          Quem organiza o evento vai responder no e-mail que você informou, em até 15 dias.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  const values = error?.values ?? { kind: "access", name: "", email: "", message: "" };
  return (
    <form action={action} noValidate className="flex flex-col gap-6" data-testid="privacidade-form">
      <div
        className="flex flex-col gap-6"
        key={`${values.kind}|${values.name}|${values.email}|${values.message}`}
      >
        <Select
          name="kind"
          label="O que você quer pedir"
          defaultValue={values.kind}
          error={error?.field === "kind" ? error.message : undefined}
        >
          {PRIVACY_REQUEST_KINDS.map((k) => (
            <option key={k} value={k}>
              {PRIVACY_REQUEST_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <TextField
          name="name"
          label="Seu nome"
          autoComplete="name"
          maxLength={191}
          defaultValue={values.name}
          error={error?.field === "name" ? error.message : undefined}
          required
        />
        <TextField
          name="email"
          type="email"
          inputMode="email"
          label="Seu e-mail"
          hint="A resposta vai para este e-mail."
          autoComplete="email"
          maxLength={191}
          defaultValue={values.email}
          error={error?.field === "email" ? error.message : undefined}
          required
        />
        <TextArea
          name="message"
          label="Conte um pouco mais"
          optional
          rows={4}
          maxLength={2000}
          defaultValue={values.message}
          error={error?.field === "message" ? error.message : undefined}
        />
      </div>

      {/* Honeypot: fora da tela e do teclado; só robôs preenchem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div aria-live="polite">
        {error && !error.field ? <FieldError>{error.message}</FieldError> : null}
      </div>

      <div>
        <Button type="submit" size="lg" loading={pending}>
          Enviar pedido
        </Button>
      </div>
    </form>
  );
}
