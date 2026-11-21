# Plataforma — Fase 7: o dia do evento

Branch `saas`. Regras e fluxo dos agentes em `docs/saas/AGENTES.md` (decisões do usuário no fim dele). **Nunca chamar o Asaas real** (a chave do `.env` raiz é de produção): frentes com `PAYMENT_PROVIDER=simulado`, `BILLING_PROVIDER=simulado` e sem `ASAAS_*`. Última fase da plataforma.

**Objetivo:** ferramentas para o dia do evento e a reta final: check-in pela portaria (link + PIN, QR pela câmera), mapa de mesas, portal do fornecedor por link mágico, mensagens prontas pelo WhatsApp do próprio organizador e o painel bom no celular. Junto: acompanhantes contam no limite de convidados do plano (com aviso, sem recusar RSVP) e a data de anonimização visível.

**Pronto quando:**

1. **Check-in:** a organização gera links da portaria (`/portaria/#<token>` + PIN de 6 números, mostrados uma vez) e revoga; a portaria entra com o PIN (sem conta), lê o QR do convite pela câmera (`BarcodeDetector` quando existir; senão digita o código ou busca por nome), vê só nome do convite, pessoas confirmadas, aviso de acesso e mesa (nada de telefone, e-mail ou restrição alimentar), marca chegada (inclusive parcial) e desfaz, com contagem em tempo real (polling de `CHECKIN_POLL_MS`). O painel (`#/e/:id/checkin`) mostra a contagem, a lista de chegadas, marca/desfaz e gerencia os links.
2. **Mesas:** lista de mesas (nome, lugares, ordem, lado, grupo, observação), distribuição por pessoa (`guests`, só confirmados por padrão), aviso de lotação, filtros por lado/grupo, impressão por mesa, plaquinhas e lista do cerimonial (`#/e/:id/mesas`, `#/e/:id/mesas/imprimir`); a mesa aparece no check-in.
3. **Portal do fornecedor:** por fornecedor do evento, link mágico por e-mail (`/fornecedor/#<token>`, `VENDOR_PORTAL_DEFAULT_DAYS`, revogável, uso repetido na validade); o fornecedor vê o cronograma do dia (os itens dele com detalhes), as tarefas atribuídas a ele, os próprios orçamentos e documentos; envia orçamento (entra "recebido" no financeiro, `source = portal`) e documentos (área privada do Storage, tipo pelos bytes, `CONTRACT_MAX_BYTES`, limite de espaço do plano). Nunca vê convidados nem valores de outros fornecedores.
4. **WhatsApp:** modelos por evento (convite, lembrete de RSVP, agradecimento, aviso do dia; texto padrão `TODO(conteudo)`), fila por tipo e filtro com a mensagem montada e o link `wa.me`, envio em lote assistido (abre um por vez no WhatsApp do organizador) e "enviado" marcado por ele (desfazível). Sem API da Meta.
5. **Painel no celular:** sem app nativo nem PWA instalável; as telas do dia (Hoje, Check-in, Cronograma, Tarefas, Mesas, WhatsApp) funcionam bem em 390×844 (alvos de toque ≥ 44 px, tabelas viram cartões, menu usável com o polegar). Página "Hoje" (`#/e/:id/dia`) junta contagem do check-in, próximos itens do cronograma e tarefas do dia.
6. **Limite com acompanhantes:** acompanhante criado pelo RSVP conta no limite `guestsPerEvent`; o RSVP nunca é recusado; passou do limite → e-mail à equipe (uma vez por estouro) e aviso no início do painel (`GET /guest-limit`).
7. **Retenção visível:** a página Privacidade do evento mostra em destaque "Os dados pessoais serão anonimizados em dd/mm/aaaa" (casamento: 09/04/2028, retenção de 365 dias mantida — decisão do usuário).
8. `admin-isolation.test.ts`, `host-permissions.test.ts`, `table-scopes.test.ts` e o auditor estrito cobrem rotas e tabelas novas; `pnpm lint`, `typecheck`, `test`, `build`, `format:check` e e2e verdes; screenshots em `.screenshots/saas-fase7/` (390×844 e 1440×900), inclusive portaria e portal.

