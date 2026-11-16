import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { describedBy, FieldError, FieldHint, OptionalTag } from "./field";

/*
 * Caixa de seleção e rádio com o <input> nativo (teclado, formulário e
 * react-hook-form funcionam sem JS extra), só redesenhado. A linha inteira é
 * o <label>, com no mínimo 44px de altura: alvo de toque confortável.
 */

const row =
  "group flex min-h-11 cursor-pointer items-start gap-3 py-2.5 has-disabled:cursor-not-allowed";
const textCol = "flex flex-col text-base text-tinta group-has-disabled:text-tinta/55";

type ChoiceExtras = {
  label: ReactNode;
  /** Texto auxiliar abaixo do rótulo da opção. */
  hint?: ReactNode;
  /** Classe do <label> (a linha inteira). */
  className?: string;
};

export type CheckboxProps = Omit<ComponentProps<"input">, "type" | "className"> &
  ChoiceExtras & {
    /** Erro de uma caixa isolada (ex.: aceite obrigatório). */
    error?: ReactNode;
  };

/**
 * Caixa de seleção: um mini azulejo quadrado. Marcada, ganha esmalte cobalto
 * e o visto é desenhado em traço branco.
 */
export function Checkbox({ id, label, hint, error, className, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-dica` : undefined;
  const errorId = error ? `${inputId}-erro` : undefined;

  return (
    <div className="flex flex-col">
      <label htmlFor={inputId} className={cx(row, className)}>
        <span className="flex h-[1lh] shrink-0 items-center">
          <span className="relative grid size-6 place-items-center">
            <input
              {...rest}
              id={inputId}
              type="checkbox"
              aria-describedby={describedBy(hintId, errorId, rest["aria-describedby"])}
              aria-invalid={error ? true : rest["aria-invalid"]}
              className={cx(
                "peer absolute inset-0 m-0 size-6 cursor-pointer appearance-none rounded-[2px]",
                "border-[1.5px] border-cobalto bg-branco",
                "transition-colors duration-micro ease-out",
                "hover:bg-nevoa checked:bg-cobalto checked:hover:bg-tinta checked:hover:border-tinta",
                "aria-[invalid=true]:border-erro",
                "disabled:cursor-not-allowed disabled:border-tinta/25 disabled:bg-nevoa",
                "disabled:checked:bg-tinta/30",
              )}
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className={cx(
                "pointer-events-none relative size-4 text-branco",
                "[&>path]:[stroke-dasharray:1] [&>path]:[stroke-dashoffset:1]",
                "[&>path]:transition-[stroke-dashoffset] [&>path]:duration-ui [&>path]:ease-out",
                "peer-checked:[&>path]:[stroke-dashoffset:0]",
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.3 8.5 6.6 11.6 12.7 4.6" pathLength={1} />
            </svg>
          </span>
        </span>
        <span className={textCol}>
          <span>{label}</span>
          {hint ? (
            <span id={hintId} className="text-sm text-tinta/70">
              {hint}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <FieldError id={errorId} className="mt-0">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}

export type RadioProps = Omit<ComponentProps<"input">, "type" | "className"> & ChoiceExtras;

/** Rádio: círculo com contorno cobalto; marcado, um ponto cresce do centro. */
export function Radio({ id, label, hint, className, ...rest }: RadioProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-dica` : undefined;

  return (
    <label htmlFor={inputId} className={cx(row, className)}>
      <span className="flex h-[1lh] shrink-0 items-center">
        <span className="relative grid size-6 place-items-center">
          <input
            {...rest}
            id={inputId}
            type="radio"
            aria-describedby={describedBy(hintId, rest["aria-describedby"])}
            className={cx(
              "peer absolute inset-0 m-0 size-6 cursor-pointer appearance-none rounded-full",
              "border-[1.5px] border-cobalto bg-branco",
              "transition-colors duration-micro ease-out hover:bg-nevoa",
              "disabled:cursor-not-allowed disabled:border-tinta/25 disabled:bg-nevoa",
            )}
          />
          <span
            aria-hidden="true"
            className={cx(
              "pointer-events-none relative size-2.5 scale-0 rounded-full bg-cobalto",
              "transition-transform duration-ui ease-out peer-checked:scale-100",
              "peer-disabled:bg-tinta/35",
            )}
          />
        </span>
      </span>
      <span className={textCol}>
        <span>{label}</span>
        {hint ? (
          <span id={hintId} className="text-sm text-tinta/70">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export type RadioGroupProps = {
  /** Pergunta do grupo (vira <legend>). */
  legend: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Opções lado a lado a partir de 640px. */
  orientation?: "vertical" | "horizontal";
  className?: string;
  children: ReactNode;
};

/**
 * Grupo de rádios: <fieldset> com <legend>, dica e erro ligados por
 * aria-describedby. Cada <Radio> recebe `{...register("campo")}` e `value`.
 */
export function RadioGroup({
  legend,
  hint,
  error,
  optional,
  orientation = "vertical",
  className,
  children,
}: RadioGroupProps) {
  const baseId = useId();
  const legendId = `${baseId}-legenda`;
  const hintId = hint ? `${baseId}-dica` : undefined;
  const errorId = error ? `${baseId}-erro` : undefined;

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={describedBy(hintId, errorId)}
      aria-invalid={error ? true : undefined}
      className={cx("m-0 flex min-w-0 flex-col border-0 p-0", className)}
    >
      <legend id={legendId} className="p-0 text-base font-medium text-tinta">
        {legend}
        {optional ? <OptionalTag /> : null}
      </legend>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <div
        className={cx(
          "mt-1.5 flex flex-col",
          orientation === "horizontal" && "sm:flex-row sm:flex-wrap sm:gap-x-8",
        )}
      >
        {children}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}
