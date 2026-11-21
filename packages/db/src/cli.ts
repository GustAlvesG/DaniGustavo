import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createDb } from "./client.ts";
import { requireDatabaseUrl } from "./env.ts";
import { importLegacyContent } from "./legacy/import.ts";
import { runMigrations } from "./migrate.ts";
import { resetDatabase } from "./reset.ts";
import { listInvitationTokens, seed, setup } from "./seed.ts";
import {
  addDomain,
  addUser,
  createEvent,
  createOrganization,
  listEvents,
  migrateUploads,
  setOrganizationPlan,
} from "./tenancy-admin.ts";

const HELP = `Uso: node src/cli.ts <comando> [opções]

Banco:
  migrate                      aplica as migrations
  seed                         popula dados fictícios (idempotente; desenvolvimento)
  setup                        primeira carga em produção: evento 1, configurações, admins e o
                               host de SITE_URL como domínio do evento 1 (sem dados fictícios;
                               idempotente; docs/DEPLOY.md). Com SETUP_WEDDING=0: só planos,
                               contas de ADMIN_EMAIL_* e o admin da plataforma (sem evento)
  reset                        apaga tudo, migra e popula (só fora de produção)

Plataforma:
  org:create --slug <s> --name "<n>" [--plan essencial|profissional|cortesia]
               cria a organização com assinatura no plano (padrão: essencial, em teste;
               cortesia = interno, sem limites nem cobrança)
  org:plan <id|slug> <plano>   troca o plano da organização sem cobrança (cortesia → interno;
                               saindo do interno → teste do plano); ajuste da cobrança no painel
  event:create --org <id|slug> --slug <s> --name "<n>" --type wedding|fifteen|birthday|other
               --starts-at <ISO com offset, ex. 2027-04-10T16:00:00-03:00>
               [--timezone America/Sao_Paulo] [--status draft|active]
               cria o evento (starts_at gravado em UTC) com as configurações neutras
               couple.names, couple.monogram, wedding.datetime e wedding.timezone
  domain:add --event <id|slug> --host <host[:porta]> [--primary]
               --primary desmarca o primário anterior do evento
  user:add --email <e> --name "<n>" [--platform-admin]
           (--org <id|slug> --role owner|member | --event <id|slug> --role host)
               cria o usuário com senha temporária (impressa uma única vez); se já existir,
               só adiciona o vínculo
  event:list                   lista id, slug, organização, status e domínios
  content:import-legacy [--event dani-gustavo] [--upload-dir <pasta>]
               leva o conteúdo fixo do casamento (textos, fotos, galeria) para o banco e para
               o Storage (UPLOAD_DIR); idempotente, não sobrescreve o que foi editado no painel
  uploads:migrate              move UPLOAD_DIR/* para UPLOAD_DIR/1/ e atualiza gifts.image do
                               evento 1 (a API serve por evento; a rota antiga ainda acha os arquivos de 1/)
`;

const UPLOAD_DIR_PADRAO = fileURLToPath(
  new URL("../../../apps/api/storage/uploads", import.meta.url),
);

type Flags = Record<string, string | boolean | undefined>;