**Fora do escopo:** app nativo, PWA instalável, API oficial do WhatsApp (Meta) ou qualquer envio automático, leitor de QR por biblioteca (sem dependência nova), mapa visual de salão (arrastar mesas num desenho), assinatura eletrônica de contrato, pagamento ao fornecedor pelo portal.

## 1. Modelo de dados (migration `0013_dia_do_evento.sql`, feita pela fundação)

Schema novo em `packages/db/src/schema/event-day.ts`; colunas em `app.ts` e `planning.ts`. Tudo por `event_id` (auditor estrito: as 7 tabelas novas em `SCOPED_TABLES`).

| Tabela / coluna                                              | Observação                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkin_links`                                              | Link da portaria: `label`, `token_hash` (SHA-256 hex, único), `pin_hash` (scrypt `scrypt$<salt>$<hash>`), `pin_failures`, `locked_until`, `expires_at`, `revoked_at`, `last_used_at`, `created_by`. Único `(event_id, id)`.         |
| `checkins`                                                   | Uma linha por marcação: `invitation_id` (FK composta, cascade), `people` (≥ 1; parcial), `checkin_link_id` (sem FK: link só é revogado) ou `user_id` (painel), `undone_at` (desfazer). Chegaram = soma de `people` sem `undone_at`. |
| `seating_tables`                                             | `name`, `seats` (padrão 8), `sort`, `side` (chave de `event.sides`, nulo = qualquer), `group_label`, `notes`. Único `(event_id, id)`.                                                                                               |
| `seat_assignments`                                           | Pessoa → mesa: `table_id` e `guest_id` com FKs compostas (cascade), `seat` opcional. Únicos `(event_id, guest_id)` (uma mesa por pessoa) e `(event_id, table_id, seat)`.                                                            |
| `vendor_portal_links`                                        | Link mágico: `event_vendor_id` (FK composta, cascade), `token_hash` (único), `email`, `expires_at`, `revoked_at`, `last_used_at`, `created_by`.                                                                                     |
| `whatsapp_templates`                                         | `kind` (`WHATSAPP_TEMPLATE_KINDS`), `body`; único `(event_id, kind)`. Sem linha = texto padrão.                                                                                                                                     |
| `whatsapp_sends`                                             | "Enviado" marcado: `invitation_id` (FK composta, cascade), `kind`, `marked_by`. Sem telefone nem texto (nada pessoal a anonimizar).                                                                                                 |
| `invitations.access_note`                                    | Aviso para a portaria ("só cerimônia"); nunca dado de saúde.                                                                                                                                                                        |
| `event_tasks.event_vendor_id`                                | Fornecedor do evento responsável pela tarefa (portal). Sem FK, como `schedule_items`: a aplicação confere e anula ao desligar o fornecedor.                                                                                         |
| `quotes.source`, `quotes.portal_link_id`                     | `panel` (padrão) ou `portal`; link usado (só procedência).                                                                                                                                                                          |
| `vendor_contracts.source`, `vendor_contracts.portal_link_id` | Idem para documentos enviados pelo fornecedor.                                                                                                                                                                                      |
| `guests` único `(event_id, id)`                              | Alvo da FK composta de `seat_assignments`.                                                                                                                                                                                          |

Nenhum dado existente muda. Apagar evento (Fase 6) leva tudo em cascata. Retenção/anonimização (Fase 6) não precisa mudar: as tabelas novas não guardam dado pessoal além do e-mail do fornecedor no link (dado profissional, apagado com o evento). Aplicada no `casamento` pela fundação (dump antes em scratchpad `casamento-antes-0013.sql`).

## 2. Contratos e pontos de extensão (prontos na fundação)

Contratos em `packages/shared/src/` — **um arquivo por frente**, extensível de forma aditiva pela dona: `checkin.ts` (A), `seating.ts` (B), `vendor-portal.ts` (C), `whatsapp.ts` (D, inclui `GuestLimitStatus`). Mudança em contrato de outra frente ou nos de integração → pare e reporte. Testes dos contratos em `packages/shared/test/fase7.test.ts`.

- `checkin.ts`: `CHECKIN_PIN_LENGTH` (6), `CHECKIN_LINK_DEFAULT_HOURS`/`MAX_HOURS`, `CHECKIN_SESSION_HOURS`, `CHECKIN_PIN_MAX_FAILURES`/`LOCK_MINUTES`, `CHECKIN_POLL_MS`, `CheckinPin`, `CheckinLinkInput`, `CheckinLinkView`/`Created`, `CheckinTotals`, `CheckinOverview`, `CheckinArrivalView`, `CheckinInvitationView` (com `ref` opaca, nunca o token do convite), `CheckinArrivalInput`/`Result`, `CheckinSessionInput`/`Result`, `CheckinLookupResult`, `invitationTokenFromCode` (URL `/c/<token>` ou token).
- `seating.ts`: `SEATING_MAX_SEATS`, `SeatingTableInput`, `SeatingTableUpdate` (sem `.default()`), `SeatingTableOrder`, `SeatAssignmentsInput`, `SeatGuestView`, `SeatingTableView`, `SeatingView`.
- `vendor-portal.ts`: `VENDOR_PORTAL_DEFAULT_DAYS`/`MAX_DAYS`, `VendorPortalLinkInput`/`View`/`LinksResponse`, `VendorPortalMe`, `VendorPortalSchedule`/`ScheduleItem`, `VendorPortalTask`, `VendorPortalQuoteInput`, `VendorPortalQuote`, `VendorPortalDocument`.
- `whatsapp.ts`: `WHATSAPP_TEMPLATE_KINDS`/`LABELS`, `WHATSAPP_VARIABLES`, `DEFAULT_WHATSAPP_TEMPLATES` (`TODO(conteudo)`), `WhatsappTemplateUpdate`/`View`/`TemplatesResponse`, `WHATSAPP_QUEUE_FILTERS`, `WhatsappQueueItem`/`Response`, `WhatsappSendMark`, `waPhone`, `waLink`, `renderWhatsappTemplate`, `GuestLimitStatus`.
- Integração (`permissions.ts`): ações de evento `checkin.read`, `checkin.manage`, `seating.read`, `seating.write`, `vendors.portal`, `whatsapp.send` — todas `ALL` na matriz da API e configuráveis pela organização na tela de permissões do anfitrião; dependências: `checkin.manage`→`checkin.read`, `seating.write`→`seating.read`, `vendors.portal`→`vendors.read`, `whatsapp.send`→`invitations.read`.

`apps/api/src/` (stubs; as rotas reservadas respondem 501 via `admin/stub.ts`): A `admin/checkin.ts`, `routes/checkin.ts`; B `admin/seating.ts`; C `admin/vendor-portal.ts` (montado em `/vendors`, ao lado do da Fase 4), `routes/vendor-portal.ts`; D `admin/whatsapp.ts`, `admin/guest-limit.ts`, `plans/guest-overage.ts` (`notifyGuestOverage`, ainda não chamada). Cada arquivo descreve as rotas no comentário do topo.

**Páginas sem conta** (`apps/api/src/painel.ts`): `/portaria/` e `/fornecedor/` servem o **mesmo `index.html` do painel**; o `App.tsx` olha o `location.pathname` e abre `pages/portaria/Portaria.tsx` (A) ou `pages/portal/Portal.tsx` (C), sem sessão. O token vai no **fragmento** (`#<token>`): não chega ao servidor nem ao log. `/portaria/` usa `PORTARIA_CSP` (painel + `media-src 'self' blob: mediastream:`) e `Permissions-Policy: camera=(self)` (`PORTARIA_PERMISSIONS_POLICY`, aplicado num middleware de `app.ts` registrado antes do `secureHeaders`); o resto da API continua com `camera=()`. Teste em `apps/api/test/paginas-sem-conta.test.ts`.

