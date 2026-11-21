O modelo Opus deve ser apenas orquestrar a operação e delegar as tarefas para subagentes Opus ou inferior para execução das tarefas. Deverá ser selecionado entre Opus, Sonnet e Haiku de acordo com a dificuldade do processo.

## Visão geral

Branch `saas`: plataforma multi-evento (Plataforma → Organização → Evento → site por host). O casamento de Dani & Gustavo é o evento 1 (`dani-gustavo`, org 1); `main`/tag `v1-casamento` segue como o site do casamento até 10/04/2027. Cada evento tem site público (convidados, RSVP, lista de presentes, recados) e painel. Plano da fase em `docs/saas/fase-1.md`; especificação original do casamento em `docs/PROMPT.md` (pt-BR). Gustavo é dev Laravel: explique decisões não óbvias do Next.js em uma linha.

## Stack (como construído)

- Monorepo pnpm 12 (`pnpm-workspace.yaml`), Node 24 (roda `.ts` direto, sem build com tsc).
- `apps/web`: Next.js 16.4.6, React 19.3.0, Tailwind 4.3.3, Vitest 5 + Playwright 1.65.
- `apps/api`: Hono 4.13 (@hono/node-server), Better Auth 1.7 (só e-mail+senha, sem 2FA; rate limit no login), Zod 4, painel React + Vite 8 em `/painel`.
- `packages/db` (`@casamento/db`): Drizzle ORM 0.45 + mysql2 3.24 + drizzle-kit 0.31, migrations e seed.
- Banco: MariaDB 10.4 (XAMPP) em dev, MySQL 8 no CI. TypeScript 5.9, ESLint 9 (flat), Prettier 3.

## Estrutura

- `apps/web/` site público (`src/app/[host]/` = site por evento; `src/proxy.ts` transforma o Host no root param `host`; `src/lib/site.ts` monta menu/seções/módulos de `SiteContent`; `src/lib/site-fallback.ts` = reserva neutra sem API; temas em `src/themes/` (`vars.ts`, `fonts.ts`, `festa/`, `moderno/`); leia `apps/web/AGENTS.md` e `node_modules/next/dist/docs/`). Nenhum texto/foto de evento no código: tudo vem do banco e se edita no painel; guia em `docs/PERSONALIZAR.md`.
- `apps/api/` API Hono (`src/app.ts`, `auth.ts`, `env.ts`, `middleware/`, rotas do painel em `src/admin/`) e painel (`painel/`: `App.tsx` com rotas por hash, `pages/`, `ui.tsx`, `api.ts`).
- `apps/api/src/tenancy/`: resolver de evento (LRU 60 s), `publicEvent`, `requireEventAccess`, permissões, `crossEvent`, `eventBaseUrl`.
- `packages/db/` schema (`src/schema/tenancy.ts`: organizações, eventos, domínios, membros), migrations, seed, `src/cli.ts` (CLI de plataforma em `src/tenancy-admin.ts`).
- `docs/saas/` plano e decisões da plataforma (`fase-1.md`).
- `docs/PROMPT.md` especificação; `.github/workflows/ci.yml`; `docker-compose.yml` (opcional, só dev); `.screenshots/` (ignorado pelo git).
- Produção (VPS + Docker): `Dockerfile` (alvos `web` e `api`), `docker-compose.prod.yml`, `deploy/site.caddy`, `deploy/deploy.conf`, `.env.production.example`, `scripts/setup-vps.sh`, `scripts/backup-db.sh`; passo a passo em `docs/DEPLOY.md`.

## Comandos

Setup do zero: `cp .env.example .env` (preencher) → subir MariaDB (`C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini`) → `pnpm install` → `pnpm db:reset` → `pnpm dev`.

