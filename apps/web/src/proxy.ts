import { NextResponse, type NextRequest } from "next/server";
import {
  EVENT_HOST_HEADER,
  createHostVerifier,
  normalizeHost,
  resolvePublicHost,
} from "@/lib/host";

/** Fase 6: segmento interno do site da plataforma (`app/plataforma`). */
const PLATFORM_SEGMENT = "/plataforma";

/*
 * Proxy (o antigo "middleware" do Next; roda antes de qualquer rota, como um middleware
 * global do Laravel). Cada evento da plataforma é um host: aqui o Host vira o primeiro
 * segmento da URL (`/evento1.localhost%3A3000/presentes`), que o App Router entrega como o
 * root param `host` de `app/[host]`. Quem descobre o evento é `getEvent()`, com cache; o único
 * I/O daqui é conferir um `X-Forwarded-Host` diferente do Host (também com cache).
 */

/** Consulta (com cache) se um host é de evento cadastrado e verificado. */
const knownHost = createHostVerifier();

export async function proxy(request: NextRequest) {
  const platformHost = normalizeHost(process.env.PLATFORM_HOST ?? null);
  // X-Forwarded-Host só de host cadastrado (ou o da plataforma); ver resolvePublicHost.
  const host = await resolvePublicHost(request.headers, { platformHost, verify: knownHost });
  if (!host) {
    return new NextResponse("Endereço inválido.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // O header que veio de fora é descartado: só vale o que o proxy grava.
  const headers = new Headers(request.headers);
  headers.set(EVENT_HOST_HEADER, host);

  // Route Handlers em app/api (ex.: /api/pedidos) seguem no mesmo caminho e leem o header.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers } });
  }

  const url = request.nextUrl.clone();
  const path = request.nextUrl.pathname;
  // Fase 6: o host da plataforma (landing, preços e cadastro) vai para `app/plataforma`, que é
  // um segmento estático ao lado de `app/[host]` (com root layout próprio). Os eventos nunca
  // chegam lá: o caminho deles sempre ganha o prefixo do host.
  if (platformHost && host === platformHost) {
    const inside = path === PLATFORM_SEGMENT || path.startsWith(`${PLATFORM_SEGMENT}/`);
    url.pathname = inside ? path : `${PLATFORM_SEGMENT}${path === "/" ? "" : path}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  const prefix = `/${encodeURIComponent(host)}`;
  // Os arquivos de metadados (ícone, OG) saem com o caminho interno `/<host>/icon`: se o
  // prefixo já é o do PRÓPRIO host, não repete (outro host no caminho continua prefixado).
  const already = path === prefix || path.startsWith(`${prefix}/`);
  url.pathname = already ? path : `${prefix}${path === "/" ? "" : path}`;
  // `rewrite` muda a rota servida sem mudar a URL do navegador.
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Fora do proxy: arquivos do build, estáticos de public/, uploads (repassados à API),
  // o service worker, o /api/revalidar (a API chama com o eventId no corpo, sem host) e o
  // /api/health (healthcheck do Docker/edge: responde com qualquer Host, sem evento).
  matcher: ["/((?!_next/|uploads/|sw\\.js$|offline\\.html$|api/revalidar$|api/health$).*)"],
};
