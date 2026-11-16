/**
 * Abertura da home (docs/PROMPT.md §4.6.1): decisões e tempos, sem React e
 * sem DOM, para testar e para o script inline do <head> usar a mesma regra.
 */

/** Chave do sessionStorage: a abertura roda uma vez por sessão. */
export const OPENING_STORAGE_KEY = "dg:abertura";

/** Atributo no <html> enquanto a capa cobre a página. */
export const OPENING_ATTR = "data-opening";

export type OpeningMode = "full" | "fade" | "none";

type StorageLike = Pick<Storage, "getItem"> | null | undefined;

/**
 * "full": grade, monograma, portas e nomes. "fade": movimento reduzido, a
 * capa some em 200 ms. "none": já vista nesta sessão (ou sem sessionStorage).
 */
export function shouldPlayOpening(storage: StorageLike, reducedMotion: boolean): OpeningMode {
  let seen: string | null;
  try {
    if (!storage) return "none";
    seen = storage.getItem(OPENING_STORAGE_KEY);
  } catch {
    return "none";
  }
  if (seen) return "none";
  return reducedMotion ? "fade" : "full";
}

/**
 * Script bloqueante do <head>: roda antes do primeiro paint e marca
 * `<html data-opening="pending">` (a capa CSS aparece só com o atributo).
 * Só na home e só se a sessão ainda não viu. Se nada assumir a capa em 6 s
 * (JS quebrado), ela sai sozinha.
 */
export function openingInlineScript(): string {
  const key = JSON.stringify(OPENING_STORAGE_KEY);
  const attr = JSON.stringify(OPENING_ATTR);
  return (
    `(function(){try{if(location.pathname!=="/"||sessionStorage.getItem(${key}))return;` +
    `var d=document.documentElement;d.setAttribute(${attr},"pending");window.__dgOpening=1;` +
    `setTimeout(function(){if(d.getAttribute(${attr})==="pending")d.removeAttribute(${attr})},6000)` +
    `}catch(e){}})()`
  );
}

/* ------------------------------------------------------------------------ */
/* Geometria da grade                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Colunas por folha de porta (a grade tem o dobro). Igual ao CSS
 * (opening.module.css): retrato estreito 3, retrato largo 4, paisagem 5.
 */
export function doorColumns(width: number, height: number): number {
  if (width > height) return 5;
  return width < 600 ? 3 : 4;
}

/** Linhas que a capa renderiza (pares, centradas na junta do meio). */
export const OPENING_MAX_ROWS = 16;
/** Colunas por folha que a capa renderiza (as que sobram somem por CSS). */
export const OPENING_MAX_DOOR_COLS = 5;

/** Campo liso do monograma, em ladrilhos a partir da junta central. */
export const MONOGRAM_FIELD = { doorCols: 2, rowsAbove: 1, rowsBelow: 1 } as const;

export type OpeningCell = {
  door: "l" | "r";
  /** Coluna a partir da junta central (0 é a mais próxima). */
  k: number;
  /** Linha relativa ao meio da tela (-1 está logo acima, 0 logo abaixo). */
  j: number;
  /** Coluna global, para o padrão de rotações fechar através da junta. */
  col: number;
  field: boolean;
};

/** Todas as células renderizadas (a mesma lista no servidor e no cliente). */
export function openingCells(): OpeningCell[] {
  const cells: OpeningCell[] = [];
  const half = OPENING_MAX_ROWS / 2;
  for (const door of ["l", "r"] as const) {
    for (let j = -half; j < half; j++) {
      for (let k = 0; k < OPENING_MAX_DOOR_COLS; k++) {
        const field =
          k < MONOGRAM_FIELD.doorCols &&
          j >= -MONOGRAM_FIELD.rowsAbove &&
          j < MONOGRAM_FIELD.rowsBelow;
        cells.push({ door, k, j, col: door === "r" ? k : -1 - k, field });
      }
    }
  }
  return cells;
}

/** Linhas visíveis para cada lado da junta central. */
export function rowsPerHalf(height: number, tile: number): number {
  if (!(tile > 0)) return 0;
  return Math.min(OPENING_MAX_ROWS / 2, Math.ceil(height / 2 / tile));
}

/**
 * Atraso (s) de cada célula numa onda que nasce no centro da tela. A onda
 * inteira cabe em `spread` segundos, qualquer que seja a tela.
 */
export function waveDelays(
  cells: readonly Pick<OpeningCell, "door" | "k" | "j">[],
  spread: number,
): number[] {
  const dist = cells.map((c) => Math.hypot(c.k + 0.5, c.j + 0.5));
  if (!dist.length) return [];
  const min = Math.min(...dist);
  const max = Math.max(...dist);
  const range = max - min || 1;
  return dist.map((d) => Math.round(((d - min) / range) * spread * 1000) / 1000);
}

/* ------------------------------------------------------------------------ */
/* Tempos (segundos)                                                         */
/* ------------------------------------------------------------------------ */

export const OPENING_TIMELINE = {
  /** a) ladrilhos viram do verso para a face, em onda a partir do centro. */
  flip: { start: 0, duration: 0.6, spread: 0.55 },
  /**
   * b) o DG se escreve no campo liso (que vira primeiro): uma parte por vez
   * (haste, S, esporão, arco, pé), com a tinta `inkLag` atrás da linha.
   */
  draw: { start: 0.36, duration: 0.42, stagger: 0.17, inkLag: 0.1 },
  /** c) as folhas abrem pelas dobradiças das bordas. */
  doors: { start: 1.72, duration: 0.86 },
  /** d) "Dani" e "& Gustavo" sobem por máscara, letra a letra. */
  names: { start: 2.0, duration: 0.74, stagger: 0.032 },
  /** Movimento reduzido: a capa some num fade. */
  fade: { duration: 0.2 },
  /** Sem GSAP até aqui (rede lenta, erro): a capa sai com fade. */
  loadTimeout: 2.5,
} as const;

/** Fim de cada etapa, para conferir o teto de 3,2 s. */
export function openingDuration(monogramStrokes: number, nameChars: number): number {
  const t = OPENING_TIMELINE;
  const flip = t.flip.start + t.flip.spread + t.flip.duration;
  const draw =
    t.draw.start +
    t.draw.duration +
    t.draw.inkLag +
    Math.max(0, monogramStrokes - 1) * t.draw.stagger;
  const doors = t.doors.start + t.doors.duration;
  const names = t.names.start + t.names.duration + Math.max(0, nameChars - 1) * t.names.stagger;
  return Math.max(flip, draw, doors, names);
}