- `pnpm dev` sobe web e api em paralelo; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` / `format:check`.
- E2E: `pnpm --filter @casamento/web test:e2e`.
- Banco: `pnpm db:generate`, `db:migrate`, `db:seed`, `db:reset`; `db:setup` = primeira carga em produção (evento 1, configurações, admins + vínculos, host de `SITE_URL` como domínio do evento 1 se não houver nenhum; sem dados fictícios; idempotente).
- CLI de plataforma (de qualquer lugar: `pnpm --filter @casamento/db exec node src/cli.ts <comando>`): `org:create` (`--plan essencial|profissional|cortesia`), `org:plan <org> <plano>` (troca sem cobrança), `event:create`, `domain:add`, `user:add`, `event:list`, `uploads:migrate`, `content:import-legacy` (leva o casamento de `packages/db/src/legacy` + fotos de `packages/db/legacy/dani-gustavo/fotos` para o banco; idempotente, roda no seed/setup); sem argumentos lista as opções. Passo a passo em `docs/PERSONALIZAR.md`.
- Testes da API usam o banco `casamento_api_test` (ou `TEST_DATABASE_URL`), recriado, migrado e semeado no global-setup; nunca o banco de dev. O auditor de SQL (consulta sem `event_id` fora de `crossEvent` falha) vem ligado; `AUDIT_STRICT=0` desliga.
- E2E multi-evento: `pnpm --filter @casamento/web exec playwright test --project=multi` (o setup global cria `ana-bruno`, os domínios da porta de teste e o anfitrião `anfitriao-e2e@exemplo.com` só dele, com senha nova a cada rodada).
- E2E ao lado dos servidores do usuário: `E2E_PORT=3100 E2E_API_PORT=3343 NEXT_DIST_DIR=.next-e2e PAYMENT_PROVIDER=simulado pnpm --filter @casamento/web exec playwright test` (a API dos e2e monta o painel antes e revalida o site do e2e por `WEB_INTERNAL_URL`; local roda com 2 workers: com 6, o `next dev` às vezes corrompe um JSON ao compilar rotas em paralelo). Projetos: `mobile`, `desktop`, `painel` (inclui `painel-fase2.spec.ts`), `multi`, `prazo`.
- Se `drizzle-kit migrate` falhar em silêncio: `pnpm --filter @casamento/db exec node src/cli.ts migrate`.

## URLs locais

- Site: http://localhost:3000 e http://evento1.localhost:3000 → evento 1 (h1 "Dani & Gustavo"); http://evento2.localhost:3000 → `ana-bruno` (fixture do e2e)
- API: http://localhost:3333/api/health
- Painel: http://localhost:3333/painel/

## Convenções

- Texto do site e do painel em pt-BR correto (acentos, tom caloroso, sem inglês na interface; regras completas em PROMPT §2).
- Commits em Conventional Commits, em pt-BR, terminando com linha em branco e `Co-Authored-By: ...`.
- Conteúdo provisório marcado com `TODO(conteudo)`.
- Dinheiro sempre em centavos (inteiro). IDs são ULID.
- Server Components por padrão; `"use client"` só quando necessário.
- Ler a documentação instalada da lib antes de usá-la (Next 16 difere do que se conhece).
- Não adicionar dependências sem perguntar.
- No fim de toda fase de UI, tirar screenshots em 390×844 e 1440×900 em `.screenshots/faseN/`.
- Importar helpers do Drizzle (`eq`, `and`, `sql`...) de `@casamento/db`, não de `drizzle-orm`.
- Um único `.env` na raiz, carregado por `loadRootEnv()`.

## Decisões (substituem PROMPT.md §3 e §6-8 onde houver conflito)

- Sem PHP: Laravel/Filament/Pest/dx-php foram trocados por `apps/api` (Hono + Better Auth, cadastro desativado, sem 2FA por decisão do casal) e `packages/db` (Drizzle).
- Painel próprio em React+Vite servido em `/painel`; em dev: `vite build --watch` + `node --watch`, sem HMR (atualizar a página). Rotas por hash (`#/convites/12`), sem roteador; formulários com estado React + schemas zod de `packages/shared/src/admin.ts`; visual de ferramenta (fonte do sistema, paleta do site).
- `/api/admin/*` (evento em `/api/admin/events/:eventId/*`): sessão do Better Auth obrigatória (`requireSession`), isento de X-Web-Key; escrita com `Origin` de outra origem → 403 (CSRF); rate limit por usuário em reembolso, conciliação, upload e novo link; troca de senha limitada a 5/min no Better Auth.
- Fotos dos presentes: upload pelo painel (JPG/PNG/WebP até 2 MB, tipo conferido pelos bytes) em `UPLOAD_DIR/<eventId>` (padrão `apps/api/storage/uploads`, fora do git), servidas pela API em `/uploads/:eventId/:arquivo`; o Next repassa `/uploads/*` à API por `rewrites`.
- Cache do site após mudanças no painel: a API chama `POST WEB_INTERNAL_URL/api/revalidar` (fallback `SITE_URL`; Route Handler do Next, protegido pelo mesmo `X-Web-Key`) com `{ eventId, tags }`; tags por evento (`site:<id>`, `gifts:<id>`, `messages:<id>`) → `revalidateTag(tag, { expire: 0 })`.
- Reembolso (`src/orders/reconcile.ts`): `PaymentProvider.refund` + `applyCharge` (cotas devolvidas, recado sai do mural). Conciliação: botão no painel e rotina diária (`startReconcileJob` em `src/jobs.ts`) sobre pendentes e pedidos dos últimos 3 dias.
- Pagamentos atrás da interface `PaymentProvider` (`apps/api/src/payments/`): `simulado` (padrão; Pix fictício, cartões 4111…1111 aprova / 4000…0002 recusa, botão "Simular pagamento aprovado" que chama `POST /api/e/:slug/dev/orders/:id/approve`, só fora de produção, e entrega à rota real um webhook no formato do Asaas) e `asaas` (API v3 com `fetch`, sem SDK; Mercado Pago removido por decisão do casal). Asaas: Pix na nossa tela (cliente por CPF → cobrança PIX → `/pixQrCode`); cartão na fatura hospedada (`invoiceUrl`, `POST /api/e/:slug/orders/:id/card-checkout`), dados do cartão nunca passam por nós. CPF obrigatório no formulário só com Asaas (`requiresCpf` em `/api/e/:slug/gifts`), validado por dígitos, repassado ao Asaas e nunca gravado/logado. `.env`: `PAYMENT_PROVIDER=simulado|asaas` (explícito), `ASAAS_API_KEY`, `ASAAS_ENV` (deduzido pelo prefixo `$aact_hmlg_`/`$aact_prod_`; diverge → API não sobe), `ASAAS_WEBHOOK_TOKEN` (obrigatório em produção). Plataforma (Fase 5): a cobrança sai da subconta do recebedor do evento (`forAccount`) com split para a carteira da plataforma; ver "Decisões da Fase 5". Passo a passo em `docs/PERSONALIZAR.md` §6.
- Pedidos: `gifts.quota_sold` conta vendidas + reservadas; reserva com `SELECT … FOR UPDATE` na transação; pendente segura 30 min; rotina de expiração a cada 5 min dentro do processo da API (`src/jobs.ts`, `setInterval`), que antes confere no provedor se não foi pago e, no Asaas, apaga as cobranças abertas (o QR do Asaas valeria meses). Webhook `/api/webhooks/payments` confere o header `asaas-access-token` em tempo constante (401), ignora eventos que não mudam o pedido, é idempotente (`webhook_events.event_id` = id do evento, `payments.gateway_id`) e sempre consulta o status no provedor. Sem webhook, `GET /api/e/:slug/orders/:id` consulta o Asaas no máximo a cada 15 s por pedido. `applyCharge` em `src/orders/service.ts` é o único lugar que marca pedido como pago (e apaga a outra cobrança aberta do pedido).
- Status do Pix no navegador: Route Handler `/api/pedidos/[publicId]` do Next consultado a cada 3 s.
- Login do painel só com e-mail e senha (2FA removido a pedido do casal); rate limit do Better Auth ligado em todos os ambientes (5 tentativas/min por IP em `/sign-in/email`).
- Sem Docker local: dev usa MariaDB do XAMPP; `docker-compose.yml` é opcional; CI usa MySQL 8.
- Deploy (`docs/DEPLOY.md`, contrato na seção "Deploy: contrato da VPS ArtZan" abaixo): Docker na VPS compartilhada; o Caddy é o edge único (`/srv/edge`), sem Caddy no projeto. `name: casamento` e `SLUG="casamento"` não mudam (volumes com dados); aliases na rede `edge`: `casamento-web` e `casamento-api`; `db` só na rede `banco`. Dois hosts (`deploy/site.caddy`): `DOMAIN` → web, `API_DOMAIN` → api (painel, login, webhook do Asaas); no host da API só passam `/painel`, `/api/auth`, `/api/admin`, `/api/webhooks`, `/api/health` e `/uploads`. Web build com `NEXT_OUTPUT=standalone` (só no Docker) e `outputFileTracingRoot` na raiz; `NEXT_PUBLIC_SITE_URL` e `API_URL` (rewrite de `/uploads`) são build args. Revalidação pela rede interna (`WEB_INTERNAL_URL=http://web:3000`), `/api/revalidar` fechado no `site.caddy`; `/api/health` do Next fica fora do `proxy.ts` (responde com qualquer Host). Plataforma em produção: hosts em `event_domains` (o `setup` cadastra o de `SITE_URL`), ver DEPLOY.md "Plataforma multi-evento". IP real: snippet `ip_real` do edge sobrescreve `X-Forwarded-For`/`X-Real-IP` com `{client_ip}` (Cloudflare em `trusted_proxies` no global do edge). Pool do mysql2 com `jsonStrings: true` (MySQL 8 e MariaDB ≥ 10.5 devolviam JSON já convertido e quebravam o parse).
- Schema compatível com MariaDB 10.4 e MySQL 8: sem `serial`, coluna JSON customizada (parse na leitura), DATETIME(3) em UTC preenchido pelo app, varchar indexado ≤191.
- Projeto em `C:\dev\casamento` (fora do OneDrive).
- Web→API: Server Actions enviam `X-Web-Key` em não-GET `/api/*` (o evento vem do `x-event-host` gravado pelo `proxy.ts`); `/api/webhooks/*` e `/api/auth/*` são isentos. URL e chave da API nunca vão ao bundle do cliente.
- Design "Álbum" (Proposta C): papel + tinta marinho, polaroids, cartões de fio duplo; tokens em `globals.css`, peças em `src/app/album.css`; revelações por `animation-timeline: view()` (sem JS), menu fixo de 72px com a data entrando ao rolar (IntersectionObserver).
- Next 16: `cacheComponents: true` (dados de runtime sob Suspense ou em cache); Tailwind v4 via `@tailwindcss/turbopack` (sem postcss config); ESLint flat com `eslint` puro; `typecheck` = `next typegen && tsc --noEmit`.