function parseFlags(args: string[]): Flags {
  try {
    return parseArgs({
      args,
      allowPositionals: false,
      options: {
        slug: { type: "string" },
        name: { type: "string" },
        org: { type: "string" },
        event: { type: "string" },
        type: { type: "string" },
        "starts-at": { type: "string" },
        timezone: { type: "string" },
        status: { type: "string" },
        host: { type: "string" },
        "upload-dir": { type: "string" },
        primary: { type: "boolean" },
        email: { type: "string" },
        role: { type: "string" },
        "platform-admin": { type: "boolean" },
        plan: { type: "string" },
      },
    }).values;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

function need(flags: Flags, name: string): string {
  const v = flags[name];
  if (typeof v !== "string" || v === "") throw new Error(`Falta a opção --${name}.`);
  return v;
}

const opt = (flags: Flags, name: string) =>
  typeof flags[name] === "string" ? (flags[name] as string) : undefined;

async function printTokens() {
  console.log("\nConvites de desenvolvimento (abra /c/<token> no site):");
  for (const inv of await listInvitationTokens(db)) {
    console.log(`  ${inv.token}  ${inv.label}  [${inv.guests.join(", ")}]`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const db = createDb(requireDatabaseUrl());

try {
  if (command === "migrate") {
    await runMigrations(db);
    console.log("Migrations aplicadas.");
  } else if (command === "seed") {
    console.log("Seed concluído:", await seed(db));
    await printTokens();
  } else if (command === "setup") {
    console.log("Setup concluído:", await setup(db));
  } else if (command === "reset") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("db:reset apaga todos os dados e só pode rodar fora de produção.");
    }
    await resetDatabase(db);
    console.log("Tabelas apagadas.");
    await runMigrations(db);
    console.log("Migrations aplicadas.");
    console.log("Seed concluído:", await seed(db));
    await printTokens();
  } else if (command === "org:create") {
    const f = parseFlags(rest);
    const org = await createOrganization(db, {
      slug: need(f, "slug"),
      name: need(f, "name"),
      plan: opt(f, "plan"),
    });
    console.log(`Organização criada: id ${org.id}, slug ${org.slug}, plano ${org.plan}.`);
  } else if (command === "org:plan") {
    const [orgRef, planRef, ...extra] = rest;
    if (!orgRef || !planRef || extra.length > 0) {
      throw new Error("Uso: org:plan <id|slug da organização> <código do plano>.");
    }
    const r = await setOrganizationPlan(db, orgRef, planRef);
    console.log(`Organização ${r.organization}: plano ${r.plan} (situação ${r.status}).`);
  } else if (command === "event:create") {
    const f = parseFlags(rest);
    const ev = await createEvent(db, {
      org: need(f, "org"),
      slug: need(f, "slug"),
      name: need(f, "name"),
      type: need(f, "type"),
      startsAt: need(f, "starts-at"),
      timezone: opt(f, "timezone"),
      status: opt(f, "status"),
    });
    console.log(`Evento criado: id ${ev.id}, slug ${ev.slug}, status ${ev.status}.`);
  } else if (command === "domain:add") {
    const f = parseFlags(rest);
    const d = await addDomain(db, {
      event: need(f, "event"),
      host: need(f, "host"),
      primary: f.primary === true,
    });
    console.log(
      `Domínio ${d.host} adicionado ao evento ${d.eventId}${d.isPrimary ? " (primário)" : ""}.`,
    );
  } else if (command === "user:add") {
    const f = parseFlags(rest);
    const r = await addUser(db, {
      email: need(f, "email"),
      name: need(f, "name"),
      platformAdmin: f["platform-admin"] === true,
      org: opt(f, "org"),
      event: opt(f, "event"),
      role: opt(f, "role"),
    });
    if (r.temporaryPassword) {
      console.log(`Usuário criado. Senha temporária (aparece só agora): ${r.temporaryPassword}`);
    } else {
      console.log(
        r.linked
          ? "Usuário já existia; vínculo adicionado."
          : "Usuário já existia; nada a alterar.",
      );
    }
  } else if (command === "event:list") {
    for (const e of await listEvents(db)) {
      console.log(`${e.id}	${e.slug}	${e.organization}	${e.status}	${e.domains.join(", ") || "-"}`);
    }
  } else if (command === "uploads:migrate") {
    const dir = process.env.UPLOAD_DIR || UPLOAD_DIR_PADRAO;
    const r = await migrateUploads(db, dir);
    console.log(
      `${r.filesMoved} arquivo(s) movido(s) para ${dir}/1; ${r.giftsUpdated} presente(s) atualizado(s).`,
    );
  } else if (command === "content:import-legacy") {
    const f = parseFlags(rest);
    const r = await importLegacyContent(db, {
      event: opt(f, "event"),
      uploadDir: opt(f, "upload-dir") ?? (process.env.UPLOAD_DIR || undefined),
    });
    console.log(
      `Evento ${r.eventId}: ${r.mediaCreated} foto(s) nova(s) em event_media (${r.mediaTotal} no total), ` +
        `${r.filesCopied} arquivo(s) copiado(s); site.sections ${r.sectionsWritten ? "gravado" : "já existia (mantido)"}; ` +
        `${r.legacyKeysRemoved} chave(s) antiga(s) removida(s).`,
    );
  } else if (command === "help" || command === "--help") {
    console.log(HELP);
  } else {
    throw new Error(`Comando desconhecido: "${command ?? ""}".

${HELP}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
