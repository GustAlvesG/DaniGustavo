# Plataforma — Fase 1: fundação multi-evento

Branch `saas`. O `main` (tag `v1-casamento`) segue como o site do casamento até 10/04/2027.

**Pronto quando:** dois eventos rodam lado a lado (sites distintos por host), testes provam que um não enxerga dados do outro e o casamento atual vira "Organização 1 → Evento 1" sem perder dados.

**Fora do escopo:** editor de conteúdo/temas (F2), painel da organização e cadastro de evento pela UI (F3; na F1 usa-se a CLI), tarefas/fornecedores/orçamentos (F4), subcontas Asaas (F5), S3 (fica disco local com prefixo por evento).

## 1. Schema

**Tabelas próprias, sem o plugin organization do Better Auth**: o plugin só tem papéis por organização (`event_host` é por evento), expõe ~30 rotas que teriam de ser bloqueadas, usa IDs varchar(36) contra o bigint de `pk()`/`fk()` e a tabela `invitation` dele colide em nome com a nossa `invitations`.

Novo `packages/db/src/schema/tenancy.ts` (usa `pk()`/`fk()` de `app.ts`):

- `organizations`: id, `slug` varchar(64) único, `name`, `status` enum(active, suspended), timestamps.
- `events`: id, `organization_id` FK restrict, `slug` varchar(64) único global, `type` varchar(32) (wedding, fifteen, birthday, other), `name`, `status` enum(draft, active, archived), `timezone` varchar(64) padrão `America/Sao_Paulo`, `starts_at` datetime(3), timestamps; índice (organization_id).
- `event_domains`: id, `event_id` FK cascade, `host` varchar(191) único (minúsculo, com porta, como chega no Host), `is_primary`. O host primário substitui `SITE_URL` nos links.
- `organization_members`: (organization_id, user_id varchar(36) FK `user` cascade, `role` enum(owner, member)), único (org, user).
- `event_members`: (event_id, user_id, `role` enum(host)), único (event, user).
- `user.platform_role` varchar(32) nulo (`schema/auth.ts`), com `user.additionalFields: { platformRole: { input: false } }` em `auth.ts`.

`event_id` bigint NOT NULL em `invitations`, `guests`, `rsvp_logs`, `rsvp_reminders`, `gifts`, `gift_orders`, `payments`, `messages` (repetido nas filhas de propósito).

- Consistência pai/filho por FK composta: único (event_id, id) no pai; `guests(event_id, invitation_id)` → `invitations`, `gift_orders(event_id, gift_id)` → `gifts`, `payments(event_id, order_id)` → `gift_orders`. `messages.gift_order_id` (SET NULL) fica com FK simples e conferência na aplicação.
- Únicos: `gifts.slug` passa a (event_id, slug). `invitations.token`, `gift_orders.public_id`, `provider_order_id`, `payments.gateway_id` continuam globais.
- Índices: `gifts` (event_id, active, sort) substitui `gifts_active_sort_idx`; `gift_orders` (event_id, status, created_at) e mantém (status, expires_at); `invitations`, `guests`, `messages` com (event_id, ...).
- `settings` vira `event_settings`: PK (event_id, key), `is_public` mantido.
- `webhook_events` continua global e ganha `event_id` nulo (auditoria).
- ON DELETE de `events`: cascade em conteúdo (settings, invitations, gifts, messages); restrict em `gift_orders`/`payments`.

## 2. Migration `0006_multi_evento.sql`

`pnpm db:generate` para o snapshot e **SQL editado à mão** (o NOT NULL gerado preencheria 0 e quebraria a FK):

