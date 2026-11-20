/*
 * Setup global dos e2e (idempotente): o site agora responde por Host, então cada porta de
 * teste precisa dos seus domínios em event_domains. Garante, pela CLI do banco
 * (packages/db/src/cli.ts):
 *  - evento 1 (dani-gustavo): localhost:<porta> e evento1.localhost:<porta>;
 *  - evento de teste 2 (ana-bruno, ativo, org-e2e): evento2.localhost:<porta>, com um
 *    presente que só ele tem, e um anfitrião só dele (E2E_HOST, senha nova a cada rodada).
 * Os domínios da porta 3000 (dev) já vêm do seed para o evento 1.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export const MULTI_EVENT = { slug: "ana-bruno", name: "Ana & Bruno", org: "org-e2e" } as const;

/** Anfitrião só do evento de teste (e2e da Fase 2 no painel); a senha muda a cada rodada. */
export const E2E_HOST = { email: "anfitriao-e2e@exemplo.com", name: "Anfitrião E2E" } as const;

const dbDir = join(__dirname, "..", "..", "..", "..", "packages", "db");
// O .env de dev usa Asaas de produção: nada aqui deve depender dele.
const env = { ...process.env, PAYMENT_PROVIDER: "simulado" };

function cli(args: string[]): string {
  return execFileSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: dbDir,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Saída de event:list: id, slug, org, status, domínios ("a (primário), b"). */
function listEvents() {
  return cli(["event:list"])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, slug, org, status, domains = ""] = line.split("\t");
      const hosts = domains === "-" ? [] : domains.split(", ").map((d) => d.split(" ")[0]!);
      return { id, slug, org, status, hosts };
    });
}

function ensureDomain(slug: string, host: string, primary: boolean) {
  const ev = listEvents().find((e) => e.slug === slug);
  if (ev?.hosts.includes(host)) return;
  cli(["domain:add", "--event", slug, "--host", host, ...(primary ? ["--primary"] : [])]);
}

export default function globalSetup() {
  const port = Number(process.env.E2E_PORT ?? 3100);

  if (!listEvents().some((e) => e.slug === MULTI_EVENT.slug)) {
    try {
      cli(["org:create", "--slug", MULTI_EVENT.org, "--name", "Organização E2E"]);
    } catch {
      // Já existe (rodada anterior): segue.
    }
    cli([
      "event:create",
      ...["--org", MULTI_EVENT.org, "--slug", MULTI_EVENT.slug, "--name", MULTI_EVENT.name],
      ...["--type", "wedding", "--starts-at", "2028-01-20T18:00:00-03:00", "--status", "active"],
    ]);
  }

  const ev2 = listEvents().find((e) => e.slug === MULTI_EVENT.slug)!;
  ensureDomain("dani-gustavo", `localhost:${port}`, false);
  ensureDomain("dani-gustavo", `evento1.localhost:${port}`, false);
  ensureDomain(MULTI_EVENT.slug, `evento2.localhost:${port}`, ev2.hosts.length === 0);

  execFileSync(process.execPath, [join(__dirname, "db-cli.mts"), "multi-gift", MULTI_EVENT.slug], {
    cwd: __dirname,
    env,
    encoding: "utf8",
  });

  // Variáveis definidas no setup global chegam aos workers dos testes.
  process.env.E2E_HOST_PASSWORD = randomBytes(18).toString("base64url");
  execFileSync(
    process.execPath,
    [
      join(__dirname, "db-cli.mts"),
      "e2e-host",
      JSON.stringify({
        slug: MULTI_EVENT.slug,
        ...E2E_HOST,
        password: process.env.E2E_HOST_PASSWORD,
      }),
    ],
    { cwd: __dirname, env, encoding: "utf8" },
  );
}
