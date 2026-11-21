import { NextResponse, type NextRequest } from "next/server";
import { EVENT_HOST_HEADER, normalizeHost } from "@/lib/host";

/*
 * Proxy (o antigo "middleware" do Next; roda antes de qualquer rota, como um middleware
 * global do Laravel). Cada evento da plataforma é um host: aqui o Host vira o primeiro
 * segmento da URL (`/evento1.localhost%3A3000/presentes`), que o App Router entrega como o
 * root param `host` de `app/[host]`. Sem I/O: quem descobre o evento é `getEvent()`, com cache.
 */

/**
 * Host público da requisição. O `X-Forwarded-Host` vem primeiro: é o que o Caddy repassa e é
 * o que o próprio Next manda quando segue o `redirect()` de uma Server Action (ele busca a
 * página nova em `localhost:<porta>` com os headers originais; só pelo Host, o pedido feito em
 * outro evento abria a página do evento padrão).
 */
function publicHost(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host");
}

export function proxy(request: NextRequest) {
  const host = normalizeHost(publicHost(request));
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
