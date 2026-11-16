/** Minúsculas, sem acentos, sem pontuação, espaços colapsados e aparados. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Regra de busca: o nome do convidado casa quando o primeiro nome digitado é o início do
 * nome cadastrado e o sobrenome digitado é o fim (palavras inteiras, já normalizadas), e os
 * dois não se sobrepõem. "maria" + "souza" casa com "Maria Clara Souza"; "clara" + "souza"
 * não casa, e "maria" + "maria" não casa com "Maria".
 */
export function nameMatches(stored: string, firstName: string, lastName: string): boolean {
  const name = normalizeName(stored).split(" ").filter(Boolean);
  const first = normalizeName(firstName).split(" ").filter(Boolean);
  const last = normalizeName(lastName).split(" ").filter(Boolean);
  if (first.length === 0 || last.length === 0) return false;
  if (name.length < first.length + last.length) return false;
  return (
    first.every((token, i) => name[i] === token) &&
    last.every((token, i) => name[name.length - last.length + i] === token)
  );
}
