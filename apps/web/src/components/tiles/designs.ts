/**
 * Desenhos dos azulejos (dados puros, sem React).
 *
 * Usado pelo componente <Tile>, pelo gerador de placeholders
 * (`scripts/generate-placeholders.ts`) e pela abertura. Este arquivo NÃO pode
 * importar nada: o Node 24 o executa direto (type stripping) a partir dos
 * scripts, e imports relativos sem extensão quebrariam lá.
 *
 * Convenções de cada ladrilho (viewBox 0 0 100 100):
 * - Traço de tinta sobre o campo (branco no marinho, royal no relevo); cada traço é um `<path>` animável
 *   (stroke-dasharray / DrawSVG). A ordem do array é a ordem de desenho.
 * - Todo desenho que se repete é simétrico na diagonal y = x (canto superior
 *   esquerdo → canto inferior direito). Assim, quatro ladrilhos girados
 *   0/90/270/180 numa grade 2×2 fecham as junções: o que sai por uma borda
 *   entra pela borda vizinha. O canto (100,100) vira o centro do bloco 2×2 e
 *   o canto (0,0) vira os cantos do bloco.
 * - Curvas que cruzam a borda são arcos centrados num canto (cruzam a borda
 *   em ângulo reto) e passam um pouco além do ladrilho (o SVG recorta), para
 *   a junção não ter quebra.
 * - "Pintado à mão": cada traço tem espessura própria (1,1–2,6); os traços
 *   principais ganham um segundo fio que se afasta no meio e volta nas
 *   pontas (a pressão do pincel); as curvas oscilam devagar, de forma
 *   determinística, e as cópias espelhadas recebem um desvio mínimo.
 */

export const TILE_DESIGNS = [
  "monograma",
  "ramo",
  "flor",
  "onda",
  "estrela",
  "moldura",
  "trama",
  "laco",
  "rosa",
] as const;

export type TileDesign = (typeof TILE_DESIGNS)[number];

export function isTileDesign(value: unknown): value is TileDesign {
  return typeof value === "string" && (TILE_DESIGNS as readonly string[]).includes(value);
}

/** Um traço desenhável. `w` é a espessura em unidades do viewBox. */
export interface TileStroke {
  readonly d: string;
  readonly w: number;
  /** Traço secundário, mais leve (serenity no marinho). */
  readonly tone?: "leve";
}

