import { notFound } from "next/navigation";

/*
 * Qualquer caminho sem página: com o root layout em `app/[host]`, o 404 de rota inexistente
 * só passa pelo `[host]/not-found.tsx` (com menu e rodapé do evento) se alguma rota casar.
 */
export default function Resto(): never {
  notFound();
}