1. `CREATE TABLE` das novas tabelas.
2. Organização 1 (`org-1`, "Organização 1").
3. Evento 1 (`dani-gustavo`, wedding, active), com nome, `starts_at` e timezone lidos de `settings` via `INSERT ... SELECT` com `JSON_UNQUOTE(value)` (vale nos dois bancos).
4. Por tabela: `ADD COLUMN event_id ... NULL` → `UPDATE SET event_id = 1` → `MODIFY ... NOT NULL DEFAULT 1` → índices e FKs. O DEFAULT 1 é provisório (a 0007 remove na etapa 8).
5. `CREATE TABLE event_settings` → `INSERT ... SELECT 1, ...` → `DROP TABLE settings`.
6. `gifts`: `DROP INDEX gifts_slug_unique`, `ADD UNIQUE (event_id, slug)`.
7. Domínios e membros ficam fora do SQL (dependem do `.env`): seed/CLI. Em dev o seed cria `localhost:3000` e `evento1.localhost:3000` → evento 1.

Teste `packages/db/test/migration.test.ts`: banco temporário `casamento_mig_<ulid>`, aplica 0000–0005, insere dados no formato antigo, aplica 0006 e confere `event_id = 1`, settings copiadas e contagens.

## 3. Escopo na API

- Públicas: `/api/e/:slug/{site,gifts,messages,invitations,orders}`. Middleware `publicEvent` (`apps/api/src/tenancy/public.ts`): slug → evento (LRU 60 s), 404 se não `active`, `c.set("event", {id, slug, timezone, orgId})`. Caminho em vez de header: entra sozinho na chave do `"use cache"` do Next.
- Buscas por ID público (`/orders/:publicId`, `/invitations/:token`) sempre com `eventId`; outro evento → 404.
- `GET /api/hosts/:host` → `{id, slug, name, type, timezone, primaryHost}`.
- Painel: `/api/admin/events/:eventId/*` com `requireEventAccess` após `requireSession`: platform admin → tudo; membro da org → eventos da org; `event_members` → o evento; senão **404**. Matriz em `tenancy/permissions.ts` (`can(role, "orders.refund")`).
- `/api/admin/me`: usuário + eventos acessíveis.
- Garantias contra filtro esquecido:
  1. Serviços recebem `ev: EventCtx` como 1º argumento; helper `byEvent(table, ev)`.
  2. Auditor de SQL no setup do vitest da API (logger do `createDb`): SELECT/UPDATE/DELETE em tabelas com escopo sem `event_id` no WHERE falha; exceções em `crossEvent("motivo", fn)` (AsyncLocalStorage). Só avisa na etapa 3, falha a partir da etapa 8.
  3. Teste que enumera `app.routes`: toda rota sob `/api/admin/events/:eventId` com usuário de outro evento → 404.

## 4. Next

- `apps/web/src/proxy.ts`: normaliza Host (minúsculo, `^[a-z0-9.-]+(:\d+)?$`, senão 400), descarta `x-event-host` externo e grava o próprio, `NextResponse.rewrite('/' + encodeURIComponent(host) + path)`. Matcher exclui `_next`, `uploads`, `fotos`, `sw.js`, `offline.html`, `api/revalidar`. Sem I/O.
- `app/(site)` e o layout raiz vão para `app/[host]/`; `host` é root param (`import { host } from 'next/root-params'`), que entra na chave do `"use cache"`.
- `getEvent()` (`lib/api/event.ts`): `"use cache"`, `cacheTag('host:'+h)`, `/api/hosts/:host`, `notFound()` no 404.
- `getSite/getGifts/getWall` recebem o slug e usam `/api/e/<slug>/...` com tags `site:<id>` etc. (`CACHE_TAGS.site(id)` em `tags.ts`). `/api/revalidar` recebe `{eventId, tags}`. `SITE_URL` → `WEB_INTERNAL_URL`.
- `generateStaticParams` do layout `[host]`: hosts primários de `/api/hosts`; API fora (build no CI) → host reserva `build.invalid` com conteúdo de reserva.
- Server Actions e Route Handlers usam `headers().get('x-event-host')` → `getEvent(host)` (`presentes/actions.ts`, `recados/actions.ts`, `confirmar/actions.ts`, `c/[token]/actions.ts`, `api/pedidos/[publicId]/route.ts`).
- `manifest.ts` → `app/[host]/manifest.webmanifest/route.ts`; OG, ícones, apple-icon e `agenda.ics` sob `[host]`. `sw.js` igual.
- Uploads: `UPLOAD_DIR/<eventId>/<arquivo>`, URL `/uploads/<eventId>/<arquivo>`, rewrite `/uploads/:path*`; CLI `uploads:migrate` move os atuais para `1/`.
- Dev: `*.localhost`; `localhost:3000` segue sendo o evento 1. E2E: projeto `multi` com `evento1.localhost:3000` e `evento2.localhost:3000`.

