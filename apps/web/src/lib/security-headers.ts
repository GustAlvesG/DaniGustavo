/*
 * Cabeçalhos de segurança do site (Fase 6, frente D), aplicados pelo `headers()` do
 * next.config.ts em todas as rotas. Sem `server-only`: o next.config importa este arquivo.
 *
 * Por que sem nonce: com `cacheComponents` as páginas são pré-renderizadas (casca estática +
 * ISR por host) e a doc do Next (guides/content-security-policy.md) diz que nonce exige
 * renderização dinâmica em toda página e é incompatível com a casca do PPR. Hashes também não
 * servem: os <script> inline do App Router carregam o payload RSC de cada página. Então o
 * `script-src` fica `'self' 'unsafe-inline'` (o modelo "Without Nonces" da doc) e o resto da
 * política fecha o que importa: nenhum script/estilo/conexão de outra origem, sem <object>,
 * sem <base> trocado, formulários só para a própria origem e o site nunca dentro de iframe.
 *
 * Fica de fora o que o snippet `seguranca` do edge já envia em produção (HSTS, nosniff,
 * Referrer-Policy; ver docs/DEPLOY.md): o edge regrava esses cabeçalhos e não haveria ganho.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/** Recursos do navegador que o site não usa (a área de transferência fica liberada: "Copiar Pix"). */
export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "hid=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "browsing-topics=()",
].join(", ");

/**
 * CSP do site. `dev` libera o que o `next dev` precisa: `'unsafe-eval'` (o React reconstrói
 * as pilhas de erro do servidor no navegador) e o WebSocket do HMR.
 */
export function siteCsp({ dev }: { dev: boolean }): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Tema do evento em style="" no <html> e estilos inline do next/font.
    ["style-src", "'self'", "'unsafe-inline'"],
    // Fotos (/uploads e /_next/image, mesma origem), QR do Pix em data URI, prévias em blob:.
    ["img-src", "'self'", "data:", "blob:"],
    // next/font serve as fontes da própria origem.
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(dev ? ["ws:", "wss:"] : [])],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    // A fatura do cartão (Asaas) abre por navegação (`location.assign`), não por formulário.
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  if (!dev) directives.push(["upgrade-insecure-requests"]);
  return directives.map((d) => d.join(" ")).join("; ");
}

export function siteSecurityHeaders({ dev }: { dev: boolean }): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: siteCsp({ dev }) },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    // Navegadores antigos que não conhecem frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
