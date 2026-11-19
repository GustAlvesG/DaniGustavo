/*
 * Navegação por hash. Tudo do evento fica em `#/e/:eventId/...`; as páginas escrevem caminhos
 * relativos ao evento ("/convites/12") e `eh`/`go`/`ea` acrescentam o evento atual. O Shell
 * chama `setCurrentEventId` antes de renderizar a página.
 */

let currentEventId = 0;

export const setCurrentEventId = (id: number) => {
  currentEventId = id;
};
export const getCurrentEventId = () => currentEventId;

/** Hash de uma página do evento atual: eh("/convites") → "#/e/3/convites". */
export const eh = (path: string) => `#/e/${currentEventId}${path === "/" ? "" : path}`;

/** URL da API do evento atual: ea("/gifts") → "/api/admin/events/3/gifts". */
export const ea = (path: string) => `/api/admin/events/${currentEventId}${path}`;

/** Navega para uma página do evento atual. */
export const go = (path: string) => {
  window.location.hash = eh(path);
};

/** Navega para um caminho de hash absoluto (ex.: "/eventos" ou "/e/3"). */
export const goAbsolute = (path: string) => {
  window.location.hash = path;
};

const LAST_EVENT_KEY = "painel:ultimo-evento";

/** Último evento aberto neste navegador (só conveniência; pode falhar em janela privada). */
export function rememberEvent(id: number) {
  try {
    window.localStorage.setItem(LAST_EVENT_KEY, String(id));
  } catch {
    /* sem armazenamento: tudo bem */
  }
}
export function lastEvent(): number | null {
  try {
    const n = Number(window.localStorage.getItem(LAST_EVENT_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Hash da página inicial de um evento. */
export const eventPath = (id: number) => `#/e/${id}`;
