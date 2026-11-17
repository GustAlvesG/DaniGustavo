/*
 * QR ilustrativo do modo simulado: tem cara de QR (três marcadores nos cantos
 * e módulos espalhados a partir do código), mas não é lido por nenhum banco.
 * Gerar um QR de verdade exigiria uma dependência nova; no Mercado Pago real
 * a imagem vem pronta da API.
 */

const SIZE = 29;

function hash(text: string): () => number {
  // xorshift simples a partir do código: o mesmo pedido desenha o mesmo padrão.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

const inFinder = (x: number, y: number) => {
  const near = (a: number, b: number) => a >= 0 && a < 8 && b >= 0 && b < 8;
  return near(x, y) || near(SIZE - 1 - x, y) || near(x, SIZE - 1 - y);
};

export function SimulatedQr({ code, className }: { code: string; className?: string }) {
  const rand = hash(code);
  const modules: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (inFinder(x, y)) continue;
      if (rand() > 0.52) modules.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const finder = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg
      viewBox={`-2 -2 ${SIZE + 4} ${SIZE + 4}`}
      className={className}
      role="img"
      aria-label="QR code ilustrativo da simulação (não é um Pix de verdade)"
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={SIZE + 4} height={SIZE + 4} fill="#fff" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={[finder(0, 0), finder(SIZE - 7, 0), finder(0, SIZE - 7), ...modules].join("")}
      />
    </svg>
  );
}
