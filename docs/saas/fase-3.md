# Plataforma — Fase 3: painel da organização

Branch `saas`. Regras e fluxo dos agentes em `docs/saas/AGENTES.md`.

**Objetivo:** a organização (cerimonialista, ou o casal que se organiza sozinho) administra os próprios eventos pelo painel, sem CLI: cria evento, monta a equipe, convida anfitriões por e-mail e decide o que cada anfitrião pode fazer.

**Pronto quando:**

1. `/api/admin/me` lista eventos **e** organizações; dono/membro de uma organização entra em `#/o/:orgId` e vê o dashboard multievento (data, convidados, confirmados, presentes recebidos em centavos).
2. Criar evento pela UI (nome, tipo, data/hora/fuso, endereço `slug` conferido na hora, domínio opcional) usa o **mesmo serviço** da CLI `event:create` (`createEventRecord`); o evento abre com os padrões do tipo (módulos, vocabulário, tema, lados e seções neutras).
3. Equipe: listar, convidar por e-mail (dono/membro), mudar papel, remover — a organização nunca fica sem dono. Anfitriões de cada evento: convidar por e-mail e remover.
4. Convite com token (só o hash no banco), validade de 7 dias, reenvio e cancelamento; aceite em `#/aceitar/<token>` cria a conta com senha **ou** vincula a conta existente (logada com o mesmo e-mail). O cadastro público do Better Auth continua desligado.
5. Permissões do anfitrião por evento, ajustadas pela organização; padrão "pode tudo". Ação negada → 403 na API e some/desabilita no painel.
6. Isolamento: organização de que o usuário não participa → 404 de rota; evento de outra organização pelo caminho de uma org → 404; `admin-isolation.test.ts` enumera as rotas novas; auditor de SQL estrito também para `organization_id`.
7. `pnpm lint`, `typecheck`, `test`, `build`, `format:check` e e2e (`painel`, `multi`) verdes; screenshots do painel da organização em 390×844 e 1440×900.

**Fora do escopo:** cadastro self-service/planos (F6), subcontas Asaas (F5), tarefas/fornecedores (F4), `PLATFORM_BASE_DOMAIN` automático (continua documentado e sem uso: o domínio é digitado), apagar evento pela UI (só arquivar), troca de dono entre organizações.

## 1. Modelo de dados (migration 0009, feita pela fundação)

| O quê                   | Onde                                                  | Observação                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convites da equipe      | tabela `team_invites` (`0009_convites_equipe.sql`)    | `organization_id` (cascade), `event_id` nulo (cascade; nulo = equipe da org, preenchido = anfitrião), `email` varchar(191) minúsculo, `role` enum(owner, member, host), `token_hash` varchar(64) único (SHA-256 hex do token), `invited_by`/`accepted_by` → `user` (set null), `expires_at`, `accepted_at`, `revoked_at`, timestamps. Índices (organization_id, email) e (event_id). Evento pertence à org: conferido na aplicação. |
| Permissões do anfitrião | `event_settings` › `event.host_permissions` (privado) | `HostPermissions { deny: HostConfigurableAction[] }`. Chave ausente = pode tudo. Lista de **negação**: ação nova nasce liberada, como hoje. Em `DEDICATED_SETTINGS_KEYS` (o PUT genérico de `/settings` do evento recusa: o anfitrião não muda as próprias permissões).                                                                                                                                                             |
| Padrões do evento novo  | nada gravado                                          | Módulos, vocabulário, tema, lados e seções valem **por ausência** da chave (`modulesFor`, `vocabularyFor`, `resolveTheme`, `defaultSides`, `defaultSections`), como na Fase 2: trocar o tipo depois continua coerente. O serviço grava só `couple.names`, `couple.monogram`, `wedding.datetime`, `wedding.timezone`.                                                                                                                |

Nome `team_invites` (e não `invitations`) porque `invitations` são os convites dos convidados do evento.

## 2. Contratos e pontos de extensão (prontos na fundação)

`packages/shared/src/`:

