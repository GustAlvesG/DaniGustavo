/**
 * Helpers dos textos editáveis de src/content (sem React).
 */

/** "Dez anos *colados* aqui" → trechos com e sem ênfase. */
export function partesEnfase(texto: string): { texto: string; enfase: boolean }[] {
  return texto
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((parte) =>
      parte.length > 2 && parte.startsWith("*") && parte.endsWith("*")
        ? { texto: parte.slice(1, -1), enfase: true }
        : { texto: parte, enfase: false },
    );
}

/** Troca {chave} pelos valores dados; chaves desconhecidas ficam como estão. */
export function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (inteiro, chave: string) => valores[chave] ?? inteiro);
}
