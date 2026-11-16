"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useForm, useWatch } from "react-hook-form";
import type { Invitation } from "@casamento/shared";
import { submitRsvp, type RsvpActionResult } from "@/app/(site)/c/[token]/actions";
import { Tile, type TileDesign } from "@/components/tiles";
import { Button, ButtonLink, Radio, RadioGroup, TextField } from "@/components/ui";
import {
  attendingCount,
  hasAnswered,
  initialValues,
  namedGuests,
  plusOneAvailable,
  toRsvpRequest,
  validateAnswer,
  validateDietary,
  validateEmail,
  validatePhone,
  validatePlusOneName,
  type RsvpFormValues,
} from "@/lib/rsvp";
import { formatDayMonth } from "@/lib/site";

/*
 * Por que react-hook-form (e não só useActionState): são 3 etapas que
 * compartilham um único estado (respostas, restrições, contato), com
 * validação por etapa e valores pré-preenchidos. O RHF guarda tudo isso e
 * valida com as regras do schema zod do contrato; no fim chamamos a Server
 * Action `submitRsvp` com o corpo pronto.
 */

const STEPS = ["Quem vai", "Detalhes", "Revisão"] as const;
type StepIndex = 0 | 1 | 2;

const EASE = [0.22, 1, 0.36, 1] as const;
const TILE_ROTATION: TileDesign[] = ["rosa", "flor", "estrela", "ramo", "onda", "monograma"];

type Props = { token: string; invitation: Invitation };