- `org.ts` (integração): `SLUG_PATTERN`, `HOST_PATTERN`, `EventSlug`, `EventHost`, `Email`, `LocalDate`, `LocalTime`, `TimeZone`, `PASSWORD_MIN` (10, igual ao Better Auth), `TEAM_INVITE_TTL_DAYS` (7), `localDateTimeToIso(data, hora, fuso)` (ISO com offset, via Intl, testado com horário de verão), `MeOrganization`, `MeEvent`, `MeResponse`.
- `org-events.ts` (A): `CreateOrgEventInput`, `SlugCheck`, `OrgEventSummary`, `OrgDashboard`.
- `team.ts` (B): `ORG_MEMBER_ROLES`/`LABELS`, `OrgMember`, `OrgMemberUpdate`, `OrgInviteInput`, `HostInviteInput`, `TeamInvite`, `TeamInviteStatus`, `EventHostRow`, `TeamInvitePreview`, `AcceptTeamInvite`, `AcceptTeamInviteResult`.
- `permissions.ts` (C): `EVENT_ACTIONS` (saiu de `tenancy/permissions.ts`, que reexporta como `ACTIONS`), `EVENT_ACTION_LABELS`, `HOST_CONFIGURABLE_ACTIONS` (todas menos `dashboard.read`), `HostPermissions`, `ORG_ACTIONS` (`org.read`, `events.create`, `team.manage`, `hosts.manage`), `ORG_ACCESS_ROLES`, `EVENT_ACCESS_ROLES`, `ACCESS_ROLE_LABELS`, `HostPermissionsUpdate`/`View`, `EventAccessView`.
- `admin.ts`: `event.host_permissions` em `SETTINGS_SCHEMAS` e `DEDICATED_SETTINGS_KEYS`.

`packages/db/src/`:

- `schema/tenancy.ts`: `teamInvites`, `TEAM_INVITE_ROLES`.
- `event-service.ts` (A): `createEventRecord(db, { organizationId, slug, name, type, startsAt (ISO com offset), timezone?, status?, host? })` numa transação (evento + settings neutras + domínio primário opcional); `EventInputError { field, reason: "invalid" | "taken" }` (422/409 na API); `isEventSlugAvailable`, `isEventHostAvailable`, `assertEventSlug`, `normalizeEventHost`, `eventInitials`, `isUniqueViolation`. A CLI (`tenancy-admin.ts` › `createEvent`, `addDomain`, `createOrganization`) já usa o serviço.

`apps/api/src/`:

- `tenancy/org-access.ts`: `requireOrgAccess(db)` (org inexistente, id malformado ou sem vínculo → 404 de rota; põe `org` e `orgRole`), `ORG_PERMISSIONS` + `canOrg` + `requireOrgPermission(action)` (403), `requireOrgEvent(db, resolver)` (`:eventId` precisa ser da org → senão 404; põe `event`), `resolveOrgRole`, `listAccessibleOrgs`, tipo `OrgEventEnv`. `tenancy/types.ts`: `OrgCtx`, `OrgAdminEnv`.
- `admin/index.ts`: `/me` com `organizations`; `/orgs/:orgId` → `admin/org/index.ts`; `/events/:eventId/access` → `admin/event-access.ts` (papel + ações liberadas; hoje só a matriz por papel).
- `admin/org/index.ts`: `GET /orgs/:orgId` (organização + papel) e a montagem dos grupos. Rotas de um evento da org (`/events/:eventId/hosts`, `/events/:eventId/host-permissions`) passam por `requireOrgEvent` **dentro** de cada grupo, para não pegar `/events/slug-check`.
- Stubs (501 até a frente implementar, já com `requireOrgPermission`): `admin/org/events.ts` (A), `admin/org/team.ts` e `admin/org/hosts.ts` (B), `admin/org/host-permissions.ts` (C; GET já devolve `deny: []`), `routes/team-invites.ts` (B; montado em `/api/team-invites`, isento de `X-Web-Key` em `middleware/web-key.ts`).
- Teste `apps/api/test/sql-audit.ts`: `ORG_SCOPED_TABLES = ["team_invites"]` exige `organization_id` no WHERE/ON (consulta com tabela de evento e de org junto exige as duas colunas). A busca pelo token atravessa organizações: `crossEvent("convite da equipe por token", fn)`.
- `admin-isolation.test.ts`: enumera também `/api/admin/orgs/:orgId[/*]` (sem sessão 401; dono da org B, anfitrião do evento A e org inexistente → 404 de rota; dono/membro/platform admin passam; membro leva 403 em `team.manage`; evento de outra org pelo caminho → 404; `/me` com organizações).

