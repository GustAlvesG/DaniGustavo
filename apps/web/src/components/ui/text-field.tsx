import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";
import { controlStyles, Field, type FieldBaseProps } from "./field";

/*
 * Campos completos (rótulo + dica + controle + erro). Todo o resto das props
 * vai para o elemento nativo, inclusive `ref`, então funcionam direto com
 * react-hook-form: <TextField label="Nome" {...register("nome")} error={…} />.
 */

export type TextFieldProps = Omit<ComponentProps<"input">, "className"> &
  FieldBaseProps & {
    /** Classe extra do <input>. */
    inputClassName?: string;
  };

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  className,
  inputClassName,
  type = "text",
  ...rest
}: TextFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      {(control) => (
        <input {...rest} {...control} type={type} className={cx(controlStyles, inputClassName)} />
      )}
    </Field>
  );
}

export type TextAreaProps = Omit<ComponentProps<"textarea">, "className"> &
  FieldBaseProps & {
    inputClassName?: string;
  };

export function TextArea({
  id,
  label,
  hint,
  error,
  optional,
  className,
  inputClassName,
  rows = 4,
  ...rest
}: TextAreaProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      {(control) => (
        <textarea
          {...rest}
          {...control}
          rows={rows}
          className={cx(controlStyles, "resize-y py-3 leading-[1.6]", inputClassName)}
        />
      )}
    </Field>
  );
}

export type SelectProps = Omit<ComponentProps<"select">, "className"> &
  FieldBaseProps & {
    inputClassName?: string;
  };

/** <select> nativo (melhor no celular), com seta própria. */
export function Select({
  id,
  label,
  hint,
  error,
  optional,
  className,
  inputClassName,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      {(control) => (
        <div className="relative">
          <select
            {...rest}
            {...control}
            className={cx(controlStyles, "cursor-pointer appearance-none pr-12", inputClassName)}
          >
            {children}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-cobalto"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 6 8 10.5 12.5 6" />
          </svg>
        </div>
      )}
    </Field>
  );
}
