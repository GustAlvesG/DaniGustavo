"use client";

import { useActionState, useState } from "react";
import { MESSAGE_AUTHOR_MAX_CHARS, MESSAGE_MAX_CHARS } from "@casamento/shared";
import { sendMessageAction, type MessageState } from "@/app/(site)/recados/actions";
import { Button, FieldError, TextArea, TextField } from "@/components/ui";
import { paginas } from "@/content/paginas";
import styles from "./recados.module.css";

const idle: MessageState = { status: "idle" };

/**
 * "Deixe um recado": nome e mensagem, sem presente. Entra como pendente. Honeypot escondido,
 * contador de caracteres e aviso curto de privacidade. `useActionState` + <form action>
 * funciona até sem JavaScript (como um POST de formulário do Laravel).
 */
export function RecadoForm() {
  const [state, action, pending] = useActionState(sendMessageAction, idle);
  const t = paginas.recados;
  const values = state.status === "error" ? state.values : { author: "", body: "" };
  const [length, setLength] = useState(values.body.length);

  if (state.status === "sent") {
    return (
      <div className={styles.caixa} id="escrever">
        <div className={styles.obrigado} role="status" data-testid="recado-enviado">
          <h3 className={styles.caixaTitulo}>{t.enviadoTitulo}</h3>
          <p>{t.enviadoTexto}</p>
        </div>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  return (
    <div className={styles.caixa} id="escrever">
      <h2 className={styles.caixaTitulo}>{t.formTitulo}</h2>
      <p className={styles.caixaLead}>{t.formLead}</p>
      <form action={action} noValidate className="flex flex-col gap-6" data-testid="recado-form">
        {/* A key refaz os campos com o que a pessoa digitou (o React limpa o form após a ação). */}
        <div className="flex flex-col gap-6" key={`${values.author}|${values.body}`}>
          <TextField
            name="author"
            label="Seu nome"
            autoComplete="name"
            maxLength={MESSAGE_AUTHOR_MAX_CHARS}
            defaultValue={values.author}
            error={error?.field === "author" ? error.message : undefined}
            required
          />
          <div>
            <TextArea
              name="body"
              label="Seu recado"
              rows={5}
              maxLength={MESSAGE_MAX_CHARS}
              defaultValue={values.body}
              onChange={(e) => setLength(e.target.value.length)}
              error={error?.field === "body" ? error.message : undefined}
              required
            />
            <p className={styles.contador} aria-hidden="true">
              {length}/{MESSAGE_MAX_CHARS}
            </p>
          </div>
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
            {t.formBotao}
          </Button>
        </div>
        <p className="m-0 text-sm text-ink-soft">{t.privacidade}</p>
      </form>
    </div>
  );
}
