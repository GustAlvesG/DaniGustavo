"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "@/app/plataforma/cadastro/actions";
import { Button, Checkbox, FieldError, Select, TextField } from "@/components/ui";
import type { SignupState } from "./signup-state";

const idle: SignupState = { status: "idle" };

export interface SignupPlanOption {
  code: string;
  label: string;
}

/**
 * Formulário de cadastro: nome, e-mail, organização, plano e aceite dos termos. Honeypot
 * escondido. `useActionState` + `<form action>` funciona até sem JavaScript.
 */
export function SignupForm({
  plans,
  initialPlan,
}: {
  plans: SignupPlanOption[];
  initialPlan: string;
}) {
  const [state, action, pending] = useActionState(signupAction, idle);

  if (state.status === "sent") {
    return (
      <div className="plataforma-card" role="status" data-testid="cadastro-enviado">
        <h2 className="font-display text-display-sm">Confira o seu e-mail</h2>
        <p className="mt-4">
          Se estiver tudo certo, chega em instantes um e-mail para <strong>{state.email}</strong>{" "}
          com o link para confirmar o cadastro e escolher a sua senha. O link vale por 24 horas.
        </p>
        <p className="mt-3 text-suave">
          Não chegou? Olhe a caixa de spam ou promoções. Se já tiver conta, o e-mail traz o caminho
          para entrar.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  const values = error?.values ?? {
    name: "",
    email: "",
    organizationName: "",
    planCode: initialPlan,
  };
  const fieldError = (f: string) => (error?.field === f ? error.message : undefined);

  return (
    <form
      action={action}
      noValidate
      className="plataforma-card flex flex-col gap-6"
      data-testid="cadastro-form"
    >
      <div className="flex flex-col gap-6" key={JSON.stringify(values)}>
        <TextField
          name="name"
          label="Seu nome"
          autoComplete="name"
          maxLength={191}
          defaultValue={values.name}
          error={fieldError("name")}
          required
        />
        <TextField
          name="email"
          type="email"
          label="Seu e-mail"
          autoComplete="email"
          maxLength={191}
          defaultValue={values.email}
          error={fieldError("email")}
          hint="É para ele que vai o link de confirmação."
          required
        />
        <TextField
          name="organizationName"
          label="Nome do casal, da família ou da sua empresa"
          autoComplete="organization"
          maxLength={191}
          defaultValue={values.organizationName}
          error={fieldError("organizationName")}
          hint="Ex.: Ana & Bruno, ou Cerimonial Flor de Laranjeira."
          required
        />
        {plans.length > 0 ? (
          <Select name="planCode" label="Plano" defaultValue={values.planCode}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </Select>
        ) : null}
        <Checkbox
          name="acceptTerms"
          required
          error={fieldError("acceptTerms")}
          label={
            <span>
              Li e aceito os{" "}
              <Link href="/termos" className="underline" target="_blank">
                termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="underline" target="_blank">
                política de privacidade
              </Link>
              .
            </span>
          }
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
          Criar minha conta
        </Button>
      </div>
    </form>
  );
}
