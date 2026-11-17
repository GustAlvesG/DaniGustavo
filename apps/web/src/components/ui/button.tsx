"use client";

import type { ComponentProps, MouseEvent } from "react";
import { cx } from "@/lib/cx";
import { buttonStyles, type ButtonStyleOptions } from "./button-styles";

export type ButtonProps = ComponentProps<"button"> &
  Omit<ButtonStyleOptions, "className"> & {
    /**
     * Ação em andamento: marca aria-busy, ignora cliques e envios (inclusive
     * Enter num campo do formulário) sem tirar o foco do botão, e mostra um
     * pequeno arco girando no lugar do texto (o texto continua para o
     * leitor de tela).
     */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  type = "button",
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const handleClick = loading
    ? (event: MouseEvent<HTMLButtonElement>) => event.preventDefault()
    : onClick;

  return (
    <button
      {...rest}
      type={type}
      className={buttonStyles({ variant, size, block, className })}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest["aria-disabled"] || undefined}
      onClick={handleClick}
    >
      <span
        className={cx(
          "inline-flex items-center gap-2.5 transition-opacity duration-micro",
          loading && "opacity-0",
        )}
      >
        {children}
      </span>
      {loading && <LoadingTile />}
    </button>
  );
}

/** Indicador de carregamento: um arco que gira. */
function LoadingTile() {
  return (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <svg
        viewBox="0 0 20 20"
        className="size-5 animate-spin-slow"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <circle cx="10" cy="10" r="7.25" opacity="0.25" />
        <path d="M10 2.75a7.25 7.25 0 0 1 7.25 7.25" />
      </svg>
    </span>
  );
}