**APIs sem conta** `/api/checkin/*` (A) e `/api/vendor-portal/*` (C): **isentas de `X-Web-Key`** (`middleware/web-key.ts`) porque quem chama é o navegador de quem não tem conta e a chave do site nunca vai ao navegador; a credencial vai em `Authorization: Bearer …` (sem cookie, então sem CSRF). Não leem a sessão do painel. Link achado pelo SHA-256 do token **dentro de `crossEvent("…")`**; dali em diante tudo filtra pelo evento do link (`EventCtx` pelo resolver).

`deploy/site.caddy`: o host da API passa `/portaria*`, `/fornecedor*`, `/api/checkin/*` e `/api/vendor-portal/*` (e, achado da fundação, `/api/team-invites/*` e `/api/signup/*`, que o painel chama e estavam fechados).

Painel (`apps/api/painel/src/`, rotas ligadas pela fundação, páginas "Em breve"): menu "WhatsApp" (`whatsapp.send`) e grupo "Dia do evento" com "Hoje" (`#/e/:id/dia`), "Check-in" (`checkin.read`) e "Mesas" (`seating.read`); `pages/{checkin,mesas,whatsapp,dia}/`, `pages/portaria/Portaria.tsx`, `pages/portal/Portal.tsx`.

### Rotas