Painel (`apps/api/painel/src/`):

- `nav.ts`: `setCurrentOrgId`, `oh("/equipe")` → `#/o/2/equipe`, `oa("/members")` → `/api/admin/orgs/2/members`, `goOrg`, `orgPath`. `api.ts`: `orgApi`, `orgSend`, `teamInviteApi`.
- `org.tsx`: `OrgProvider`/`useOrg`, `ORG_NAV`, `parseOrgPath`, `OrgPage` (rotas `#/o/:orgId`, `/eventos`, `/eventos/novo`, `/eventos/:eventId/anfitrioes`, `/eventos/:eventId/permissoes`, `/equipe`, `/convites`).
- `App.tsx`: `#/aceitar/<token>` renderiza `pages/Aceitar.tsx` **antes** da sessão; `#/o/:orgId/...` dentro do `Frame` com menu da organização; usuário sem evento e com organização vai para `#/o/<primeira>`; botão provisório "Organização" no topo.
- Páginas reservadas: `pages/org/{Inicio,Eventos,NovoEvento}.tsx` (A), `pages/org/{Equipe,Convites,Anfitrioes}.tsx` e `pages/Aceitar.tsx` (B), `pages/org/Permissoes.tsx` (C).

## 3. Decisões (padrões adotados)

- **Tabela própria de convites da equipe**, com hash do token (vazou o banco, não vazou convite), validade de 7 dias e um uso. Reenviar = novo token e nova validade (o link antigo morre). Convite pendente repetido para o mesmo e-mail e destino: reaproveita a linha (reenvia) em vez de duplicar.
- **Aceite sem cadastro público:** a conta nasce no aceite (`user` + `account` "credential" com `hashPassword`, como `addUser` da CLI; `emailVerified: true`, já que o link chegou no e-mail). Conta existente: precisa estar logada com o mesmo e-mail (senão o painel pede login e volta ao convite). E-mail do convite diferente do da sessão → 403 com mensagem clara.
- **Matriz da organização (padrão):** `org.read`, `events.create` e `hosts.manage` para dono e membro; `team.manage` só para dono. Platform admin pode tudo em qualquer organização. Anfitrião (`event_host`) **não** entra no painel da organização.
- **A organização nunca fica sem dono:** rebaixar ou remover o último `owner` → 422.
- **Remover membro/anfitrião** apaga só o vínculo; a conta continua (pode ser de outra organização). Sessões abertas perdem o acesso na hora (o acesso é conferido a cada requisição).
- **Permissões do anfitrião como lista de negação** em `event_settings`, aplicada em `requirePermission` só para `event_host` (dono/membro/platform admin não são afetados). `dashboard.read` não se tira.
- **Evento novo nasce rascunho** (o site público dá 404 até ativar); status muda pela lista de eventos (`PATCH /events/:eventId`). Sem apagar evento pela UI.
- **Slug global** (as rotas públicas são `/api/e/:slug`), conferido ao digitar (`slug-check`) e de novo no POST (409). Domínio opcional, digitado; vira host primário.
- **Data pela UI:** data + hora + fuso (padrão `America/Sao_Paulo`, 16:00) → `localDateTimeToIso` → mesmo `startsAt` com offset da CLI.
- **E-mail de convite** pelo `Mailer` existente (console sem `MAIL_HOST`; mock nos testes), com link `BETTER_AUTH_URL/painel/#/aceitar/<token>` (o painel mora no host da API).

