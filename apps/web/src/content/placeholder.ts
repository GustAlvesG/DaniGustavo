/**
 * Conteúdo provisório do hero. TODO(conteudo): a Fase 2 troca por
 * `GET /api/site` (settings editáveis no painel); o hero recebe tudo por props.
 */
export type HeroContent = {
  names: { first: string; second: string };
  /** Instante da cerimônia, com fuso (ISO 8601). */
  dateISO: string;
  venueLabel: string;
  rsvpHref: string;
  giftsHref: string;
};

export const heroPlaceholder: HeroContent = {
  names: { first: "Dani", second: "Gustavo" }, // TODO(conteudo)
  dateISO: "2027-05-15T16:00:00-03:00", // TODO(conteudo)
  venueLabel: "Local a definir", // TODO(conteudo)
  rsvpHref: "/confirmar",
  giftsHref: "/presentes",
};