Evento (`/api/admin/events/:eventId`, `requireEventAccess` + `requirePermission`):

| Rota                                                                                                                                    | Ação             | Frente |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| `GET /checkin`, `GET /checkin/invitations`                                                                                              | `checkin.read`   | A      |
| `POST /checkin/links`, `POST /checkin/links/:id/revoke`                                                                                 | `checkin.manage` | A      |
| `POST /checkin/arrivals`, `POST …/arrivals/:id/undo`                                                                                    | `checkin.manage` | A      |
| `GET /seating`                                                                                                                          | `seating.read`   | B      |
| `POST /seating/tables`, `PATCH`/`DELETE /seating/tables/:id`, `PUT /seating/tables/order`, `PUT /seating/assignments`                   | `seating.write`  | B      |
| `GET /vendors/:eventVendorId/portal-links`                                                                                              | `vendors.read`   | C      |
| `POST /vendors/:eventVendorId/portal-links`, `POST …/:linkId/revoke`                                                                    | `vendors.portal` | C      |
| `GET /whatsapp/templates`, `PUT /whatsapp/templates/:kind`, `GET /whatsapp/queue`, `POST /whatsapp/sends`, `DELETE /whatsapp/sends/:id` | `whatsapp.send`  | D      |
| `GET /guest-limit`                                                                                                                      | `dashboard.read` | D      |

Públicas sem conta: `POST /api/checkin/session`, `GET /api/checkin/summary`, `GET /api/checkin/lookup`, `POST /api/checkin/arrivals`, `POST /api/checkin/arrivals/:id/undo` — A; `GET /api/vendor-portal/{me,schedule,tasks,quotes,documents}`, `POST /api/vendor-portal/{quotes,documents}`, `GET /api/vendor-portal/documents/:id/file` — C.

## 3. Decisões (do usuário e padrões adotados)