## Decisões da plataforma (branch saas; ver `docs/saas/fase-1.md`)

- Tabelas próprias (`organizations`, `events`, `event_domains`, `organization_members`, `event_members`, `user.platform_role`) em vez do plugin organization do Better Auth: papel por evento (`event_host`) não existe nele, expõe ~30 rotas a bloquear, IDs varchar(36) contra bigint e a `invitation` dele colide com a nossa `invitations`.
- Papéis: `platform_admin`, `org_owner`, `org_member`, `event_host` (matriz em `tenancy/permissions.ts`, `requirePermission` → 403). Evento de que o usuário não participa → 404 (não revela que existe).
- Rotas: públicas em `/api/e/:slug/*` (evento `active` ou 404); painel em `/api/admin/events/:eventId/*`; `GET /api/hosts` (hosts primários) e `/api/hosts/:host`; `/api/admin/me` lista os eventos do usuário. Sem as antigas `/api/{site,gifts,orders,invitations,messages,dev}` nem `/uploads/:file`.
- Isolamento: serviços recebem `ev: EventCtx` como 1º argumento e filtram com `byEvent(tabela, ev)`; leitura entre eventos só dentro de `crossEvent("motivo", fn)` (jobs, webhook); `event_id` NOT NULL sem default, FKs compostas pai/filho; token, `publicId` e slug de outro evento dão 404. `webhook_events.app_event_id` guarda o evento do pedido.
- Next: o Host vira o root param `host` (`proxy.ts` → rewrite para `/<host>/...`; Host inválido 400, `.invalid` recusado), que entra na chave dos `"use cache"`. `generateStaticParams` usa `/api/hosts`; com a API fora do ar (build), host reserva `build.invalid`. Host desconhecido → 404.
- Uploads em `UPLOAD_DIR/<eventId>/`, servidos em `/uploads/:eventId/:file` (`uploads:migrate` move os antigos para `1/`).
- Links de e-mail/WhatsApp/QR usam `eventBaseUrl(event)` (host primário de `event_domains`; sem domínio, cai em `SITE_URL`).
- Avisos de pedido/RSVP vão para os hosts (`event_members`) e, com `notify.org_owners` nas configurações privadas, também para os owners da org (sem hosts, os owners entram). `ADMIN_EMAIL_*` só servem ao seed. Avisos só por e-mail (o Telegram foi removido na Fase 6).
- Configurações por evento em `event_settings` (PK `event_id, key`), não mais `settings` global. Lembretes de RSVP iteram os eventos ativos, cada um com a sua configuração.
- Sem conteúdo de evento no código e nenhum `slug === "dani-gustavo"`: o que era especial do casamento virou dado (`couple.monogram_art: "dg"` = ligadura DG; `calendar.uid` = UID fixo da agenda), gravado pelo `content:import-legacy`.