## 5. Jobs, avisos e webhook

- Expiração e conciliação globais dentro de `crossEvent`; cada pedido leva seu `event_id` a `applyCharge`, que revalida as tags daquele evento.
- Lembretes iteram eventos `active` com `event_settings` de cada um; links por `eventBaseUrl(event)` (`tenancy/urls.ts`), substituindo `env.SITE_URL` em `notify.ts`, `invitations.ts`, `routes/invitations.ts`, `service.ts`, `content.ts`.
- `notify.ts`: destinatários = `event_members` (host) do evento (+ owners da org se `notify.org_owners`); `ADMIN_EMAIL_*` só no seed; texto usa `event.name`.
- Webhook: pedido via `externalReference`/`providerOrderId` → `event_id` gravado em `webhook_events`.

## 6. Painel

`/api/admin/me` no login: um evento → entra direto; vários → `#/eventos`. Hash `#/e/:eventId/...`; `painel/src/api.ts` prefixa `/api/admin/events/${eventId}`; seletor no cabeçalho. Login de host igual ao atual; CLI `user:add --email --event 1 --role host` ou `--org 1 --role owner|member`.

## 7. Testes de isolamento

- `apps/api/test/isolation.test.ts` com `createTestEvents()` (orgs A/B, presentes com o mesmo slug, pedidos, recados): listas não vazam; token/publicId/slug de B em A → 404 (GET, RSVP, criar pedido, card-checkout); settings não vazam.
- `apps/api/test/admin-isolation.test.ts`: enumeração de rotas (host de A, membro da org B, platform admin).
- `reminders.test.ts`/`orders.test.ts`: configuração e destinatários por evento; webhook de B só revalida B.
- Auditor de SQL ligado; `packages/db/test/migration.test.ts`; `apps/web/e2e/multi-evento.spec.ts`; teste do `proxy.ts`.

## 8. Etapas

| # | Etapa | Risco | Modelo |
|---|---|---|---|
| 1 | Schema + migration 0006 (DEFAULT 1 provisório) + seed (org 1, evento 1, domínios dev) + teste da migration | alto | opus |
| 2 | CLI: `org:create`, `event:create`, `domain:add`, `user:add`, `uploads:migrate`; papéis no seed | baixo | sonnet |
| 3 | `apps/api/src/tenancy/` (resolver, `publicEvent`, `requireEventAccess`, permissions, `crossEvent`, urls), auditor avisando, `GET /api/hosts/:host` | médio | opus |
| 4 | Rotas públicas em `/api/e/:slug`, `EventCtx` nos serviços, `event_settings`; rotas antigas como apelido do evento 1 | médio | sonnet |
| 5 | Painel: `admin/*` sob `/events/:eventId`, `/me`, seletor, hash com eventId, e2e do painel | médio | sonnet |
| 6 | Jobs, avisos, links, webhook, uploads por evento | médio | sonnet |
| 7 | Next: `proxy.ts`, `app/[host]`, lib/api com slug e tags, revalidar, Server Actions, manifest/OG/ícones/agenda, rewrite; sai o apelido legado | alto | opus |
| 8 | Testes de isolamento, auditor falhando, e2e com dois hosts, migration 0007 (remove DEFAULT 1) | médio | sonnet |
| 9 | CLAUDE.md, `.env.example` (`WEB_INTERNAL_URL`, `PLATFORM_BASE_DOMAIN`), PERSONALIZAR | baixo | haiku |

## 9. Decisões do usuário

Ver respostas registradas abaixo à medida que forem dadas.