- **Escopo (usuário):** check-in por QR, mapa de mesas, portal do fornecedor, WhatsApp e "app".
- **App do organizador (usuário): "site, não app".** Nada de app nativo nem PWA instalável do painel; o painel responsivo resolve. O PWA do site dos convidados (Fase 6 do casamento) fica como está.
- **Check-in (usuário): portaria por link + PIN, sem conta.** PIN de 6 números gerado pela API (`crypto.randomInt`), guardado só como scrypt; token de 32 bytes (base64url) só como SHA-256. Sessão da portaria = HMAC (`BETTER_AUTH_SECRET`) de `linkId.expira`, `CHECKIN_SESSION_HOURS`; toda requisição confere no banco que o link não foi revogado nem expirou (revogar derruba na hora). PIN errado: rate limit por IP (`limiter`) **e** contador no link (`CHECKIN_PIN_MAX_FAILURES` → `locked_until` por `CHECKIN_PIN_LOCK_MINUTES`); token inválido, expirado, revogado, bloqueado e PIN errado dão o mesmo 401 genérico. A portaria vê nome do convite, nomes confirmados, adulto/criança, aviso de acesso (`access_note`) e mesa — **nunca** telefone, e-mail ou restrição alimentar (como a lista de portaria atual). Referência do convite (`ref`) é opaca e nunca o token do convite (que dá acesso ao RSVP).
- **Leitura do QR:** `BarcodeDetector` (formato `qr_code`) + `getUserMedia` (câmera traseira) quando existir (Chrome/Android, Safari recente); sem ele, campo para digitar/colar o código e busca por nome (mínimo 2 letras). Sem dependência nova; o QR já impresso tem a URL `/c/<token>` (`invitationTokenFromCode`).
- **Chegada parcial:** cada marcação soma `people`; a portaria escolhe quantas pessoas chegaram (padrão: o que falta); passar das confirmadas é permitido com aviso (o convidado levou alguém que não confirmou), nunca bloqueia a entrada. Desfazer marca `undone_at` (não apaga).
- **Mesas:** por pessoa (`guests`); entra na distribuição quem confirmou (filtro "todos" mostra pendentes); quem recusou depois de sentado aparece em `seatedNotConfirmed` para a equipe tirar. Lotação acima de `seats` é aviso. Mesa por lado = `side`; grupo livre = `group_label`. Impressão pelo navegador (CSS de impressão), como as listas de convidados.
- **Portal do fornecedor (usuário): link mágico por e-mail**, por fornecedor do evento; token só em SHA-256, expira (`days`), revogável, uso repetido na validade. Padrão do e-mail = o do catálogo. Orçamento enviado entra `received` com `source = portal` (a equipe aprova/contrata como na Fase 4); documento vai para `vendor_contracts` com `source = portal` (mesmas regras de tipo pelos bytes, tamanho e limite de espaço). O cronograma mostra todos os itens do dia, mas detalhes só nos do próprio fornecedor; nada de convidados nem valores de outros.
- **Tarefa do fornecedor:** `event_tasks.event_vendor_id` (frente C liga no formulário de tarefa e no serviço; anula ao remover o fornecedor do evento, como o cronograma).
- **WhatsApp (usuário): links prontos `wa.me`**, modelos por evento, envio em lote assistido pelo WhatsApp do organizador, sem API da Meta e sem custo; "enviado" é marcado pelo organizador (a plataforma não sabe se saiu). Telefone: o de contato do convite (`contact_phone`) ou o do primeiro convidado com telefone; `waPhone` normaliza para DDI 55. Mensagem com `{convite}`, `{evento}`, `{data}`, `{link}`, `{prazo}`.
- **Acompanhantes no limite (usuário):** contam em `guestsPerEvent` (já contam: o limite soma linhas de `guests`), mas o RSVP **nunca** é recusado; ao passar do limite, e-mail à equipe (hosts e owners, como os avisos de RSVP) uma vez por estouro (`event_settings` › `plan.guest_overage`, privada; volta a avisar se cair abaixo e estourar de novo) e aviso no início do painel. Escritas do painel (criar/importar convidados) continuam com 409 `plan_limit` como na Fase 6.
- **Retenção do casamento (usuário): manter 365 dias** (anonimiza a partir de 09/04/2028); só deixar a data em destaque na Privacidade do evento.
- **Permissões:** as seis ações novas nascem liberadas para o anfitrião (lista de negação) e a organização ajusta por evento. Gerar link da portaria e do portal são `*.manage`/`vendors.portal` (configuráveis).
- **Plano:** nenhuma das ferramentas da Fase 7 é limitada por plano nesta fase (decisão aberta, §5).

## 4. Frentes paralelas

Cada frente: worktree próprio a partir da `saas` (ex.: `git worktree add C:\dev\casamento-wt\f7a -b saas-f7a saas`), banco `casamento_f7<letra>`, portas de `AGENTES.md` (A 3101/3301 … D 3104/3304), `PAYMENT_PROVIDER=simulado`, `BILLING_PROVIDER=simulado` e **sem `ASAAS_*`**. **Sem migrations** (coluna nova → pare e reporte). Troque o `notYet` das suas rotas; o `admin/stub.ts`, o `PHASE7_STUB` do `admin-isolation.test.ts` e as páginas "Em breve" saem na integração. Página nova: visual atual do painel, pt-BR, boa em 390×844. CSS próprio da frente num arquivo da frente importado pela página (ex.: `pages/mesas/mesas.css`); `styles.css` é da frente D.

### A — Check-in e portaria (branch `saas-f7a`)

