"use client";

import type { ComponentProps, MouseEvent } from "react";
import { cx } from "@/lib/cx";
import { buttonStyles, type ButtonStyleOptions } from "./button-styles";

export type ButtonProps = ComponentProps<"button"> &
  Omit<ButtonStyleOptions, "className"> & {
    /**
     * Ação em andamento: marca aria-busy, ignora cliques e envios (inclusive
     * Enter num campo do formulário) sem tirar o foco do botão, e mostra um
     * pequeno ladrilho girando no lugar do texto (o texto continua para o
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

/** Indicador de carregamento: um ladrilho que gira de 90 em 90 graus. */
function LoadingTile() {
  return (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <svg
        viewBox="0 0 20 20"
        className="size-5 animate-tile-turn"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="0.5" />
        <path d="M11.75 2.75A9 9 0 0 1 2.75 11.75" />
        <path d="M8.25 17.25A9 9 0 0 1 17.25 8.25" />
      </svg>
    </span>
  );
}