## 4. Frentes paralelas

Cada frente: worktree próprio, banco `casamento_f3<letra>`, portas de `AGENTES.md`. **Sem migrations.** Contratos de `packages/shared` só mudam de forma aditiva e no arquivo da própria frente; precisou mudar arquivo de outra frente ou da integração → pare e reporte. Ao implementar, apague o `notYet` da sua rota (o `admin/org/stub.ts` em si só sai na integração).

### A — Eventos e dashboard da organização (branch `saas-f3a`)

- **Objetivo:** dashboard multievento, lista de eventos com status, criar evento pela UI e ativar/arquivar.
- **Arquivos:** `apps/api/src/admin/org/events.ts`; dono de `packages/db/src/event-service.ts` e `packages/shared/src/org-events.ts`; painel `apps/api/painel/src/pages/org/{Inicio,Eventos,NovoEvento}.tsx` (+ novos `pages/org/eventos/**` se precisar); testes novos `apps/api/test/org-events.test.ts` e `packages/db/test/event-service.test.ts`.
- **Consome:** `createEventRecord`, `EventInputError`, `isEventSlugAvailable`, `CreateOrgEventInput`, `localDateTimeToIso`, `OrgDashboard`, `requireOrgPermission`, `deps.eventResolver.invalidate(id)` (após mudar status/domínio), `revalidate(ev.id, ["site"])` ao ativar/arquivar.
- **Testes:** dashboard conta só eventos da org (convidados, confirmados, pedidos pagos em centavos, sem reembolsados); criar → evento rascunho com defaults do tipo (site neutro do tipo por `loadSiteContent`), slug repetido 409, domínio repetido 409, entrada inválida 422 com campo; membro cria, platform admin cria em qualquer org; `PATCH` de evento de outra org → 404; auditor estrito.

### B — Equipe, convites e aceite (branch `saas-f3b`)

- **Objetivo:** equipe da organização, anfitriões por evento e o fluxo completo de convite por e-mail com aceite.
- **Arquivos:** `apps/api/src/admin/org/{team,hosts}.ts`, `apps/api/src/routes/team-invites.ts`, novos `apps/api/src/team-invites/**` (serviço: token, hash, criar/reenviar/revogar/aceitar) e `apps/api/src/team-invite-email.ts`; dono de `packages/shared/src/team.ts`; painel `apps/api/painel/src/pages/org/{Equipe,Convites,Anfitrioes}.tsx` e `apps/api/painel/src/pages/Aceitar.tsx`; testes novos `apps/api/test/team-invites.test.ts`.
- **Consome:** `teamInvites`, `TEAM_INVITE_TTL_DAYS`, `Mailer`, `hashPassword` (better-auth/crypto), `crossEvent`, `sameOrigin` e `sensitiveLimit` (`admin/context.ts`, só importar), `deps.limiter` (aceite por IP), `authClient.signIn.email` no painel após criar a conta.
- **Testes:** convite grava só o hash; e-mail enviado com o link; reenviar troca o token; expirado/revogado/usado → 404 igual; aceite sem conta cria user+account e vincula (login funciona com a senha); com conta exige sessão do mesmo e-mail; não deixa a org sem dono; membro → 403 em `team.manage`; anfitrião convidado só entra no evento dele; token de uma org não mexe em outra; auditor estrito.

### C — Permissões do anfitrião (branch `saas-f3c`)