/** Ponto de tinta (círculo preenchido); aparece depois dos traços. */
export interface TileDot {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** Forma preenchida com a tinta (o DG no ladrilho do monograma). */
export interface TileFill {
  readonly d: string;
  readonly transform?: string;
  /** Contorno da mesma cor (nas unidades do próprio desenho) para os fios não sumirem. */
  readonly stroke?: number;
}

export interface TileArt {
  /** Nome legível em pt-BR. */
  readonly label: string;
  /** A ideia do desenho, para a página /dev/design. */
  readonly idea: string;
  /** Aguada: manchas chapadas em serenity, opacidade baixa, por baixo do traço. */
  readonly wash: readonly string[];
  readonly strokes: readonly TileStroke[];
  readonly dots: readonly TileDot[];
  /** Formas preenchidas, por cima dos traços (aparecem com os pontos). */
  readonly fills?: readonly TileFill[];
  /**
   * Como combinar o desenho numa grade: `roseta` gira 0/90/270/180 em 2×2
   * (forma o motivo contínuo); `reto` repete sem girar (monograma).
   */
  readonly pattern: "roseta" | "reto";
}

/* -------------------------------------------------------------------------- */
/* Geometria                                                                  */
/* -------------------------------------------------------------------------- */

type Pt = readonly [number, number];

const DEG = Math.PI / 180;

function fmt(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? "0" : String(v);
}

function pt(p: Pt): string {
  return `${fmt(p[0])} ${fmt(p[1])}`;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pontos de controle Catmull-Rom → Bézier de cada trecho de uma curva aberta. */
function controls(points: readonly Pt[]): [Pt, Pt, Pt, Pt][] {
  const n = points.length;
  const at = (i: number): Pt => {
    if (i < 0) return [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]];
    if (i >= n) {
      const a = points[n - 1];
      const b = points[n - 2];
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return points[i];
  };
  const out: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    out.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return out;
}

/** Trecho suave (sem o "M" inicial). */
function bez(points: readonly Pt[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `L${pt(points[1])}`;
  return controls(points)
    .map(([, c1, c2, p]) => `C${pt(c1)} ${pt(c2)} ${pt(p)}`)
    .join("");
}

/**
 * Curva suave por trechos. Cada trecho começa onde o anterior terminou;
 * entre trechos fica um bico (ponta de pétala, de folha).
 */
function curve(...segments: readonly (readonly Pt[])[]): string {
  let d = `M${pt(segments[0][0])}`;
  for (const s of segments) d += bez(s);
  return d;
}

/** Laço fechado suave. */
function loop(points: readonly Pt[]): string {
  const n = points.length;
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d}Z`;
}

function line(...points: readonly Pt[]): string {
  return `M${pt(points[0])}${points
    .slice(1)
    .map((p) => `L${pt(p)}`)
    .join("")}`;
}

/** Amostra a curva suave que passa pelos pontos (k amostras por trecho). */
function dense(points: readonly Pt[], k = 6): Pt[] {
  if (points.length < 3) {
    const [a, b] = points;
    return Array.from({ length: k + 1 }, (_, i) => {
      const t = i / k;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
    });
  }
  const out: Pt[] = [points[0]];
  for (const [p0, c1, c2, p1] of controls(points)) {
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
      ]);
    }
  }
  return out;
}

/**
 * O segundo fio da pincelada: acompanha a curva entre as frações `from` e
 * `to` (em pontos amostrados), afastando-se até `off` no meio e voltando a
 * encostar nas pontas. `toward` escolhe o lado.
 */
function swell(points: readonly Pt[], from: number, to: number, off: number, toward: Pt): Pt[] {
  const d = dense(points, 8);
  const n = d.length;
  const i0 = Math.max(0, Math.round(from * (n - 1)));
  const i1 = Math.min(n - 1, Math.round(to * (n - 1)));
  const out: Pt[] = [];
  // Uns 14 pontos bastam: a curva passa suave por eles de novo.
  const stride = Math.max(2, Math.round((i1 - i0) / 14));
  for (let i = i0; i <= i1; i += stride) {
    const a = d[Math.max(0, i - 1)];
    const b = d[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * (toward[0] - d[i][0]) + ny * (toward[1] - d[i][1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const t = (i - i0) / Math.max(1, i1 - i0);
    const env = Math.sin(Math.PI * t) ** 1.3;
    out.push([d[i][0] + nx * off * env, d[i][1] + ny * off * env]);
  }
  const last = out[out.length - 1];
  if (last && dist(last, d[i1]) > 0.05 && (i1 - i0) % stride !== 0) out.push(d[i1]);
  if (out.length < 2) return [d[i0], d[i1]];
  return out;
}

/** Espelha na diagonal y = x. */
function mirror(points: readonly Pt[]): Pt[] {
  return points.map((p) => [p[1], p[0]] as const);
}

/** Gira em torno de (cx, cy), em graus (sentido horário na tela). */
function turn(points: readonly Pt[], deg: number, cx = 50, cy = 50): Pt[] {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as const;
  });
}

function move(points: readonly Pt[], dx: number, dy: number): Pt[] {
  return points.map(([x, y]) => [x + dx, y + dy] as const);
}

/**
 * Desvio mínimo de "mão" nos pontos internos (pontas preservadas, para
 * emendas e bicos continuarem no lugar).
 */
function hand(points: readonly Pt[], seed: number, amount = 0.45): Pt[] {
  const r = rng(seed);
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    return [p[0] + (r() - 0.5) * 2 * amount, p[1] + (r() - 0.5) * 2 * amount] as const;
  });
}

interface ArcOptions {
  wobble?: number;
  seed?: number;
  step?: number;
  wave?: { amp: number; n: number };
}

/**
 * Arco em torno de (cx, cy), de a0 a a1 graus (0 = direita, 90 = baixo).
 * A oscilação radial some nos múltiplos de 90° para as emendas entre
 * ladrilhos baterem exatamente.
 */
function arc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  opts: ArcOptions = {},
): Pt[] {
  const { wobble = 0.5, seed = 1, step = 7, wave } = opts;
  const rand = rng(seed);
  const ph1 = rand() * Math.PI * 2;
  const ph2 = rand() * Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const local = ((((a % 90) + 90) % 90) / 90) * Math.PI;
    const env = Math.sin(local) ** 2;
    let rr =
      r + env * wobble * (0.65 * Math.sin(a * DEG * 3 + ph1) + 0.35 * Math.sin(a * DEG * 7 + ph2));
    if (wave) rr += wave.amp * Math.cos(wave.n * a * DEG);
    out.push([cx + rr * Math.cos(a * DEG), cy + rr * Math.sin(a * DEG)]);
  }
  return out;
}

/** Arco de canto que atravessa as duas bordas (passa 4° além de cada uma). */
function cornerArc(corner: 0 | 100, r: number, opts: ArcOptions = {}): Pt[] {
  return corner === 0 ? arc(0, 0, r, -4, 94, opts) : arc(100, 100, r, 176, 274, opts);
}

interface Leaf {
  upper: Pt[];
  lower: Pt[];
  vein: Pt[];
  center: Pt;
}

/** Folha/pétala em forma de amêndoa: base → ponta, dois lados com bico. */
function leaf(
  base: Pt,
  angleDeg: number,
  length: number,
  width: number,
  opts: { bend?: number; seed?: number; belly?: number } = {},
): Leaf {
  const { bend = 0, seed = 7, belly = 0.5 } = opts;
  const r = rng(seed);
  const j = () => (r() - 0.5) * 0.5;
  // Folha deitada no eixo +x, depois girada e transladada.
  const side = (sign: number): Pt[] => [
    [0, 0],
    [length * 0.2, sign * width * 0.38 + bend * 0.3 + j()],
    [length * belly, sign * width * 0.5 + bend * 0.8 + j()],
    [length * 0.82, sign * width * 0.3 + bend + j()],
    [length, bend * 1.1],
  ];
  const place = (pts: readonly Pt[]) => move(turn(pts, angleDeg, 0, 0), base[0], base[1]);
  return {
    upper: place(side(-1)),
    lower: place(side(1)).reverse(),
    vein: place([
      [length * 0.18, bend * 0.1],
      [length * 0.45, bend * 0.55],
      [length * 0.68, bend * 0.85],
    ]),
    center: place([[length * 0.5, bend * 0.6]])[0],
  };
}

function mirrorLeaf(l: Leaf): Leaf {
  return {
    upper: mirror(l.upper),
    lower: mirror(l.lower),
    vein: mirror(l.vein),
    center: [l.center[1], l.center[0]],
  };
}

/** Estrela de n pontas com lados levemente côncavos (quadráticas). */
function star(
  cx: number,
  cy: number,
  n: number,
  rOut: number,
  rIn: number,
  rot = 0,
  seed = 3,
): string {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = rot + (360 / n) * i;
    const b = a + 180 / n;
    const c = a + 360 / n;
    const ro = rOut + (r() - 0.5) * 0.8;
    const p: Pt = [cx + ro * Math.cos(a * DEG), cy + ro * Math.sin(a * DEG)];
    const q: Pt = [cx + rIn * Math.cos(b * DEG), cy + rIn * Math.sin(b * DEG)];
    const e: Pt = [cx + rOut * Math.cos(c * DEG), cy + rOut * Math.sin(c * DEG)];
    if (i === 0) d += `M${pt(p)}`;
    d += `Q${pt(q)} ${pt(e)}`;
  }
  return `${d}Z`;
}

/** Arco quebrado onde `gap(p)` é verdadeiro (por baixo de outra faixa). */
function arcWithGaps(points: readonly Pt[], gap: (p: Pt) => boolean): Pt[][] {
  const parts: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of points) {
    if (gap(p)) {
      if (cur.length > 1) parts.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) parts.push(cur);
  return parts;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/* -------------------------------------------------------------------------- */
/* Construção                                                                 */
/* -------------------------------------------------------------------------- */

const S = (d: string, w: number, tone?: "leve"): TileStroke => (tone ? { d, w, tone } : { d, w });

/** Pincelada: traço + segundo fio que engrossa o meio. */
function brush(
  points: readonly Pt[],
  w: number,
  toward: Pt,
  opts: { from?: number; to?: number; off?: number; w2?: number } = {},
): TileStroke[] {
  const { from = 0.12, to = 0.88, off = 0.75, w2 = w * 0.7 } = opts;
  return [S(curve(points), w), S(curve(swell(points, from, to, off, toward)), w2)];
}

/** Folha com contorno, barriga engrossada e (opcional) nervura no tom leve. */
function leafStrokes(
  l: Leaf,
  w: number,
  opts: { vein?: boolean; off?: number } = {},
): TileStroke[] {
  const { vein = true, off = 0.7 } = opts;
  const out = [
    S(curve(l.upper, l.lower), w),
    S(curve(swell(l.lower, 0.15, 0.85, off, l.center)), w * 0.7),
  ];
  if (vein) out.push(S(curve(l.vein), 1.05, "leve"));
  return out;
}

function leafWash(l: Leaf, dx = 0.8, dy = 0.55): string {
  return loop(move([...l.upper.slice(1), ...l.lower.slice(1, -1)], dx, dy));
}

/* Monograma ------------------------------------------------------------------ */

function monograma(): TileArt {
  const strokes: TileStroke[] = [];
  // Quartos de anel nos quatro cantos (qualquer rotação emenda).
  const corners: Pt[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  corners.forEach(([cx, cy], i) => {
    const start = i * 90; // aponta o arco para dentro do ladrilho
    strokes.push(
      S(curve(arc(cx, cy, 10.5, start - 4, start + 94, { seed: 11 + i, wobble: 0.3 })), 1.4),
    );
  });
  // Guirlanda fina aberta em cima e embaixo.
  strokes.push(
    S(curve(arc(50, 50, 33.5, 114, 246, { seed: 21, wobble: 0.6, step: 9 })), 1.1, "leve"),
  );
  strokes.push(
    S(curve(arc(50, 50, 33.5, -66, 66, { seed: 22, wobble: 0.6, step: 9 })), 1.1, "leve"),
  );
  // DG do casal, preenchido, no centro da guirlanda (o mesmo desenho do
  // monograma grande, reduzido: 822 → 46 unidades de largura).
  const k = 46 / 822;
  const fills: TileFill[] = monogramArt()
    .parts.filter((p) => p.id !== "esporao")
    .map((p) => ({
      d: p.d,
      stroke: 13,
      transform: `translate(${fmt(50 - (92 + 411) * k)} ${fmt(50 - (254 + 246) * k)}) scale(${k.toFixed(5)})`,
    }));
  return {
    label: "Monograma",
    idea: "O DG do casal no centro, dentro de uma guirlanda aberta; quartos de anel nos quatro cantos emendam com qualquer vizinho.",
    wash: [],
    strokes,
    fills,
    dots: [
      { cx: 50, cy: 15.2, r: 1.3 },
      { cx: 50, cy: 84.8, r: 1.3 },
    ],
    pattern: "reto",
  };
}

/* Flor ----------------------------------------------------------------------- */

function flor(): TileArt {
  const strokes: TileStroke[] = [];
  const wash: string[] = [];
  // Flor de quatro pétalas no centro, pétalas nas diagonais.
  [45, 135, 225, 315].forEach((a, i) => {
    const base: Pt = [50 + 4.4 * Math.cos(a * DEG), 50 + 4.4 * Math.sin(a * DEG)];
    const l = leaf(base, a, 20.5 + (i % 2) * 1.4, 13, {
      seed: 40 + i,
      bend: i % 2 ? 0.7 : -0.7,
      belly: 0.58,
    });
    strokes.push(...leafStrokes(l, i % 2 ? 1.6 : 1.85));
    wash.push(leafWash(l));
  });
  strokes.push(S(loop(hand(arc(50, 50, 3.6, 0, 330, { wobble: 0, step: 30 }), 48, 0.15)), 1.6));

  // Canto (0,0): quarto de roseta — anel engrossado + pétala na diagonal.
  strokes.push(...brush(cornerArc(0, 13.5, { seed: 51, wobble: 0.5 }), 1.8, [0, 0], { off: 0.8 }));
  strokes.push(S(curve(cornerArc(0, 8.6, { seed: 52, wobble: 0.3 })), 1.1, "leve"));
  const cp = leaf([13.5 * Math.SQRT1_2, 13.5 * Math.SQRT1_2], 45, 11, 7, { seed: 53 });
  strokes.push(...leafStrokes(cp, 1.4, { vein: false }));

  // Canto (100,100): anel e uma pétala que nasce do canto — no bloco, um
  // medalhão com uma florzinha em cruz.
  strokes.push(
    ...brush(cornerArc(100, 22, { seed: 54, wobble: 0.6 }), 1.9, [100, 100], { off: 0.9 }),
  );
  strokes.push(S(curve(cornerArc(100, 25.6, { seed: 55, wobble: 0.6 })), 1.1, "leve"));
  const inner = leaf([100 - 2.6 * Math.SQRT1_2, 100 - 2.6 * Math.SQRT1_2], 225, 12.6, 7.4, {
    seed: 56,
  });
  strokes.push(...leafStrokes(inner, 1.4, { vein: false }));
  wash.push(leafWash(inner, 0.6, 0.4));
  // Hastes finas ligando a flor aos dois cantos.
  strokes.push(
    S(
      curve(
        hand(
          [
            [67, 67],
            [70.8, 70.9],
            [74.2, 74.3],
          ],
          57,
          0.2,
        ),
      ),
      1.1,
      "leve",
    ),
  );
  strokes.push(
    S(
      curve(
        hand(
          [
            [33.2, 33.2],
            [29.6, 29.5],
            [26.6, 26.6],
          ],
          58,
          0.2,
        ),
      ),
      1.1,
      "leve",
    ),
  );

  return {
    label: "Flor",
    idea: "Flor de quatro pétalas nas diagonais. Em 2×2, o canto de cima fecha uma roseta e o de baixo um medalhão com uma florzinha em cruz.",
    wash,
    strokes,
    dots: [
      { cx: 79, cy: 21, r: 1.4 },
      { cx: 21, cy: 79, r: 1.4 },
      { cx: 100, cy: 100, r: 1.8 },
    ],
    pattern: "roseta",
  };
}

/* Estrela -------------------------------------------------------------------- */

function estrela(): TileArt {
  const strokes: TileStroke[] = [];
  // Estrela de oito pontas no centro, de lados côncavos, e um anel interno.
  strokes.push(S(star(50, 50, 8, 19, 8.6, 0, 61), 1.9));
  strokes.push(S(star(50, 50, 8, 14.2, 8.6, 22.5, 66), 1.05, "leve"));
  strokes.push(S(loop(hand(arc(50, 50, 4.2, 10, 340, { wobble: 0, step: 30 }), 62, 0.2)), 1.3));
  // Canto (0,0): um quarto de estrela grande — fecha numa estrela no bloco.
  const q: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = i * 22.5;
    const r = i % 2 === 0 ? 21 : 11;
    q.push([r * Math.cos(a * DEG), r * Math.sin(a * DEG)]);
  }
  strokes.push(
    S(
      `M${pt([21, -2])}L${pt(q[0])}Q${pt(q[1])} ${pt(q[2])}Q${pt(q[3])} ${pt(q[4])}L${pt([-2, 21])}`,
      1.8,
    ),
  );
  strokes.push(S(curve(cornerArc(0, 30, { seed: 63, wobble: 0.7 })), 1.1, "leve"));
  // Canto (100,100): anel com raios curtos (um sol no centro do bloco).
  strokes.push(
    ...brush(cornerArc(100, 16.5, { seed: 64, wobble: 0.5 }), 2, [100, 100], { off: 0.8 }),
  );
  [202.5, 225, 247.5].forEach((a, i) => {
    const r0 = 21.5;
    const r1 = i === 1 ? 29.5 : 26;
    strokes.push(
      S(
        line(
          [100 + r0 * Math.cos(a * DEG), 100 + r0 * Math.sin(a * DEG)],
          [100 + r1 * Math.cos(a * DEG), 100 + r1 * Math.sin(a * DEG)],
        ),
        i === 1 ? 1.7 : 1.2,
      ),
    );
  });
  return {
    label: "Estrela",
    idea: "Estrela de oito pontas de lados côncavos; quartos de estrela nos cantos de cima fecham estrelas grandes e o canto de baixo vira um sol de raios curtos.",
    wash: [star(50.8, 50.6, 8, 17.5, 8.6, 0, 61)],
    strokes,
    dots: [
      { cx: 80, cy: 20, r: 1.5 },
      { cx: 20, cy: 80, r: 1.5 },
    ],
    pattern: "roseta",
  };
}

/* Ramo ----------------------------------------------------------------------- */

function ramo(): TileArt {
  const strokes: TileStroke[] = [];
  const wash: string[] = [];
  // Haste que nasce do anel do canto (100,100) e sobe em S até perto do
  // canto oposto.
  const stem: Pt[] = [
    [94.7, 94.6],
    [85.6, 87.4],
    [76, 77.6],
    [65.4, 66.8],
    [55.6, 54.2],
    [47.4, 42.6],
    [40, 33],
    [32.6, 25.6],
  ];
  strokes.push(...brush(stem, 1.7, [100, 0], { from: 0.02, to: 0.6, off: 0.9, w2: 1.3 }));
  // Folhas alternadas, menores para a ponta.
  const leaves: { at: Pt; a: number; l: number; w: number; bend: number }[] = [
    { at: [83.4, 85.2], a: 178, l: 16.5, w: 8.6, bend: -1.6 },
    { at: [74.2, 75.6], a: 284, l: 16, w: 8.4, bend: 1.6 },
    { at: [62.6, 63.4], a: 166, l: 14.5, w: 7.8, bend: -1.3 },
    { at: [53.4, 51], a: 290, l: 13, w: 7.2, bend: 1.3 },
    { at: [44.6, 38.8], a: 160, l: 11, w: 6.4, bend: -1 },
    { at: [38.4, 31.2], a: 296, l: 9.4, w: 5.6, bend: 1 },
  ];
  leaves.forEach((f, i) => {
    const l = leaf(f.at, f.a, f.l, f.w, { seed: 70 + i, bend: f.bend });
    strokes.push(...leafStrokes(l, i < 2 ? 1.65 : i < 4 ? 1.5 : 1.3, { vein: i < 4 }));
    if (i % 2 === 0) wash.push(leafWash(l));
  });
  // Folha de ponta, na direção da haste.
  const tip = leaf([32.6, 25.6], 222, 8.6, 5, { seed: 79, bend: 0.4 });
  strokes.push(...leafStrokes(tip, 1.3, { vein: false }));
  // Canto (0,0): pequeno anel; canto (100,100): o anel de onde nascem os ramos.
  strokes.push(S(curve(cornerArc(0, 9.5, { seed: 81, wobble: 0.4 })), 1.5));
  strokes.push(
    ...brush(cornerArc(100, 7.6, { seed: 82, wobble: 0.2 }), 1.6, [100, 100], { off: 0.6 }),
  );
  return {
    label: "Ramo",
    idea: "Um ramo de folhas alternadas nasce de um anel no canto; em 2×2, quatro ramos saem do mesmo anel e cruzam o painel em X.",
    wash,
    strokes,
    dots: [
      { cx: 15.6, cy: 6, r: 1.6 },
      { cx: 6, cy: 15.6, r: 1.6 },
      { cx: 21.4, cy: 18.8, r: 1.1 },
      { cx: 100, cy: 100, r: 2.2 },
    ],
    pattern: "roseta",
  };
}

/* Onda ----------------------------------------------------------------------- */

function onda(): TileArt {
  const strokes: TileStroke[] = [];
  // Onda que atravessa o ladrilho de um canto livre ao outro, com a crista
  // no meio; em 2×2, as ondas se fecham em losangos em volta das ondulações.
  const wave = (amp: number, spread: number, steps = 24): Pt[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const s = i / steps;
      const f = amp * Math.sin(3 * Math.PI * s) + spread * Math.sin(Math.PI * s);
      const k = f * Math.SQRT1_2;
      return [100 * s + k, 100 - 100 * s + k] as const;
    });
  strokes.push(
    ...brush(wave(4.2, 0), 2.1, [100, 100], { from: 0.25, to: 0.75, off: 0.9, w2: 1.4 }),
  );
  strokes.push(S(curve(wave(4.2, -6.5)), 1.1, "leve"));
  // Ondulações concêntricas nos dois cantos.
  strokes.push(S(curve(cornerArc(0, 11.5, { seed: 91, wobble: 0.4 })), 1.5));
  strokes.push(
    ...brush(
      cornerArc(0, 21, { seed: 92, wobble: 0, wave: { amp: 1.3, n: 8 }, step: 4 }),
      1.9,
      [0, 0],
      {
        off: 0.8,
      },
    ),
  );
  strokes.push(S(curve(cornerArc(0, 29.5, { seed: 93, wobble: 0.5, step: 5 })), 1.1, "leve"));
  strokes.push(
    ...brush(
      cornerArc(100, 15, { seed: 94, wobble: 0, wave: { amp: 1.1, n: 8 }, step: 4 }),
      1.8,
      [100, 100],
      {
        off: 0.7,
      },
    ),
  );
  strokes.push(S(curve(cornerArc(100, 24, { seed: 95, wobble: 0.5, step: 5 })), 1.2, "leve"));
  return {
    label: "Onda",
    idea: "Uma onda de crista ao meio cruza o ladrilho entre os cantos livres; ondulações concêntricas nos outros dois. Em 2×2, losangos de água em volta de círculos.",
    wash: [],
    strokes,
    dots: [
      { cx: 100, cy: 100, r: 2 },
      { cx: 0, cy: 0, r: 2.6 },
    ],
    pattern: "roseta",
  };
}

/* Moldura -------------------------------------------------------------------- */

function moldura(): TileArt {
  const strokes: TileStroke[] = [];
  const wash: string[] = [];
  // Filete duplo nas bordas de cima e da esquerda: em 2×2, uma moldura
  // inteira em volta do bloco; numa faixa, uma barra contínua.
  const outer = curve(
    hand(
      [
        [7.5, 104],
        [7.4, 70],
        [7.6, 36],
        [7.5, 7.5],
      ],
      101,
      0.15,
    ),
    hand(
      [
        [7.5, 7.5],
        [36, 7.6],
        [70, 7.4],
        [104, 7.5],
      ],
      106,
      0.15,
    ),
  );
  strokes.push(S(outer, 2.5));
  strokes.push(
    S(
      curve(
        [
          [12.6, 104],
          [12.5, 56],
          [12.6, 12.6],
        ],
        [
          [12.6, 12.6],
          [56, 12.5],
          [104, 12.6],
        ],
      ),
      1.1,
    ),
  );
  // Florão do canto: pétala central na diagonal e duas laterais espelhadas.
  const mid = leaf([16, 16], 45, 15.5, 6.8, { seed: 103, belly: 0.6 });
  const side = leaf([16.6, 17.4], 98, 10, 5, { seed: 104, bend: -1.4 });
  strokes.push(...leafStrokes(mid, 1.6, { vein: false }));
  strokes.push(...leafStrokes(side, 1.35, { vein: false }));
  strokes.push(...leafStrokes(mirrorLeaf(side), 1.35, { vein: false }));
  wash.push(leafWash(mid));
  // Canto (100,100): anel e pétala para fora — medalhão no centro do quadro.
  strokes.push(
    ...brush(cornerArc(100, 10.5, { seed: 105, wobble: 0.3 }), 1.7, [100, 100], { off: 0.6 }),
  );
  const petal = leaf([100 - 11.4 * Math.SQRT1_2, 100 - 11.4 * Math.SQRT1_2], 225, 11.5, 6.4, {
    seed: 107,
  });
  strokes.push(...leafStrokes(petal, 1.4, { vein: false }));
  strokes.push(S(curve(cornerArc(100, 30, { seed: 108, wobble: 0.6 })), 1.1, "leve"));
  return {
    label: "Moldura",
    idea: "Canto de moldura com filete duplo e um florão de três pétalas; quatro ladrilhos fecham um quadro com medalhão no meio, e numa faixa o filete corre contínuo.",
    wash,
    strokes,
    dots: [
      { cx: 3.6, cy: 3.6, r: 1.5 },
      { cx: 33.6, cy: 33.6, r: 1.3 },
      { cx: 100, cy: 100, r: 2.2 },
    ],
    pattern: "roseta",
  };
}

/* Trama ---------------------------------------------------------------------- */

function trama(): TileArt {
  const strokes: TileStroke[] = [];
  // Duas faixas (filete duplo) em arco, uma em torno de cada canto, que se
  // cruzam por cima e por baixo. Em 2×2: anéis entrelaçados, como corrente.
  const R = 77;
  const half = 3.3;
  const pad = 2.3;
  const nearB = (p: Pt) => Math.abs(dist(p, [100, 100]) - R) < half + pad && p[0] > p[1];
  const nearA = (p: Pt) => Math.abs(dist(p, [0, 0]) - R) < half + pad && p[1] > p[0];
  const bands: [0 | 100, (p: Pt) => boolean, number][] = [
    [0, nearB, 111],
    [100, nearA, 113],
  ];
  for (const [corner, gap, seed] of bands) {
    const c: Pt = [corner, corner];
    for (const [dr, w] of [
      [-half, 1.8],
      [half, 1.2],
    ] as const) {
      const pts = cornerArc(corner, R + dr, {
        seed: seed + (dr > 0 ? 1 : 0),
        wobble: 0.5,
        step: 3,
      });
      for (const part of arcWithGaps(pts, gap)) {
        if (dr < 0 && part.length > 8) strokes.push(...brush(part, w, c, { off: 0.7, w2: 1.1 }));
        else strokes.push(S(curve(part), w));
      }
    }
  }
  // Quartos de anel finos nos cantos.
  strokes.push(S(curve(cornerArc(0, 15, { seed: 116, wobble: 0.4 })), 1.2, "leve"));
  strokes.push(S(curve(cornerArc(100, 15, { seed: 117, wobble: 0.4 })), 1.2, "leve"));
  return {
    label: "Trama",
    idea: "Duas fitas em arco que passam uma por cima e outra por baixo; em 2×2 formam anéis entrelaçados, como uma corrente.",
    wash: [],
    strokes,
    dots: [
      { cx: 0, cy: 0, r: 3 },
      { cx: 100, cy: 100, r: 3 },
      { cx: 50, cy: 50, r: 1.4 },
    ],
    pattern: "roseta",
  };
}

/* Rosa ----------------------------------------------------------------------- */

/**
 * Flor aberta de pétalas redondas (eco das flores em aquarela do convite,
 * em linha de azulejo): duas coroas recortadas, miolo em espiral e quatro
 * folhas nas diagonais. Simétrica em y = x, como os outros ladrilhos.
 */
function rosa(): TileArt {
  const strokes: TileStroke[] = [];
  const wash: string[] = [];
  const scallop = (r: number, amp: number, lobes: number, phase: number, n = 60): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 360;
      const rr = r + amp * Math.abs(Math.cos(((a - phase) * DEG * lobes) / 2));
      return [50 + rr * Math.cos(a * DEG), 50 + rr * Math.sin(a * DEG)] as const;
    });
  // Coroa de fora: cinco pétalas, uma apontando para o canto (100,100).
  const outer = scallop(13.5, 4.6, 5, 45);
  strokes.push(S(loop(outer), 1.7));
  wash.push(loop(scallop(13.2, 4.6, 5, 45, 30).map(([x, y]) => [x + 0.7, y + 0.5] as const)));
  // Coroa de dentro, desencontrada.
  strokes.push(S(loop(scallop(7.6, 2.4, 5, 45 + 36)), 1.3));
  // Miolo: espiral curta.
  const spiral: Pt[] = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const a = 45 + t * 400;
    const r = 0.6 + t * 3.6;
    return [50 + r * Math.cos(a * DEG), 50 + r * Math.sin(a * DEG)] as const;
  });
  strokes.push(S(curve(spiral), 1.2));
  // Folhas nas diagonais, saindo de trás da coroa.
  [45, 135, 225, 315].forEach((a, i) => {
    const base: Pt = [50 + 15.5 * Math.cos(a * DEG), 50 + 15.5 * Math.sin(a * DEG)];
    const l = leaf(base, a, i % 2 ? 13 : 15.5, i % 2 ? 7 : 8.4, {
      seed: 131 + (i % 2),
      belly: 0.55,
    });
    strokes.push(...leafStrokes(l, i % 2 ? 1.35 : 1.5));
    if (i % 2 === 0) wash.push(leafWash(l));
  });
  // Botões nos lados livres (sobre a diagonal y = x, em par).
  const bud = (cx: number, cy: number, seed: number) =>
    S(loop(hand(arc(cx, cy, 2.6, 0, 330, { wobble: 0, step: 30 }), seed, 0.15)), 1.2);
  strokes.push(bud(80, 20, 141), bud(20, 80, 141));
  // Cantos: anel duplo em (0,0); anel com pétala em (100,100).
  strokes.push(...brush(cornerArc(0, 12, { seed: 143, wobble: 0.4 }), 1.7, [0, 0], { off: 0.7 }));
  strokes.push(S(curve(cornerArc(0, 17.5, { seed: 144, wobble: 0.5 })), 1.05, "leve"));
  strokes.push(
    ...brush(cornerArc(100, 9, { seed: 145, wobble: 0.3 }), 1.6, [100, 100], { off: 0.6 }),
  );
  strokes.push(S(curve(cornerArc(100, 22, { seed: 146, wobble: 0.6 })), 1.05, "leve"));
  return {
    label: "Rosa",
    idea: "Uma flor aberta de duas coroas recortadas e miolo em espiral, com folhas nas diagonais: o eco, em linha, das flores em aquarela do convite.",
    wash,
    strokes,
    dots: [
      { cx: 0, cy: 0, r: 2.4 },
      { cx: 100, cy: 100, r: 2 },
    ],
    pattern: "roseta",
  };
}

/* Laço ----------------------------------------------------------------------- */

function laco(): TileArt {
  const strokes: TileStroke[] = [];
  const wash: string[] = [];
  // Fita que corre na diagonal, afinando até os cantos, com um laço no meio.
  const ribbon = (from: Pt, to: Pt, bulge: number, seed: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 6; i++) {
      const s = i / 6;
      const b = bulge * Math.sin(Math.PI * s);
      out.push([from[0] + (to[0] - from[0]) * s + b, from[1] + (to[1] - from[1]) * s - b]);
    }
    return hand(out, seed, 0.25);
  };
  const a1 = ribbon([0, 0], [44.6, 46.4], 1.7, 121);
  const b1 = ribbon([55.4, 53.6], [100, 100], 1.7, 122);
  strokes.push(S(curve(a1), 1.6));
  strokes.push(S(curve(hand(mirror(a1), 123, 0.2)), 1.15));
  strokes.push(S(curve(b1), 1.6));
  strokes.push(S(curve(hand(mirror(b1), 124, 0.2)), 1.15));
  // Alças do laço, espelhadas, com a ponta redonda para os cantos livres.
  const loopA: Pt[] = [
    [53.2, 46],
    [54.4, 38.4],
    [57.6, 30],
    [63.4, 23.8],
    [70.8, 21.4],
    [76.8, 23.8],
    [78.8, 29.8],
    [76.2, 36.6],
    [69.6, 41.8],
    [61, 45.6],
    [55, 48.6],
  ];
  const loopB = hand(mirror(loopA), 125, 0.3);
  strokes.push(...brush(loopA, 1.8, [70, 30], { from: 0.45, to: 0.95, off: 0.9 }));
  strokes.push(...brush(loopB, 1.8, [30, 70], { from: 0.45, to: 0.95, off: 0.9 }));
  // Dobra da fita dentro das alças.
  const fold: Pt[] = [
    [57, 43.6],
    [63, 35.4],
    [69.6, 28.2],
  ];
  strokes.push(S(curve(fold), 1.05, "leve"));
  strokes.push(S(curve(mirror(fold)), 1.05, "leve"));
  // Pontas do laço: duas fitas curtas com corte em V, entre a fita e as
  // alças (espelhadas na diagonal).
  const tailOut: Pt[] = [
    [51.4, 54.2],
    [55.4, 62.6],
    [59.4, 71.6],
    [61.6, 79.4],
  ];
  const tailBack: Pt[] = [
    [69.8, 78.2],
    [65.8, 70.2],
    [60.6, 61.6],
    [54.6, 53.2],
  ];
  const tail = (o: Pt[], b: Pt[]) =>
    curve(
      o,
      [
        [61.6, 79.4],
        [64.4, 75.6],
      ],
      [
        [64.4, 75.6],
        [69.8, 78.2],
      ],
      b,
    );
  strokes.push(S(tail(tailOut, tailBack), 1.5));
  strokes.push(
    S(
      curve(
        hand(mirror(tailOut), 127, 0.2),
        mirror([
          [61.6, 79.4],
          [64.4, 75.6],
        ]),
        mirror([
          [64.4, 75.6],
          [69.8, 78.2],
        ]),
        hand(mirror(tailBack), 128, 0.2),
      ),
      1.5,
    ),
  );
  wash.push(loop(move([...tailOut.slice(1), [64.4, 75.6], ...tailBack.slice(0, -1)], 0.6, 0.5)));
  // Nó no centro.
  const knot = arc(50, 50, 4.6, 0, 330, { wobble: 0, step: 30 }).map(
    ([x, y]) => [50 + (x - 50) * 1.2, 50 + (y - 50) * 0.78] as const,
  );
  strokes.push(S(loop(hand(turn(knot, 45), 126, 0.15)), 2.1));
  wash.push(loop(move(loopA.slice(1, -1), 0.8, 0.6)));
  wash.push(loop(move(loopB.slice(1, -1), 0.6, 0.8)));
  return {
    label: "Laço",
    idea: "Uma fita na diagonal, que afina até os cantos, amarrada num laço de duas alças e duas pontas; em 2×2 as fitas se cruzam em X e desenham losangos.",
    wash,
    strokes,
    dots: [
      { cx: 100, cy: 0, r: 3.4 },
      { cx: 0, cy: 100, r: 3.4 },
      { cx: 88, cy: 12, r: 1.1 },
      { cx: 12, cy: 88, r: 1.1 },
    ],
    pattern: "roseta",
  };
}

export const TILE_ART: Readonly<Record<TileDesign, TileArt>> = {
  monograma: monograma(),
  ramo: ramo(),
  flor: flor(),
  onda: onda(),
  estrela: estrela(),
  moldura: moldura(),
  trama: trama(),
  laco: laco(),
  rosa: rosa(),
};

/* -------------------------------------------------------------------------- */
/* Monograma DG (abertura, cabeçalho, rodapé, selos, OG, ícone)               */
/* -------------------------------------------------------------------------- */

/**
 * Uma parte do monograma: o contorno preenchido (`d`) e a linha de centro
 * (`line`) na ordem de escrita, com a largura máxima da parte (`reach`), que
 * é a espessura da máscara que revela o preenchimento enquanto a linha corre.
 */
export interface MonogramPart {
  readonly id: string;
  readonly d: string;
  readonly line: string;
  readonly reach: number;
}

export interface MonogramArt {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  /** Ordem de escrita: haste do D, bojo do D que desce em S e fecha o G, esporão e barra, arco do G, pé do D. */
  readonly parts: readonly MonogramPart[];
}

/** Contorno: lado A na ida, lado B na volta; trechos retos com L, curvos suaves. */
function outline(
  start: readonly Pt[],
  a: readonly Pt[],
  mid: readonly Pt[],
  b: readonly Pt[],
): string {
  let d = `M${pt(start[0])}`;
  for (const p of start.slice(1)) d += `L${pt(p)}`;
  d += `L${pt(a[0])}${bez(a)}`;
  for (const p of mid) d += `L${pt(p)}`;
  d += `L${pt(b[0])}${bez(b)}`;
  return `${d}Z`;
}

/**
 * A ligadura DG do casal, redesenhada em vetor a partir do arquivo deles
 * (docs/marca/manual-1.png, 1000×1000; as coordenadas são as do arquivo).
 * Contraste de Didone: grossos só na haste do D, no S que é ao mesmo tempo o
 * bojo do D e o corpo do G, e no esporão do G; o resto é fio.
 */
function monogramArt(): MonogramArt {
  // Haste do D.
  const stem = "M92 262.5H154.5V736.5H92Z";

  // Fio de cima do D → S grosso → base do G até o esporão; o esporão e a
  // barra do G fecham o mesmo contorno.
  const swashTop: Pt[] = [
    [295, 262.5],
    [325, 267],
    [355, 274],
    [385, 286],
    [415, 303],
    [445, 328],
    [475, 363],
    [505, 413],
    [528, 470],
    [546, 525],
    [565, 576],
    [595, 638],
    [625, 679],
    [655, 706],
    [685, 722],
    [715, 729],
    [745, 731],
    [775, 726],
    [805, 715],
    [835, 696],
    [850.5, 680],
  ];
  const swashBottom: Pt[] = [
    [913, 668],
    [895, 689],
    [880, 702],
    [865, 712],
    [850, 720],
    [820, 732],
    [790, 739.5],
    [760, 743.5],
    [730, 744.5],
    [700, 741.5],
    [670, 735.5],
    [640, 725.5],
    [610, 710.5],
    [580, 687.5],
    [550, 656.5],
    [520, 612.5],
    [490, 547.5],
    [468, 480],
    [445, 421.5],
    [415, 362.5],
    [385, 323.5],
    [355, 298.5],
    [325, 284.5],
    [295, 276.5],
  ];
  const swash = outline(
    [
      [150, 262.5],
      [295, 262.5],
    ],
    swashTop,
    [
      [850.5, 532],
      [722.5, 532],
      [722.5, 517.5],
      [913, 517.5],
    ],
    swashBottom,
  ).replace(/Z$/, `L150 276.5Z`);

  // Pé do D: fio da base que sobe em arco e para com corte inclinado.
  const footTop: Pt[] = [
    [300, 722.5],
    [325, 719],
    [355, 711],
    [385, 696],
    [415, 672],
    [445, 633],
    [458, 610],
    [463, 600],
  ];
  const footBottom: Pt[] = [
    [471.5, 607],
    [466, 620],
    [454, 640],
    [441, 660],
    [424, 680],
    [401, 700],
    [385, 711.5],
    [355, 724.5],
    [325, 733.5],
    [300, 736.5],
  ];
  const foot = outline(
    [
      [150, 722.5],
      [300, 722.5],
    ],
    footTop,
    [],
    footBottom,
  ).replace(/Z$/, `L150 736.5Z`);

  // Arco do G: sobe do meio, passa por cima e desce até o corte da direita.
  const arcOuter: Pt[] = [
    [532.5, 399],
    [535, 390],
    [550, 361],
    [565, 338],
    [580, 319],
    [595, 304],
    [610, 292],
    [625, 282],
    [640, 273.5],
    [655, 267],
    [670, 262],
    [685, 258.5],
    [700, 256.5],
    [715, 255],
    [730, 254.5],
    [745, 255.5],
    [760, 257],
    [775, 260],
    [790, 264],
    [805, 270],
    [820, 277],
    [835, 286],
    [850, 298],
    [865, 313],
    [880, 331],
    [891, 349],
    [897.5, 361.5],
  ];
  const arcInner: Pt[] = [
    [888.5, 366.5],
    [879, 350],
    [865, 331.5],
    [850, 315.5],
    [835, 303.5],
    [820, 293.5],
    [805, 285.5],
    [790, 279.5],
    [775, 274.5],
    [760, 271.5],
    [745, 269.5],
    [730, 268.5],
    [715, 268.5],
    [700, 270.5],
    [685, 272.5],
    [670, 276.5],
    [655, 281.5],
    [640, 288.5],
    [625, 297.5],
    [610, 308.5],
    [595, 321.5],
    [580, 338.5],
    [565, 359.5],
    [550, 385.5],
    [543.5, 400.5],
  ];
  const arc = `M${pt(arcOuter[0])}${bez(arcOuter)}L${pt(arcInner[0])}${bez(arcInner)}Z`;

  return {
    viewBox: "92 254 822 492",
    width: 822,
    height: 492,
    parts: [
      { id: "haste", d: stem, line: "M123.3 262.5V736.5", reach: 64 },
      {
        id: "s",
        d: swash,
        line: `M150 269.5L295 269.5${bez([
          [295, 269.5],
          [355, 286],
          [405, 320],
          [445, 375],
          [474, 440],
          [497, 505],
          [520, 570],
          [550, 630],
          [590, 680],
          [640, 713],
          [700, 733],
          [760, 736],
          [820, 720],
          [870, 694],
          [892, 678],
        ])}`,
        reach: 76,
      },
      { id: "esporao", d: "", line: "M881.8 686V524.7H722.5", reach: 64 },
      {
        id: "arco",
        d: arc,
        line: `M538 399.5${bez([
          [538, 399.5],
          [560, 357],
          [600, 307],
          [660, 271],
          [730, 261.5],
          [800, 274],
          [860, 318],
          [893, 364],
        ])}`,
        reach: 30,
      },
      {
        id: "pe",
        d: foot,
        line: `M150 729.5L300 729.5${bez([
          [300, 729.5],
          [360, 717],
          [405, 690],
          [440, 652],
          [467, 603],
        ])}`,
        reach: 30,
      },
    ],
  };
}

/**
 * O esporão e a barra do G ficam no contorno do S (um só preenchimento), mas
 * têm a sua própria linha de escrita: a parte "esporao" reaproveita o
 * contorno do S como área revelável.
 */
function linkShared(art: MonogramArt): MonogramArt {
  const s = art.parts.find((p) => p.id === "s")!;
  return {
    ...art,
    parts: art.parts.map((p) => (p.id === "esporao" ? { ...p, d: s.d } : p)),
  };
}

export const MONOGRAM_ART: MonogramArt = linkShared(monogramArt());

/** Partes com preenchimento próprio (o esporão divide o contorno do S). */
export const MONOGRAM_FILLS: readonly string[] = MONOGRAM_ART.parts
  .filter((p) => p.id !== "esporao")
  .map((p) => p.d);

/* -------------------------------------------------------------------------- */
/* Serialização em texto (gerador de placeholders, OG, prévias)               */
/* -------------------------------------------------------------------------- */

export const TILE_COLORS = {
  marinho: "#15244B",
  royal: "#0B3270",
  serenity: "#92A8D1",
  celeste: "#BBD0EC",
  relevo: "#F3F9FD",
  branco: "#FFFFFF",
} as const;

export interface TileMarkupOptions {
  readonly rotate?: 0 | 90 | 180 | 270;
  readonly ink?: string;
  readonly inkSecondary?: string;
  /** Cor da aguada; `null` omite. */
  readonly wash?: string | null;
  readonly washOpacity?: number;
  /** Multiplica a espessura de todos os traços. */
  readonly weight?: number;
}

function strokeWidth(w: number, weight: number): number {
  return Math.round(w * weight * 100) / 100;
}

/**
 * Conteúdo de um ladrilho como texto SVG (um `<g>` no espaço 0–100, sem o
 * fundo). Para uso fora do React.
 */
export function tileMarkup(design: TileDesign, opts: TileMarkupOptions = {}): string {
  const art = TILE_ART[design];
  const {
    rotate = 0,
    ink = TILE_COLORS.branco,
    inkSecondary = TILE_COLORS.serenity,
    wash = TILE_COLORS.serenity,
    washOpacity = 0.13,
    weight = 1,
  } = opts;
  const t = rotate ? ` transform="rotate(${rotate} 50 50)"` : "";
  const washes =
    wash && art.wash.length
      ? `<g fill="${wash}" fill-opacity="${washOpacity}">${art.wash.map((d) => `<path d="${d}"/>`).join("")}</g>`
      : "";
  const strokes = art.strokes
    .map(
      (s) =>
        `<path d="${s.d}" stroke-width="${strokeWidth(s.w, weight)}"${s.tone ? ` stroke="${inkSecondary}"` : ""}/>`,
    )
    .join("");
  const dots = art.dots
    .map((c) => `<circle cx="${fmt(c.cx)}" cy="${fmt(c.cy)}" r="${fmt(c.r)}"/>`)
    .join("");
  const fills = (art.fills ?? [])
    .map(
      (f) =>
        `<path d="${f.d}"${f.transform ? ` transform="${f.transform}"` : ""}${f.stroke ? ` stroke="${ink}" stroke-width="${f.stroke}" stroke-linejoin="round"` : ""}/>`,
    )
    .join("");
  return `<g${t}>${washes}<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">${strokes}</g><g fill="${ink}">${dots}${fills}</g></g>`;
}

/** Monograma grande como texto SVG (conteúdo, sem o elemento `<svg>`). */
export function monogramMarkup(opts: { ink?: string; bold?: number } = {}): string {
  const { ink = TILE_COLORS.marinho, bold = 0 } = opts;
  const stroke = bold > 0 ? ` stroke="${ink}" stroke-width="${bold}" stroke-linejoin="round"` : "";
  return `<g fill="${ink}"${stroke}>${MONOGRAM_FILLS.map((d) => `<path d="${d}"/>`).join("")}</g>`;
}