- **Arquivos:** `apps/api/src/admin/checkin.ts`, `apps/api/src/routes/checkin.ts`, novos `apps/api/src/checkin/**` (tokens, PIN scrypt, sessão HMAC, serviço de chegadas e busca; lê `seat_assignments`/`seating_tables` só para mostrar a mesa); `packages/shared/src/checkin.ts`; `apps/api/src/admin/invitations.ts` e o formulário/detalhe de convite em `apps/api/painel/src/pages/Convites.tsx` (campo `accessNote`, "Aviso para a portaria") e `packages/shared/src/admin.ts` **só** no schema do convite (campo opcional `accessNote`); painel `pages/checkin/**`, `pages/portaria/**`; testes novos `apps/api/test/{checkin,checkin-portaria}.test.ts`.
- **Entregas:** §2/§3 (links, PIN, sessão, bloqueio, busca por código e nome, chegada parcial, desfazer, contagem por polling, painel do check-in com links e chegadas, aviso de acesso no convite). Leitor com `BarcodeDetector`; sem ele, digitação/busca (se o navegador não tiver câmera, a tela continua útil).
- **Testes:** link de outro evento/revogado/expirado → 401 igual ao PIN errado; bloqueio depois de N erros; sessão de link revogado cai; busca não devolve telefone/e-mail/restrição (varrer o JSON); `ref` de outro evento → 404; parcial soma e desfazer desconta; isolamento entre eventos; auditor estrito (lookup do link em `crossEvent`).

### B — Mapa de mesas (branch `saas-f7b`)

- **Arquivos:** `apps/api/src/admin/seating.ts`, novos `apps/api/src/seating/**`; `packages/shared/src/seating.ts`; painel `pages/mesas/**` (lista, distribuição, impressão por mesa, plaquinhas e lista do cerimonial com mesa); `apps/api/src/admin/guest-lists.ts` (coluna "Mesa" nas listas do cerimonial e da portaria, se couber); testes novos `apps/api/test/seating.test.ts`.
- **Entregas:** §3 "Mesas". Mesa e pessoa de outro evento → 404; lugar repetido → 409; apagar mesa devolve as pessoas a "sem mesa"; convidado apagado sai da mesa (cascade).
- **Testes:** CRUD, ordem, distribuição em lote, lotação como aviso, `seatedNotConfirmed`, isolamento, auditor.

### C — Portal do fornecedor (branch `saas-f7c`)

- **Arquivos:** `apps/api/src/admin/vendor-portal.ts`, `apps/api/src/routes/vendor-portal.ts`, novos `apps/api/src/vendor-portal/**` e `apps/api/src/vendor-portal-email.ts`; `apps/api/src/{vendors,budget,tasks}/**` e `apps/api/src/admin/{vendors,budget,tasks}.ts` no que o portal precisar (`source`/`portal_link_id`, `event_vendor_id` da tarefa, anular ao remover o fornecedor); `packages/shared/src/{vendor-portal,tasks,vendors,budget}.ts` (aditivo: `source` nas linhas, `eventVendorId` na tarefa); painel `pages/portal/**`, `pages/fornecedores/**`, `pages/Fornecedores.tsx` (links do portal no detalhe do fornecedor), `pages/Tarefas.tsx` (escolher fornecedor), `pages/financeiro/**` (selo "enviado pelo fornecedor"); testes novos `apps/api/test/{vendor-portal,vendor-portal-admin}.test.ts`.
- **Entregas:** §3 "Portal do fornecedor" e "Tarefa do fornecedor"; e-mail com o link (pt-BR, nome do evento, validade).
- **Testes:** token de outro evento/revogado/expirado → 401; o fornecedor não vê orçamentos/documentos/tarefas de outro fornecedor do mesmo evento nem de outro evento; cronograma sem detalhes dos itens alheios; orçamento entra `received` com `source = portal`; documento com tipo falso pelos bytes → 422; limite de espaço → 409; download só do próprio; auditor.

### D — WhatsApp, painel no celular, limite com acompanhantes e retenção visível (branch `saas-f7d`)