- **Objetivo:** a organização tira ações do anfitrião por evento; a API aplica (403) e o painel sabe o que esconder.
- **Arquivos:** `apps/api/src/admin/org/host-permissions.ts`, `apps/api/src/admin/event-access.ts`, `apps/api/src/tenancy/{permissions,access,types}.ts` (carregar `event.host_permissions` no `requireEventAccess` quando o papel for `event_host` e descontar em `requirePermission`); **só para pôr `requirePermission` onde faltar** as rotas de evento em `apps/api/src/admin/{appearance,content,event-config,gifts,guest-routes,invitations,media,orders,reminders,site-editor}.ts` (toda rota precisa de uma ação, inclusive os GETs: `*.read`); dono de `packages/shared/src/permissions.ts`; painel `apps/api/painel/src/pages/org/Permissoes.tsx`; testes novos `apps/api/test/host-permissions.test.ts`.
- **Consome:** `HostPermissions`, `HOST_CONFIGURABLE_ACTIONS`, `EVENT_ACTION_LABELS`, `readSetting`/`writeSetting` (`admin/event-settings.ts`, só importar), `requireOrgPermission("hosts.manage")`.
- **Testes:** enumerar as rotas de evento e conferir que **toda** rota declara uma ação (nenhuma passa sem `requirePermission`); com `deny: ["orders.refund"]` o anfitrião leva 403 no reembolso e o dono não; `/access` reflete o `deny`; PUT por membro funciona, por anfitrião (rota da org) → 404; PUT genérico de `/settings` recusa a chave.

### D — Painel: seletor e navegação (branch `saas-f3d`)

- **Objetivo:** navegação entre organização e eventos coerente para cada papel.
- **Arquivos:** `apps/api/painel/src/{App.tsx,org.tsx,nav.ts,event.tsx,api.ts,ui.tsx,styles.css,tools.css}`, `apps/api/painel/src/pages/{Dashboard,Evento,Conta}.tsx`; e2e novo `apps/web/e2e/painel-fase3.spec.ts` (a integração roda).
- **Entregas:** seletor no topo com eventos agrupados por organização e as organizações (trocar entre `#/o/:id` e `#/e/:id`); `#/eventos` mostra também as organizações; marca/título da organização; menu do evento esconde o que `/access` não libera (consome `EventAccessView` com fallback "tudo" se a rota falhar); no evento, para dono/membro, atalhos "Anfitriões" e "Permissões do anfitrião" (`#/o/:orgId/eventos/:id/...`); tipos do `/me` vindos de `@casamento/shared` (`MeResponse`); sai o botão provisório "Organização".
- **Testes:** unitários de `resolveRedirect`/`parseOrgPath` (extrair para módulo puro se ajudar); e2e: dono abre a org, cria evento, convida anfitrião (link do e-mail lido do console/mock), aceite em aba anônima, anfitrião só vê o evento dele.

### Arquivos só da integração

`packages/db/src/schema/**`, `packages/db/migrations/**`, `packages/db/src/{index,tenancy-admin,cli}.ts`, `packages/shared/src/{org,admin,index}.ts`, `apps/api/src/{app.ts,admin/index.ts,admin/org/index.ts,admin/org/stub.ts,middleware/web-key.ts,tenancy/org-access.ts,tenancy/index.ts}`, `apps/api/test/{admin-isolation.test.ts,sql-audit.ts,helpers.ts}`, `CLAUDE.md`, `docs/**`.

### Integração (depois das 4)

Merge A → B → C → D na `saas`; apagar `admin/org/stub.ts` e os `TODO(fase3-*)`; conferir que `admin-isolation.test.ts` segue verde com as rotas reais (membro só leva 403 em `team.manage`); `pnpm build`, e2e (`painel`, `multi`) e screenshots do painel da organização em `.screenshots/saas-fase3/` (390×844 e 1440×900); `CLAUDE.md`, `docs/PERSONALIZAR.md` (criar evento e convidar pela UI) e `STATUS.md`.

## 5. Decisões do usuário (resolvidas em 21/11/2026)