## Decisões da Fase 2 (ver `docs/saas/fase-2.md`)

- Conteúdo em `event_settings` (JSON validado por zod de `packages/shared`): `site.sections` (seções da home e páginas, fotos por `PhotoRef { mediaId }`), `site.theme`, `event.modules`, `event.vocabulary` (públicos) e `event.sides` (privado); cada uma com rota própria no painel (`/site`, `/appearance`, `/config`), o PUT genérico de `/settings` recusa.
- Fotos do evento na tabela `event_media` (upload múltiplo em `/media`, miniatura gerada no navegador por canvas, tipo conferido pelos bytes) atrás da interface `Storage` (`apps/api/src/storage`, disco local); presentes também pelo `Storage`. Importação legada sem miniatura (exigiria dependência).
- Temas Álbum/Festa/Moderno por variáveis CSS com os nomes de token do Álbum (`papel`, `tinta`, `marinho`...), paletas prontas validadas na WCAG AA por teste, fontes de lista curada pelo `next/font`; componentes não usam cor fixa (use `color-mix` com os tokens).
- Vocabulário = `VOCABULARY[type]` + trocas do evento; lados dos convites = chaves livres de `event.sides` (`invitations.side` varchar).
- Módulo desligado: some do menu e da home, página do site 404 e rotas públicas da API 404; o painel continua mostrando os dados.
- `applyCharge` revalida `gifts:<id>` (e `messages:<id>` com recado).
- `packages/db` usa `@casamento/shared` como dependência de workspace.

## Decisões da Fase 3 (ver `docs/saas/fase-3.md`)

