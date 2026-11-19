import { NextResponse, type NextRequest } from "next/server";
import { EVENT_HOST_HEADER, normalizeHost } from "@/lib/host";

/*
 * Proxy (o antigo "middleware" do Next; roda antes de qualquer rota, como um middleware
 * global do Laravel). Cada evento da plataforma é um host: aqui o Host vira o primeiro
 * segmento da URL (`/evento1.localhost%3A3000/presentes`), que o App Router entrega como o
 * root param `host` de `app/[host]`. Sem I/O: quem descobre o evento é `getEvent()`, com cache.
 */

export function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
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
  url.pathname = `/${encodeURIComponent(host)}${path === "/" ? "" : path}`;
  // `rewrite` muda a rota servida sem mudar a URL do navegador.
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Fora do proxy: arquivos do build, fotos/estáticos de public/, uploads (repassados à API),
  // o service worker e o /api/revalidar (a API chama com o eventId no corpo, sem host).
  matcher: ["/((?!_next/|uploads/|fotos/|placeholder/|sw\\.js$|offline\\.html$|api/revalidar$).*)"],
};