| Decisão                                            | Padrão                                                                    | Decisão (21/11/2026)                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Membro da organização pode criar evento?           | Sim (`events.create` para dono e membro). Só dono mexe na equipe.         | Mantido.                                                                                                                                                       |
| Membro pode convidar anfitrião e mudar permissões? | Sim (`hosts.manage`).                                                     | Mantido.                                                                                                                                                       |
| Quais ações a organização pode tirar do anfitrião  | Todas menos ver o início do painel; padrão: o anfitrião pode tudo.        | Mantido (ações configuráveis).                                                                                                                                 |
| Validade do convite                                | 7 dias, uso único; reenvio gera link novo.                                | Mantido.                                                                                                                                                       |
| Evento novo                                        | Nasce rascunho; domínio digitado (sem `PLATFORM_BASE_DOMAIN` automático). | Mantido (rascunho).                                                                                                                                            |
| Apagar evento pela UI                              | Não: só arquivar (pedidos/pagamentos com FK restrict e política de LGPD). | Alterado: o dono apaga um evento arquivado, confirmando com o slug, removendo dados e arquivos (inclusive privados). Na Fase 6 (pedidos pagos em `fase-6.md`). |

## 6. Integração (concluída)

Merges A → B → C → D na `saas` sem conflitos (cada frente ficou nos seus arquivos). Depois:

- **Apagados:** `admin/org/stub.ts`; nenhuma rota responde 501.
- **Contrato de erro:** `ApiError` ganhou `field` opcional (campo culpado, usado na criação de evento) e `ERROR_CODES.conflict` (409 de slug/domínio em uso, convite já aceito, anfitrião repetido, conta existente); 422 segue `invalid_request`. `errorBody(code, message, field?)`.
- **QR dos convites:** lia `GET /settings` e quebrava para anfitrião sem `settings.read`; agora lê nomes, monograma e data de `GET /invitations/card` (`invitations.read`). Teste em `host-permissions.test.ts`.
- **Menu do evento** pelas ações de leitura da frente C (`gifts.read`, `messages.read`, `reminders.read`, `content.read` para Site/Galeria/Aparência, `settings.read`); sem a escrita, a página abre e a API recusa a gravação (403). Botões de escrita ainda não somem dentro das páginas.
- **Bug entre frentes:** criar evento (A) navegava para `#/e/<novo>`, mas o `/me` do painel (D) era carregado uma vez e o redirecionamento mandava para `#/eventos`. `useRefreshMe()` (`org.tsx`) recarrega o `/me` antes de navegar; mudar status também recarrega.
- **Teste intermitente (causa real, reproduzida):** os arquivos da API rodam em paralelo no mesmo banco com eventos de ids vizinhos; o `DELETE ... WHERE event_id IN (...)` do `afterAll` (e as cascatas) travava intervalos do índice usados por outro arquivo e o InnoDB derrubava um com deadlock (1213) — o arquivo falhava inteiro sem teste vermelho. Reproduzido com três suítes simultâneas (`isolation-cruzado.test.ts`, deadlock em `gift_orders`); `createTestEvents().cleanup` agora repete a instrução em 1213/1205 (`retryOnDeadlock`). Os `vi.waitFor` de e-mail do RSVP ganharam 5 s (falhavam só sob a mesma carga).
- **E2E:** `painel-fase3.spec.ts` completo: organização e dona próprias do teste (`ensureE2eOrg`/`cleanupE2eOrg` em `@casamento/db/testing`, para o evento novo não aparecer ao admin dos outros e2e), criar evento → negar "ver presentes" → convidar anfitrião → aceite em contexto anônimo com conta nova (o apoio troca o hash do convite por um token conhecido, já que o e-mail vai ao console da API) → anfitrião só vê o evento dele, sem Presentes (menu, aviso e 403 na API), e `#/o/:id`/outro evento voltam para o dele. Cada arquivo do painel manda o próprio `X-Forwarded-For` só no POST de login (`support/login-ip.ts`): com 5 arquivos o limite de 5 logins/min por IP derrubava a suíte.
- **Banco de dev:** nada novo a aplicar (0009 já estava no `casamento`; sem migration nas frentes).
- **Visual:** screenshots do painel da organização em 390×844 e 1440×900 em `.screenshots/saas-fase3/` (início, eventos, novo evento, equipe, convites, anfitriões, permissões, aceite, lista/seletor, menu do evento).
- Frentes limpas: worktrees `casamento-wt/f3{a..d}`, branches `saas-f3*` e bancos `casamento_f3*` removidos.