- Painel da organização em `#/o/:orgId` (rotas `/api/admin/orgs/:orgId/*`, `requireOrgAccess` + `requireOrgPermission`; sem vínculo → 404): início multievento, eventos (criar pelo mesmo `createEventRecord` da CLI, nasce rascunho; ativar/arquivar, sem apagar), equipe, convites e, por evento, anfitriões e permissões. Matriz: `org.read`/`events.create`/`hosts.manage` para dono e membro, `team.manage` só dono; anfitrião não entra na organização; a org nunca fica sem dono (422).
- Convites da equipe/anfitrião em `team_invites` (só o SHA-256 do token, 7 dias, uso único, reenviar troca o link); aceite público em `/api/team-invites` (isento de `X-Web-Key`) e `#/aceitar/<token>`: sem conta cria `user` + `account` como o `user:add`; com conta exige sessão do mesmo e-mail. Cadastro público do Better Auth segue desligado.
- Permissões do anfitrião: lista de negação em `event.host_permissions` (privada, rota da org), aplicada em `requirePermission` só para `event_host`; toda rota de evento declara ação, inclusive leitura (`gifts.read`, `messages.read`, `settings.read`, `reminders.read`, `content.read`); negar a leitura nega a escrita da área (`withDependents`). O menu do evento esconde pelas ações de leitura (`GET /events/:id/access`; falhou → "pode tudo", a API ainda dá 403).
- Erros: `ApiError` tem `field` opcional (campo culpado) e `ERROR_CODES.conflict` para 409.
- QR dos convites lê nomes/data de `GET /invitations/card` (`invitations.read`), não de `/settings`.
- Painel: `useRefreshMe()` recarrega o `/me` depois de criar/mudar evento (senão o hash novo volta para `#/eventos`).

## Decisões da Fase 4 da plataforma (ver `docs/saas/fase-4.md`)

- Gestão só no painel (sem módulo no site): tarefas (`src/tasks`), fornecedores e contratos (`src/vendors`), orçamentos/parcelas/planejado × realizado (`src/budget`), cronograma (`src/schedule`); menu do evento "Gestão" por `tasks/vendors/budget/schedule.read`; org: `vendors.manage`, `templates.manage`.
- Catálogo de fornecedores e modelos de tarefas são da organização (`organization_id`, auditor estrito também por org); `event_vendors` com FKs compostas (mesma org garantida no banco); fornecedor usado arquiva, não se apaga. Remover do evento: recusa com orçamento contratado, apaga contratos e orçamentos não contratados, anula o fornecedor no cronograma.
- Data do evento: `PUT /settings` com `wedding.datetime`/`wedding.timezone` atualiza `events.starts_at/timezone`, invalida o resolver e chama `recalculateTaskDues` (prazos relativos guardam o deslocamento; `due_on` no fuso do evento). O `PATCH` da org só muda status (não há outra tela que mude a data).
- Contratos na área privada do `Storage` (`<eventId>/private/`), download só autenticado (`attachment` + `nosniff`). Orçamento contratado é imutável; parcelas são registro manual.
- Schemas de PATCH sem `.default()` (no zod 4 o `.partial()` aplica o padrão e zeraria campos). Datas de calendário "AAAA-MM-DD" no painel: `formatDate` formata em UTC para não cair no dia anterior.
- Testes: escrita de setup/limpeza em tabelas compartilhadas (`user`, `event_members`, convites do evento 1) passa por `retryOnDeadlock` (deadlock real entre arquivos em paralelo).

## Decisões da Fase 5 da plataforma (ver `docs/saas/fase-5.md`)

- Recebedor por evento (`events.payment_receiver`): `organization` (padrão; subconta Asaas da org, só o dono cadastra), `host` (subconta de um anfitrião do evento; cadastrar a própria é opt-in `payments.own_account` liberado pela org em `allow`) ou `platform` (conta principal sem split; casamento e eventos anteriores à 0011; só platform admin escolhe). `payments.configure` nunca é do anfitrião.
- Cobrança pela subconta (`provider.forAccount(creds)`) com `split` para `ASAAS_PLATFORM_WALLET_ID` (`PLATFORM_FEE_PERCENT`, padrão 0 = sem split); o pedido grava `payment_account_id`, `platform_fee_bps` e `platform_fee_cents`; webhook, conciliação, expiração e reembolso usam a conta do pedido (`providerForOrder`). Sem conta aprovada: `paymentsAvailable: false`, site com "Disponível em breve" e `POST /orders` 409.
- Segredos: `apiKey` da subconta cifrada (AES-256-GCM, `PAYMENT_SECRETS_KEY`, obrigatória em produção; `aad` = conta) e decifrada só ao chamar o provedor; token do webhook da conta só como SHA-256. Dados pessoais do cadastro vão ao provedor e não são gravados (fica o documento mascarado).
- Webhook por subconta `POST /api/webhooks/payments/accounts/:publicId` (registrado pelo `createSubaccount`): token por hash em tempo constante; `ACCOUNT_STATUS_*` → `handleAccountWebhook`, cobrança de outra conta é ignorada. Situação cadastral também por "Atualizar situação" e rotina de 6 h; mudança avisa por e-mail e revalida `gifts:<id>` dos eventos que dependem da conta.
- Simulado: cenário pelo e-mail do cadastro (`+pendente`, `+analise`, `+recusada`; outro = aprovada) e, fora de produção, `POST .../payment-accounts/:id/simulate` e `.../payments/my-account/simulate` (`{ status }`) com botões "Simular aprovação/pendência/recusa" no painel.
- Site: o `proxy.ts` lê o `X-Forwarded-Host` antes do `Host` (o `redirect()` de Server Action do Next busca a página nova em `localhost:<porta>`; só pelo Host, o pedido de outro evento abria o evento padrão).
- Testes: `createTestEvents(db, { paymentReceiver: "platform" })` para os testes de pedido anteriores à Fase 5; o cleanup apaga `payment_accounts` das orgs. E2E em `painel-fase5.spec.ts` (org própria, host `f5-<run>.localhost`); a API dos e2e sobe com `PLATFORM_FEE_PERCENT=2.5`.

