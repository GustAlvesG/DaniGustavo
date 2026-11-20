import type { BrowserContext } from "@playwright/test";

/*
 * O login do painel aceita 5 tentativas por minuto por IP (Better Auth, em todos os ambientes)
 * e os e2e do painel entram várias vezes seguidas. Cada arquivo manda, só no POST de login, o
 * próprio X-Forwarded-For (IP de documentação, 198.51.100.0/24), que fora do edge chega à API
 * como está: cada arquivo tem a sua cota e um não derruba o login do outro. Só no login, para
 * não mexer nas outras requisições (o site do Next também recebe as navegações).
 */
export async function routeLoginIp(context: BrowserContext, name: string): Promise<void> {
  let h = 0;
  for (const ch of `${name}:${process.pid}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ip = `198.51.100.${(h % 250) + 1}`;
  await context.route("**/api/auth/sign-in/**", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
}
