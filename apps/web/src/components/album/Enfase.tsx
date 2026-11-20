import { Fragment } from "react";
import { partesEnfase } from "@/lib/texto";

/** Texto do conteúdo do evento com *palavras* em itálico (vira <em>). */
export function Enfase({ texto }: { texto: string }) {
  return (
    <>
      {partesEnfase(texto).map((p, i) =>
        p.enfase ? <em key={i}>{p.texto}</em> : <Fragment key={i}>{p.texto}</Fragment>,
      )}
    </>
  );
}