## Decisões da Fase 6 da plataforma (ver `docs/saas/fase-6.md`)

- Planos em `plans` (catálogo em `packages/db/src/plan-catalog.ts`: Cortesia interna da org 1, `essencial`, `profissional`; preços `TODO(conteudo)`), assinatura em `organization_subscriptions`. Limites (eventos ativos, convidados, equipe, espaço, módulos) → 409 `plan_limit`; módulo fora do plano nasce desligado em evento novo; o acompanhante do RSVP público conta (Fase 7). Sem assinatura = sem limite.
- Taxa: `fee_bps_override` da assinatura > `plans.fee_bps` > `PLATFORM_FEE_PERCENT` (só sem assinatura). `BILLING_PROVIDER=simulado|asaas` (`/v3/customers` + `/v3/subscriptions` na conta principal), webhook `POST /api/webhooks/subscriptions`.
- Inadimplência: após `PAST_DUE_GRACE_DAYS` (15) as escritas do painel dão 402 `subscription_inactive` (`plans/gate.ts`); passam `/subscription`, `/usage`, platform admin e, por decisão da integração, reembolso, conciliação e `/privacy` do evento (`GUEST_PROTECTION_PATH`). O site dos convidados nunca é bloqueado.
- Painel da plataforma em `#/plataforma` (só platform admin; outros veem 404); plano da org em `#/o/:id/plano`; `GET /api/plans` público.
- Cadastro: `POST /api/signup` + `#/cadastro/<token>` (`SIGNUP_ENABLED`, 0 padrão); site da plataforma em `apps/web/src/app/plataforma` (`PLATFORM_HOST`, nome provisório "Plataforma de eventos"). `PLATFORM_BASE_DOMAIN` dá `slug.<base>` automático; domínio próprio só resolve após TXT `_plataforma-verificacao.<host>`; `GET /api/hosts/ask?domain=` é o `ask` do on-demand TLS.
- LGPD: consentimento no RSVP e no mural (`privacy.settings.requireConsent`, padrão true; o casamento importado fica `false`), aviso sem checkbox no presente, `/privacidade` por evento, pedidos do titular, exportar, anonimizar, retenção diária (365 dias após o evento), apagar evento arquivado (janela de 180 dias de pedidos), exportar/apagar a conta (`DELETE /me`).
- CSP do site: `script-src 'self' 'unsafe-inline'` sem nonce (nonce deixaria as páginas dinâmicas e quebraria o cache do `cacheComponents`); painel e API com CSP própria. `X-Forwarded-Host` só vale se `/api/hosts/:host` confirmar ou for o `PLATFORM_HOST`.
- Operação: logs JSON (`LOG_FORMAT`), alertas por e-mail (`PLATFORM_ALERT_EMAIL`, com cooldown), `/api/health?db=1`, rotinas por `startIntervalJob` (`firstRunDelayMs` evita rodar a cada reinício em dev), backup com uploads (inclusive `private/`), Telegram removido.
- Ajustes: categorias de fornecedor por org, anfitrião não cadastra no catálogo (`vendors.catalog`), resumo semanal de tarefas, modelos de tarefas da plataforma, reabrir orçamento, data/fuso pela lista da org, botões de gravar escondidos sem permissão (`useCan`/`ReadOnlyScope`), monograma/agenda em Configurações.

## Decisões da Fase 7 da plataforma (ver `docs/saas/fase-7.md`)