export function RsvpForm({ token, invitation }: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<StepIndex>(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [navigated, setNavigated] = useState(false);
  const [done, setDone] = useState<Invitation | null>(null);
  const [failure, setFailure] = useState<Extract<RsvpActionResult, { ok: false }> | null>(null);
  const [pending, startTransition] = useTransition();

  const named = namedGuests(invitation);
  const form = useForm<RsvpFormValues>({
    defaultValues: initialValues(invitation),
    mode: "onTouched",
  });
  const { register, trigger, getValues, control, formState } = form;
  const watched = useWatch({ control, name: "guests" });
  const attending = attendingCount(watched);
  const canPlusOne = plusOneAvailable(invitation, attending);

  const announcement = done
    ? done.guests.some((g) => g.rsvpStatus === "confirmed")
      ? "Presença confirmada."
      : "Resposta enviada."
    : `Etapa ${step + 1} de ${STEPS.length}: ${STEPS[step]}.`;

  function go(next: StepIndex) {
    setDirection(next > step ? 1 : -1);
    setNavigated(true);
    setFailure(null);
    setStep(next);
  }

  async function stepFields(): Promise<boolean> {
    if (step === 0) {
      const fields = named.map((_, i) => `guests.${i}.attending` as const);
      return trigger(canPlusOne ? [...fields, "plusOneName"] : fields);
    }
    if (step === 1) {
      const fields = named.flatMap((_, i) =>
        watched[i]?.attending === "yes" ? [`guests.${i}.dietaryNotes` as const] : [],
      );
      return trigger([...fields, "email", "phone"]);
    }
    return true;
  }

  /* Radios: ao escolher, o erro some na hora (e não só no blur, que moveria o layout entre o mousedown e o mouseup do próximo clique). */
  function answerProps(i: number, name: string) {
    const field = `guests.${i}.attending` as const;
    return register(field, {
      validate: (v) => validateAnswer(v, name),
      onChange: () => void trigger(field),
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); // Enter num campo não envia antes da revisão.
    if (pending) return;
    if (!(await stepFields())) return;
    if (step < 2) {
      go((step + 1) as StepIndex);
      return;
    }
    setFailure(null);
    startTransition(async () => {
      const result = await submitRsvp(token, toRsvpRequest(getValues(), invitation));
      if (result.ok) {
        setDirection(1);
        setNavigated(true);
        setDone(result.invitation);
      } else {
        setFailure(result);
      }
    });
  }

  const slide = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -40 }),
  };

  return (
    <form onSubmit={onSubmit} noValidate data-testid="rsvp-form" className="flex flex-col gap-6">
      {/* Região viva: anuncia a etapa e o resultado para leitores de tela. */}
      <p role="status" aria-live="polite" className="sr-only" data-testid="rsvp-announce">
        {announcement}
      </p>

      {/* Honeypot: fora da tela e do teclado; só robôs preenchem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>

      {/* Folga lateral para o anel de foco não ser cortado pelo clip da transição. */}
      <div className="-mx-2 overflow-x-clip px-2">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={done ? "feito" : step}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.16 : 0.32, ease: EASE }}
          >
            {done ? (
              <DoneStep
                invitation={done}
                reduce={!!reduce}
                onChange={() => {
                  setDone(null);
                  setDirection(-1);
                  setStep(0);
                }}
              />
            ) : step === 0 ? (
              <StepShell step={0} focus={navigated}>
                {hasAnswered(invitation) ? (
                  <p className="text-base text-ink-soft" data-testid="rsvp-revisit">
                    Você já respondeu. Pode mudar o que quiser até{" "}
                    {formatDayMonth(invitation.deadline)}.
                  </p>
                ) : null}
                <div className="flex flex-col">
                  {named.map((g, i) => (
                    <div key={g.id} className="border-t border-line-soft py-3 last:border-b">
                      <RadioGroup
                        orientation="horizontal"
                        legend={g.name}
                        hint={g.isChild ? childHint(g.ageRange) : undefined}
                        error={formState.errors.guests?.[i]?.attending?.message}
                      >
                        <Radio label="Vai" value="yes" {...answerProps(i, g.name)} />
                        <Radio label="Não vai" value="no" {...answerProps(i, g.name)} />
                      </RadioGroup>
                    </div>
                  ))}
                </div>
                {invitation.allowPlusOne ? (
                  canPlusOne ? (
                    <TextField
                      label="Acompanhante"
                      optional
                      hint="Nome e sobrenome de quem vai com você. Deixe em branco se for sozinho."
                      autoComplete="off"
                      error={formState.errors.plusOneName?.message}
                      {...register("plusOneName", { validate: validatePlusOneName })}
                    />
                  ) : attending >= 1 ? (
                    <p className="text-sm text-ink-soft">
                      Este convite tem lugar para {invitation.maxGuests} pessoas, então não há vaga
                      para acompanhante.
                    </p>
                  ) : null
                ) : null}
                <Actions>
                  <Button type="submit" size="lg">
                    Continuar
                  </Button>
                </Actions>
              </StepShell>
            ) : step === 1 ? (
              <StepShell step={1} focus={navigated}>
                {attending > 0 ? (
                  <section className="flex flex-col gap-5" aria-label="Restrições alimentares">
                    <p className="max-w-[56ch] text-sm text-ink-soft">
                      Alergias são dados de saúde; usamos só para informar o buffet. Preencher é
                      opcional.
                    </p>
                    {named.map((g, i) =>
                      watched[i]?.attending === "yes" ? (
                        <TextField
                          key={g.id}
                          label={`Restrição alimentar de ${g.name}`}
                          optional
                          hint="Ex.: vegetariano, alergia a camarão."
                          autoComplete="off"
                          error={formState.errors.guests?.[i]?.dietaryNotes?.message}
                          {...register(`guests.${i}.dietaryNotes`, { validate: validateDietary })}
                        />
                      ) : null,
                    )}
                  </section>
                ) : null}
                <section className="flex flex-col gap-5" aria-label="Contato">
                  <p className="max-w-[56ch] text-sm text-ink-soft">
                    Contato é opcional. Com e-mail, enviamos a confirmação da sua resposta.
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      type="email"
                      inputMode="email"
                      label="E-mail"
                      optional
                      autoComplete="email"
                      error={formState.errors.email?.message}
                      {...register("email", { validate: validateEmail })}
                    />
                    <TextField
                      type="tel"
                      inputMode="tel"
                      label="Telefone"
                      optional
                      hint="Com DDD."
                      autoComplete="tel"
                      error={formState.errors.phone?.message}
                      {...register("phone", { validate: validatePhone })}
                    />
                  </div>
                </section>
                <Actions>
                  <Button variant="secondary" size="lg" onClick={() => go(0)}>
                    Voltar
                  </Button>
                  <Button type="submit" size="lg">
                    Continuar
                  </Button>
                </Actions>
              </StepShell>
            ) : (
              <StepShell step={2} focus={navigated}>
                <Review invitation={invitation} values={getValues()} />
                <p className="max-w-[56ch] text-sm text-ink-soft">
                  Você pode mudar a resposta depois, até {formatDayMonth(invitation.deadline)}.
                </p>
                {failure ? (
                  <div
                    role="alert"
                    data-testid="rsvp-error"
                    className="flex flex-col items-start gap-3 border-l-2 border-danger pl-5 text-base text-ink"
                  >
                    <p>{failure.message}</p>
                    {failure.reason === "closed" || failure.reason === "not_found" ? (
                      <Button variant="quiet" onClick={() => router.refresh()}>
                        Recarregar a página
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <Actions>
                  <Button variant="secondary" size="lg" onClick={() => go(1)} disabled={pending}>
                    Voltar
                  </Button>
                  <Button type="submit" size="lg" loading={pending}>
                    {attending > 0 ? "Confirmar presença" : "Enviar resposta"}
                  </Button>
                </Actions>
              </StepShell>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </form>
  );
}

function childHint(ageRange: Invitation["guests"][number]["ageRange"]): string {
  return ageRange ? `Criança, ${ageRange.replace("-", " a ")} anos` : "Criança";
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 pt-2">{children}</div>;
}

/** Cabeçalho da etapa; o foco vai para ele quando a etapa troca (leitor de tela e teclado). */
function StepShell({
  step,
  focus,
  children,
}: {
  step: StepIndex;
  focus: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6" data-step={step + 1}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">
          Etapa {step + 1} de {STEPS.length}
        </p>
        <FocusHeading focus={focus}>{STEPS[step]}</FocusHeading>
      </div>
      {children}
    </div>
  );
}

function FocusHeading({ focus, children }: { focus: boolean; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
    // Só ao montar: o foco acompanha a troca de etapa, não cada digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className="font-display text-display-sm text-ink outline-none">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------------ */
/* Revisão                                                                    */
/* ------------------------------------------------------------------------ */

function Review({ invitation, values }: { invitation: Invitation; values: RsvpFormValues }) {
  const named = namedGuests(invitation);
  const count = attendingCount(values.guests);
  const plusOne = plusOneAvailable(invitation, count) ? values.plusOneName.trim() : "";
  const email = values.email.trim();
  const phone = values.phone.trim();
  return (
    <dl className="flex flex-col" data-testid="rsvp-review">
      {named.map((g, i) => {
        const v = values.guests[i];
        const yes = v?.attending === "yes";
        const notes = yes ? v?.dietaryNotes.trim() : "";
        return (
          <div key={g.id} className="border-t border-line-soft py-3">
            <dt className="text-base font-medium text-ink">{g.name}</dt>
            <dd className="text-base text-ink">
              {yes ? "Vai" : "Não vai"}
              {notes ? (
                <span className="block text-sm text-ink-soft">Restrição: {notes}</span>
              ) : null}
            </dd>
          </div>
        );
      })}
      {plusOne ? (
        <div className="border-t border-line-soft py-3">
          <dt className="text-base font-medium text-ink">{plusOne}</dt>
          <dd className="text-base text-ink">Vai, como acompanhante</dd>
        </div>
      ) : null}
      <div className="border-t border-b border-line-soft py-3">
        <dt className="text-base font-medium text-ink">Contato</dt>
        <dd className="text-base text-ink">
          {email || phone ? [email, phone].filter(Boolean).join(", ") : "Não informado"}
        </dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------------ */
/* Resultado                                                                  */
/* ------------------------------------------------------------------------ */

function DoneStep({
  invitation,
  reduce,
  onChange,
}: {
  invitation: Invitation;
  reduce: boolean;
  onChange: () => void;
}) {
  const going = invitation.guests.filter((g) => g.rsvpStatus === "confirmed");
  const notGoing = invitation.guests.filter((g) => g.rsvpStatus === "declined");
  const email = invitation.contact.email;
  const deadline = formatDayMonth(invitation.deadline);

  return (
    <div className="flex flex-col gap-6" data-testid="rsvp-done">
      <div className="flex items-center gap-4">
        <CheckDraw instant={reduce} />
        <FocusHeading focus>
          {going.length > 0 ? "Presença confirmada" : "Resposta enviada"}
        </FocusHeading>
      </div>

      {going.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3" aria-label="Quem vai">
            {going.map((g, i) => (
              <motion.li
                key={g.id}
                className="flex items-center gap-4"
                initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.32,
                  ease: EASE,
                  delay: reduce ? 0 : 0.5 + i * 0.1,
                }}
              >
                <Tile
                  design={TILE_ROTATION[i % TILE_ROTATION.length]!}
                  size={44}
                  className="rounded-full outline-1 outline-offset-2 outline-line-soft"
                />
                <span className="text-lg text-ink">{g.name}</span>
              </motion.li>
            ))}
          </ul>
          {notGoing.length > 0 ? (
            <p className="text-base text-ink-soft">
              Não vão: {notGoing.map((g) => g.name).join(", ")}.
            </p>
          ) : null}
          <p className="max-w-[56ch] text-base text-ink-soft">
            Vai ser uma festa e tanto com vocês lá.{" "}
            {email ? `Enviamos a confirmação para ${email}. ` : ""}
            Se algo mudar, volte aqui até {deadline} e altere a resposta.
          </p>
        </>
      ) : (
        <p className="max-w-[56ch] text-lg text-ink">
          Obrigado por avisar. Vamos sentir a sua falta, e é bom saber agora. Se algo mudar, volte
          aqui até {deadline} e altere a resposta.
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="secondary" size="lg" onClick={onChange}>
          Alterar resposta
        </Button>
        <ButtonLink href="/" variant="quiet" size="lg">
          Voltar ao início
        </ButtonLink>
      </div>
    </div>
  );
}

/** Check desenhado em traço (pathLength). Com movimento reduzido, já aparece pronto. */
function CheckDraw({ instant }: { instant: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-12 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="rsvp-check"
    >
      <circle cx="24" cy="24" r="21" strokeWidth="1.75" />
      <motion.path
        d="M13 25.5 21 33 35.5 15.5"
        initial={instant ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
      />
    </svg>
  );
}