- **Arquivos:** `apps/api/src/admin/whatsapp.ts`, novos `apps/api/src/whatsapp/**`; `apps/api/src/admin/guest-limit.ts`, `apps/api/src/plans/guest-overage.ts`, novo `apps/api/src/guest-overage-email.ts`, `apps/api/src/routes/invitations.ts` (só a chamada a `notifyGuestOverage` depois do RSVP); `packages/shared/src/whatsapp.ts`; painel `pages/whatsapp/**`, `pages/dia/**`, `pages/Dashboard.tsx` (aviso do limite), `pages/Privacidade.tsx` (data da anonimização em destaque), `pages/Cronograma.tsx` (no celular), `styles.css`, `ui.tsx` (componentes responsivos, sem mudar a API dos existentes); testes novos `apps/api/test/{whatsapp,guest-overage}.test.ts`.
- **Entregas:** §3 "WhatsApp" e "Acompanhantes no limite"; página "Hoje" (contagem do check-in, próximos itens do cronograma, tarefas de hoje/atrasadas, atalhos para Mesas e Check-in) lendo as APIs das outras frentes pelo cliente (`/checkin` pode estar 501 até a integração: tratar como "indisponível"); painel inteiro usável em 390×844 (menu, tabelas como cartões, formulários, toque ≥ 44 px); data da retenção em destaque.
- **Testes:** fila por filtro (não enviado, sem resposta, confirmados), mensagem com variáveis e `wa.me` certo, sem telefone fora do link, marcar/desfazer, modelo vazio volta ao padrão, isolamento; RSVP com acompanhante acima do limite → 200 + um e-mail só (segundo RSVP não reenvia), sem assinatura/Cortesia → nada; `GET /guest-limit`; auditor.

### Arquivos só da integração

`packages/db/src/schema/**`, `packages/db/migrations/**`, `packages/db/src/{index,seed,cli,migrate,reset}.ts`, `packages/shared/src/{index,permissions,errors,org,team,payment-accounts,gifts,site,content,plans,privacy}.ts` (em `admin.ts`, só o campo `accessNote` é da A), `apps/api/src/{app.ts,env.ts,painel.ts,admin/index.ts,admin/org/index.ts,admin/stub.ts,admin/context.ts,tenancy/**,storage/**,middleware/**,payments/provider.ts,crypto/**}`, `apps/api/test/{admin-isolation.test.ts,sql-audit.ts,table-scopes.test.ts,helpers.ts,tenancy.test.ts,host-permissions.test.ts,global-setup.ts,paginas-sem-conta.test.ts}`, `apps/api/painel/src/{App.tsx,org.tsx,routes.ts,nav.ts,event.tsx}`, `.env.example`, `.env.production.example`, `docker-compose.prod.yml`, `deploy/**`, `CLAUDE.md`, `docs/**`.

### Integração (depois das 4)

Merge A → B → C → D; apagar `admin/stub.ts` e o `PHASE7_STUB`; conferir que o `seguranca` do edge **não sobrescreve** o `Permissions-Policy` da portaria (se sobrescrever, a câmera não abre em produção: ajustar no edge ou documentar em `DEPLOY.md`); `docs/DEPLOY.md` (caminhos novos do host da API), `docs/PERSONALIZAR.md` (check-in, mesas, portal, WhatsApp), `CLAUDE.md`, `STATUS.md`; e2e novo `painel-fase7.spec.ts` (gerar link da portaria → PIN → buscar convite → chegada parcial → desfazer; mesas e impressão; portal do fornecedor enviando orçamento; fila do WhatsApp e marcar enviado; RSVP com acompanhante acima do limite gera aviso), `pnpm build`, screenshots em `.screenshots/saas-fase7/` (390×844 e 1440×900, inclusive portaria e portal).

## 5. Decisões do usuário

Respondidas em 21/11/2026 (ver `AGENTES.md`): escopo; WhatsApp por links prontos; "site, não app"; portaria por link + PIN; portal por link mágico; mesas por lista; acompanhantes contam com aviso, sem recusar RSVP; retenção do casamento mantida em 365 dias.

Em aberto (para depois, não bloqueiam as frentes):

- Ferramentas da Fase 7 por plano (ex.: portal do fornecedor e check-in só no `profissional`)? Hoje, nenhuma restrição.
- Textos padrão das mensagens do WhatsApp (`TODO(conteudo)`).
- Validade padrão do link da portaria (48 h) e do portal (30 dias).

## 6. Fundação (feita)

- Migration 0013 gerada pelo drizzle-kit e revisada (nomes de constraint ≤ 64 caracteres; FKs compostas nomeadas à mão); aplicada no `casamento` com `pnpm db:migrate` (14 linhas em `__drizzle_migrations`), dump antes em scratchpad `casamento-antes-0013.sql`.
- Contratos, permissões (matriz e tela do anfitrião), stubs 501, páginas reservadas, menu, páginas sem conta (`/portaria/`, `/fornecedor/`) com CSP e `Permissions-Policy` próprias, isenção de `X-Web-Key` documentada, `site.caddy`, auditor e testes de enumeração/permissões estendidos.
