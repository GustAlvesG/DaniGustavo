import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Props de acessibilidade que o <Field> entrega ao controle. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

export type FieldBaseProps = {
  /** Rótulo visível, sempre acima do campo. */
  label: ReactNode;
  /** Dica curta abaixo do rótulo (formato esperado, para que serve). */
  hint?: ReactNode;
  /** Mensagem de erro: diz o que houve e como resolver. */
  error?: ReactNode;
  /** Mostra "opcional" ao lado do rótulo (preferimos marcar o opcional, não o obrigatório). */
  optional?: boolean;
  /** Classe do contêiner do campo inteiro. */
  className?: string;
};

export type FieldProps = FieldBaseProps & {
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/** Junta ids de descrição ignorando os vazios. */
export function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

/**
 * Moldura de um campo: rótulo, dica, controle e erro, com os ids ligados
 * (aria-describedby, aria-invalid). O controle vem por render prop:
 *
 *   <Field label="Telefone" hint="Com DDD">{(p) => <input {...p} />}</Field>
 */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-dica` : undefined;
  const errorId = error ? `${controlId}-erro` : undefined;

  return (
    <div className={cx("flex flex-col", className)}>
      <label htmlFor={controlId} className="self-start text-base font-medium text-ink">
        {label}
        {optional ? <OptionalTag /> : null}
      </label>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <div className="mt-2.5">
        {children({
          id: controlId,
          "aria-describedby": describedBy(hintId, errorId),
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function OptionalTag() {
  return <span className="ml-2 text-sm font-normal text-ink-soft">opcional</span>;
}

export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm text-ink-soft">
      {children}
    </p>
  );
}

export function FieldError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={cx("mt-2 flex items-start gap-2 text-sm font-medium text-danger", className)}
    >
      <span aria-hidden="true" className="flex h-[1lh] shrink-0 items-center">
        <ErrorMark />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Losango (um ladrilho girado 45°) com um traço de exclamação. */
function ErrorMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor">
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 5.2v3.4" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="10.9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/*
 * Aparência dos controles de texto. Campo claro (branco dentro do relevo),
 * borda na cor da linha da superfície (royal no claro, 11,6:1; serenity no
 * marinho, 6,3:1), cantos de 12px: a cápsula fica para os botões.
 */
export const controlStyles = cx(
  "block w-full min-h-12 rounded-xl border-[1.5px] border-line bg-field px-4",
  "font-sans text-base text-ink placeholder:text-ink-soft",
  "transition-[border-color,background-color,box-shadow] duration-micro ease-out",
  "hover:border-ink focus-visible:border-ink focus-visible:shadow-[inset_0_0_0_1px_var(--ink)]",
  "aria-[invalid=true]:border-danger",
  "disabled:cursor-not-allowed disabled:border-line-soft disabled:bg-transparent disabled:text-ink-soft",
);