- Portaria sem conta: link `/portaria/#<token>` + PIN de 6 números (mostrados uma vez); token só em SHA-256, PIN em scrypt, sessão HMAC (`BETTER_AUTH_SECRET`) conferida no banco a cada chamada (revogar/vencer derruba na hora). Token inválido, vencido, revogado, bloqueado e PIN errado dão o mesmo 401; 5 erros bloqueiam o link por 15 min, além do limite por IP. A portaria vê nome, pessoas, mesa e aviso (`invitations.access_note`), nunca contato nem restrição alimentar; a `ref` do convite é opaca.
- QR pela câmera com `BarcodeDetector` (sem dependência); sem ele, digitar o código ou buscar por nome (2+ letras). Chegada parcial soma `people`, pode passar das confirmadas (aviso), desfazer marca `undone_at`; contagem por polling de 5 s.
- `/portaria/` e `/fornecedor/` servem o `index.html` do painel (o `App.tsx` olha o `pathname`); token no fragmento. `/api/checkin/*` e `/api/vendor-portal/*` são isentas de `X-Web-Key` e usam `Authorization: Bearer`; o link é achado em `crossEvent`. `Permissions-Policy: camera=(self)` só em `/portaria/` (o resto da API segue `camera=()`).
- Mesas por pessoa (`seat_assignments`, uma mesa por pessoa; lotação é só aviso); a mesa aparece nas listas do cerimonial e da portaria (coluna "Mesa") e no check-in; impressão por mesa e plaquinhas pelo navegador.
- Portal do fornecedor por link mágico por e-mail (30 dias, revogável): token inválido, vencido, revogado ou evento arquivado dão o mesmo 401 (coerente com a portaria). Orçamento enviado entra `received` com `source = portal`; documentos na área privada, tipo pelos bytes, `CONTRACT_MAX_BYTES` e limite de espaço do plano; tarefa com fornecedor em `event_tasks.event_vendor_id` (anulada ao remover o fornecedor). O fornecedor nunca vê convidados nem dados de outro fornecedor.
- WhatsApp por links `wa.me`, sem API da Meta: modelos por evento (`whatsapp_templates`, vazio = padrão `TODO(conteudo)`), fila com filtros, um envio por vez; "enviado" é marcado pelo organizador (`whatsapp_sends`, sem telefone nem texto) e é desfazível.
- Acompanhantes contam no `guestsPerEvent`, mas o RSVP nunca é recusado: ao estourar, e-mail à equipe uma vez por estouro (`event_settings` › `plan.guest_overage`, privada) e aviso no painel (`GET /guest-limit`); escritas do painel seguem com 409 `plan_limit`.
- Painel: página "Hoje" (`#/e/:id/dia`), grupo "Dia do evento" (Hoje, Check-in, Mesas) e menu WhatsApp; seis ações novas (`checkin.read/manage`, `seating.read/write`, `vendors.portal`, `whatsapp.send`), liberadas ao anfitrião e ajustáveis pela organização. Nenhuma ferramenta da Fase 7 é limitada por plano.
- Privacidade do evento mostra em destaque a data da anonimização (casamento: 09/04/2028, retenção de 365 dias mantida).

## Fases

- Fases 0 a 3: concluídas. Fase 4 (presentes e pagamento): concluída; Asaas implementado e testado com respostas gravadas, falta teste real no sandbox.
- Fase 5 (painel): concluída, aguardando revisão. Dashboard, convites (link, WhatsApp, respostas, CSV), presentes (CRUD, foto, ordem), pedidos (reembolso, conciliação), recados, configurações, trocar senha. E2E: `pnpm --filter @casamento/web exec playwright test --project=painel` (usa `ADMIN_EMAIL_1`/`ADMIN_PASSWORD_INICIAL` ou `E2E_ADMIN_*`; `PAINEL_URL` para outra porta). Complemento: importar convidados CSV/XLSX (`src/admin/guest-import.ts`, leitor próprio em `spreadsheet.ts`: zip pelo diretório central + `inflateRawSync`, sem dependência; exemplo em `docs/exemplos/`), QR em lote para impressão (`#/convites/qr`, gerador próprio em `packages/shared/src/qr.ts`, byte/M, testado com vetores da norma e um decodificador no teste) e listas buffet/cerimonial/portaria (`/api/admin/events/:eventId/invitations/lists/:tipo[.csv]`, `#/convites/listas/:tipo`, portaria sem dados de saúde).
- Fase 6 (extras): concluída. Mural de recados (`/recados`, `GET/POST /api/e/:slug/messages`: só aprovados; POST com honeypot, 3 por 10 min por IP, entra pendente; tag de cache "messages"), PWA (`manifest.ts`, ícones em `/icons/*` via ImageResponse, `public/sw.js` com cache só de fontes/ícones e `offline.html`) e lembretes de RSVP (`apps/api/src/reminders.ts`, job horário `startReminderJob`, tabela `rsvp_reminders`, config privada em `settings.reminders`, página Lembretes no painel). `NEXT_DIST_DIR=.next-e2e` permite um segundo `next dev` ao lado do aberto.
- Plataforma (branch saas), Fases 1 a 7 (multi-evento, conteúdo e temas, painel da organização, gestão do evento, recebimentos, planos/LGPD/endurecimento, dia do evento): **todas concluídas, aguardando revisão**. Detalhes em `docs/saas/fase-N.md` e `docs/saas/STATUS.md`; screenshots em `.screenshots/saas-faseN/` (Fase 7: `.screenshots/saas-fase7/`); e2e em `painel-fase4.spec.ts` a `painel-fase7.spec.ts`. Migrations até a 0013 (aplicada no `casamento`).

## Pendências

- O CI nunca rodou no GitHub (ainda sem remote).
- Asaas real sem teste em sandbox (a chave no `.env` é de produção): com uma chave `$aact_hmlg_`, validar Pix, fatura do cartão, webhook, conciliação, reembolso, subcontas (criação, documentos, aprovação, webhook), split e assinaturas; pedir ao Asaas a liberação de subcontas e split na conta principal (a Asaas recomenda esperar ~15 s após criar a subconta). `PAYMENT_SECRETS_KEY` obrigatória em produção (trocar invalida as chaves gravadas; rotação fica para depois).
- `TODO(conteudo)`: preços e limites dos planos, `PLATFORM_FEE_PERCENT`, textos dos termos, da política e do aviso de privacidade.
- `PLATFORM_HOST`, `PLATFORM_BASE_DOMAIN` e o `ask` do on-demand TLS no edge ainda não existem em produção (`docs/DEPLOY.md`).
- Retenção do casamento mantida em 365 dias (anonimiza a partir de 09/04/2028, visível em Privacidade).
- Fase 7: ferramentas por plano, textos padrão do WhatsApp (`TODO(conteudo)`) e validades padrão dos links (portaria 48 h, portal 30 dias) em aberto. O snippet `seguranca` do edge não pode sobrescrever o `Permissions-Policy` da portaria (`docs/DEPLOY.md`).
- `docker build` nunca rodado (sem Docker na máquina de dev). Revisão das Fases 1 a 7 pelo usuário.
- CSP do site mantém `'unsafe-inline'` em scripts (sem nonce); o usuário pode reverter.
- Login no painel: 5 tentativas/min por IP; e2e + screenshots seguidos podem esbarrar no limite (reinicie a API de teste).
- E2E: o `next dev` não sobe duas vezes na mesma pasta; com o servidor do usuário na 3000, rode `E2E_PORT=3000 pnpm --filter @casamento/web test:e2e`.
- Decisões das Fases 1–5 respondidas em 21/11/2026 (`docs/saas/AGENTES.md`); papéis de Dani/Gustavo seguem `TODO(fase1-papeis)`.
- `.env` de dev tem Asaas de produção: em testes use `PAYMENT_PROVIDER=simulado` e `BILLING_PROVIDER=simulado`.
- O evento `ana-bruno` existe no banco de dev (criado pelo setup do e2e `multi`).

## Deploy: contrato da VPS ArtZan (siga ao criar ou alterar o deploy)

VPS compartilhada; cada site sobe pelo script `site` (`site novo`/`site atualizar`/`site verificar`) e um único Caddy, o "edge" (`/srv/edge`), é dono de 80/443 e encaminha cada subdomínio pela rede Docker externa `edge`. Texto completo do contrato: `git show origin/main:CLAUDE.md`.

- Arquivos obrigatórios: `docker-compose.prod.yml`, `.env.production.example` (toda variável usada no compose, mesmo vazia), `deploy/deploy.conf` (bash: `SLUG`, `DOMAIN_VARS`, `REQUIRED_VARS`, `SECRET_VARS`, `HEALTH_URLS`, `BACKUP_CMD`, ganchos `primeira_vez`/`pos_subida`; só atribuições no nível do arquivo), `deploy/site.caddy`.
- Compose: `name: <slug>` = `SLUG`, nunca muda (volumes); nenhuma porta publicada (no máximo `127.0.0.1:` comentado); só quem o Caddy alcança entra na `edge`, com alias `<slug>-<serviço>`; banco só em rede privada (`internal: true`); serviços longos com `restart: unless-stopped`, `healthcheck` (sem depender das migrations) e log `json-file` 10m×3; sem `container_name`; `image: <slug>/<serviço>`; dados em volumes nomeados; ferramentas com `profiles: [tools]` e `run --rm`; URLs públicas a partir das variáveis de domínio; nada de Caddy/Nginx/Traefik/certbot no projeto.
- `site.caddy`: só blocos de site, `${VAR}` trocado pelo script (não `{$VAR}`), upstreams pelo alias da `edge`, snippets próprios prefixados `<slug>_`; usar `import seguranca` e `import ip_real` (dentro de `reverse_proxy`) do edge sem redefini-los.
- App: escuta `0.0.0.0` sem TLS; rota de saúde barata sem autenticação (`/api/health`, a mesma do healthcheck e do `HEALTH_URLS`, que espera 2xx/3xx); IP do visitante por `X-Forwarded-For`/`X-Real-IP` (já tratados pelo edge); segredos em hex (`openssl rand -hex 32`); no `.env` do Compose, valores com `$` entre aspas simples; build/start sem depender de outro site da VPS.
- Subdomínio de um nível em `artzan.tech` (`<nome>`, `painel-<nome>` ou `<nome>-api`): o SSL da Cloudflare cobre só `*.artzan.tech`. DNS na Hostinger: registro A para o IP da VPS, TTL 300, sem AAAA.
