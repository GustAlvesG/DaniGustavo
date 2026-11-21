# Plataforma — Fase 4: gestão do evento

Branch `saas`. Regras e fluxo dos agentes em `docs/saas/AGENTES.md`.

**Objetivo:** a organização (e o anfitrião, se ela deixar) toca o evento pelo painel: checklist de tarefas com prazos e modelos, fornecedores reaproveitáveis com contratos, orçamentos com parcelas, planejado × realizado e o cronograma do dia.

**Pronto quando:**

1. **Tarefas:** CRUD por evento (título, descrição, categoria, responsável = membro da org ou anfitrião, prazo absoluto ou relativo à data do evento, status); visões atrasadas/próximas (30 dias)/abertas/feitas com contagem; modelos por tipo de evento mantidos pela organização; aplicar modelo gera as tarefas com prazos calculados; recalcular prazos relativos quando a data do evento muda.
2. **Fornecedores:** catálogo da organização (nome, categoria, contato, documento, observações, avaliação 1–5, arquivar); ligar ao evento (do catálogo ou cadastrando na hora); status no evento (em cotação, contratado, descartado).
3. **Contratos:** upload de PDF/JPG/PNG/WebP até 10 MB (tipo pelos bytes) na área **privada** do `Storage`, download só pelo painel com sessão e permissão.
4. **Orçamentos:** itens (descrição, quantidade, valor unitário em centavos), desconto, total; status rascunho → recebido → aprovado → contratado (ou recusado); contratar exige o plano de parcelas que soma o total; marcar parcela paga/desfazer; planejado (por categoria) × contratado × pago.
5. **Cronograma do dia:** itens com horário (fuso do evento), fim opcional, atividade, local, responsável livre ou fornecedor do evento.
6. Permissões novas por evento e por organização, com o ajuste do anfitrião da Fase 3; menus respeitam `useCan`; `admin-isolation.test.ts` e o auditor estrito cobrem tudo.
7. `pnpm lint`, `typecheck`, `test`, `build`, `format:check` e e2e (`painel`) verdes; screenshots das páginas novas em 390×844 e 1440×900.

**Fora do escopo:** assinatura eletrônica, pagamento real a fornecedor (as parcelas são registro, não cobrança), lembretes de tarefa obrigatórios (ver §3), portal do fornecedor, anexos em tarefa, cronograma público no site.

## 1. Modelo de dados (migration `0010_planejamento.sql`, feita pela fundação)

Schema em `packages/db/src/schema/planning.ts`. Dinheiro em centavos (`int`); datas de calendário (prazo, vencimento, validade, assinatura) em `DATE` "AAAA-MM-DD" no fuso do evento; instantes em `DATETIME(3)` UTC preenchidos pela aplicação. Categorias em `varchar(32)` (listas em `@casamento/shared` › `planning.ts`); status em `enum` (listas repetidas no schema e no shared, conferidas por `packages/db/test/planning-schema.test.ts`).

| Tabela                | Escopo            | Observação                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendors`             | `organization_id` | Catálogo. `document` só dígitos (14), `rating` 1–5 nulo, `archived_at`. Único `(organization_id, id)`.                                                                                                                                                                                |
| `task_templates`      | `organization_id` | `event_type` nulo = qualquer tipo.                                                                                                                                                                                                                                                    |
| `task_template_items` | `organization_id` | `offset_days` (−90 = 90 dias antes), `sort`. FK composta `(organization_id, template_id)` cascade.                                                                                                                                                                                    |
| `event_tasks`         | `event_id`        | `status` enum(todo, doing, done), `assignee_user_id`/`completed_by` → `user` (set null), `due_on` DATE, `due_offset_days` (preenchido = prazo relativo; `due_on` calculado), `template_item_id` (procedência, sem FK), `completed_at`, `sort`.                                        |
| `event_vendors`       | `event_id`        | Repete `organization_id`: FKs compostas `(organization_id, event_id)` → `events` (cascade) e `(organization_id, vendor_id)` → `vendors` (**restrict**: fornecedor usado não se apaga, arquiva). Única `(event_id, vendor_id)`. `category`, `status` enum(prospect, hired, dismissed). |
| `vendor_contracts`    | `event_id`        | FK composta `(event_id, event_vendor_id)` cascade. `file` (ULID.ext no Storage privado), `original_name`, `mime`, `bytes`, `signed_on`, `uploaded_by`.                                                                                                                                |
| `quotes`              | `event_id`        | FK composta com `event_vendors`. `category`, `status` enum(draft, received, approved, contracted, declined), `discount_cents`, `total_cents` (mantido pela aplicação), `valid_until`, carimbos `received_at`/`approved_at`/`contracted_at`/`declined_at`.                             |
| `quote_items`         | `event_id`        | FK composta com `quotes` cascade. `quantity` inteiro ≥ 1, `unit_cents`.                                                                                                                                                                                                               |
| `quote_installments`  | `event_id`        | FK composta com `quotes` cascade. `number` (único por orçamento), `due_on`, `amount_cents`, `paid_at`, `method`, `notes`.                                                                                                                                                             |
| `budget_lines`        | `event_id`        | Previsto por categoria; única `(event_id, category)`.                                                                                                                                                                                                                                 |
| `schedule_items`      | `event_id`        | `starts_at`/`ends_at` UTC, `title`, `details`, `location`, `responsible` (texto), `event_vendor_id` **sem FK** (composta com SET NULL anularia `event_id`; a aplicação confere e anula ao desligar o fornecedor), `sort`.                                                             |

Também: índice único `events (organization_id, id)` (alvo da FK de `event_vendors`). A migration só cria; aplicada no `casamento` pela fundação (dump antes em scratchpad `casamento-antes-0010.sql`).

## 2. Contratos e pontos de extensão (prontos na fundação)

`packages/shared/src/`:

- `planning.ts` (integração): `VENDOR_CATEGORIES`/`VendorCategory`/`VENDOR_CATEGORY_LABELS` (também as categorias do planejado × realizado), `TASK_CATEGORIES`/labels, `TASK_STATUSES`, `EVENT_VENDOR_STATUSES`, `QUOTE_STATUSES` + labels, `QUOTE_TRANSITIONS`, `Cents` (inteiro 0…R$ 10 mi), `OffsetDays` (±1100), `optionalText(max)` (vazio → null), `PlanningPerson`.
- `tasks.ts` (A): `TaskDue` (`{kind:"date"}` | `{kind:"offset"}` | null), `TaskInput`/`TaskUpdate`, `TaskView`/`TASK_VIEWS`, `TASK_UPCOMING_DAYS` (30), `TaskRow`, `TaskList`, `TaskTemplateItemInput`, `TaskTemplateInput`, `TaskTemplateSummary`/`View`, `ApplyTaskTemplate`(+`Result`).
- `vendors.ts` (B): `CONTRACT_MAX_BYTES` (10 MB), `CONTRACT_MIME`, `VendorInput`/`VendorUpdate` (com `archived`), `VendorRow`, `EventVendorInput` (`vendorId` **ou** `vendor` novo), `EventVendorUpdate`, `EventVendorRow`, `ContractMeta`, `ContractRow`.
- `budget.ts` (C): `QuoteItemInput`, `QuoteInput`, `InstallmentInput`, `QuoteStatusChange` (`installments` obrigatório para `contracted`), `InstallmentPlan`, `InstallmentPayment` (`paidOn` ou null), `QuoteSummary`/`QuoteView`, `InstallmentRow`, `BudgetPlan`, `BudgetCategoryRow`, `BudgetView`.
- `schedule.ts` (D): `ScheduleItemInput`/`Update` (data + hora locais), `ScheduleItemRow`, `ScheduleView`.
- `permissions.ts`: ações de evento `tasks.read/write`, `vendors.read/write`, `budget.read/write`, `schedule.read/write` (com rótulos e `ACTION_REQUIRES`: negar a leitura nega a escrita); ações da organização `vendors.manage` e `templates.manage`.

`apps/api/src/`:

- `tenancy/permissions.ts` (matriz: todas para todos os papéis) e `tenancy/org-access.ts` (`vendors.manage`, `templates.manage` para dono e membro; ler catálogo e modelos é `org.read`).
- `storage/index.ts`: área privada `putPrivate`/`getPrivate`/`deletePrivate` em `<UPLOAD_DIR>/<eventId>/private/<ULID>.(pdf|jpg|png|webp)` (`PRIVATE_FILE`); o `get` público não alcança (nome sem "/").
- Stubs (501 até a frente implementar, já com a permissão certa e o contrato no comentário do topo): `admin/tasks.ts` (A), `admin/org/task-templates.ts` (A), `admin/vendors.ts` (B: `/vendor-catalog` e `/vendors`), `admin/org/vendors.ts` (B), `admin/budget.ts` (C: `/quotes`, `/installments`, `/budget`), `admin/schedule.ts` (D). `admin/stub.ts` (`notYet`) só sai na integração.
- Teste `sql-audit.ts`: tabelas de evento novas em `SCOPED_TABLES`; `vendors`, `task_templates`, `task_template_items` em `ORG_SCOPED_TABLES`. Consulta que junta `event_vendors` e `vendors` precisa das duas colunas (ex.: `on vendors.organization_id = event_vendors.organization_id and vendors.id = event_vendors.vendor_id ... where event_vendors.event_id = ?`). Casos em `tenancy.test.ts`.
- `admin-isolation.test.ts`: enumera as rotas sozinho; a fundação só acrescentou as áreas novas na lista de cobertura (evento: tasks, vendor-catalog, vendors, quotes, installments, budget, schedule; org: task-templates, vendors).

Painel (`apps/api/painel/src/`): páginas reservadas já ligadas às rotas e menus — `pages/Tarefas.tsx` (`#/tarefas`), `pages/Fornecedores.tsx` (`#/fornecedores[/:id]`), `pages/Financeiro.tsx` (`#/financeiro`, `#/financeiro/orcamentos/:id`), `pages/Cronograma.tsx` (`#/cronograma`), `pages/org/Fornecedores.tsx` (`#/o/:orgId/fornecedores[/:id]`), `pages/org/ModelosTarefas.tsx` (`#/o/:orgId/modelos[/:id]`). Itens do menu do evento escondidos por `tasks.read`/`vendors.read`/`budget.read`/`schedule.read`.

### Rotas

Evento (`/api/admin/events/:eventId`, `requireEventAccess` + `requirePermission`):

| Rota                                                                                                                                                                    | Ação             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `GET /tasks?view=`, `GET /tasks/assignees`, `GET /tasks/templates`                                                                                                      | `tasks.read`     |
| `POST /tasks`, `PATCH/DELETE /tasks/:taskId`, `POST /tasks/apply-template`, `POST /tasks/recalculate`                                                                   | `tasks.write`    |
| `GET /vendor-catalog`, `GET /vendors`, `GET /vendors/:id/contracts`, `GET /vendors/:id/contracts/:contractId/file`                                                      | `vendors.read`   |
| `POST /vendors`, `PATCH/DELETE /vendors/:id`, `POST /vendors/:id/contracts`, `DELETE /vendors/:id/contracts/:contractId`                                                | `vendors.write`  |
| `GET /quotes`, `GET /quotes/:quoteId`, `GET /budget`                                                                                                                    | `budget.read`    |
| `POST /quotes`, `PUT/DELETE /quotes/:quoteId`, `POST /quotes/:quoteId/status`, `PUT /quotes/:quoteId/installments`, `PATCH /installments/:installmentId`, `PUT /budget` | `budget.write`   |
| `GET /schedule`                                                                                                                                                         | `schedule.read`  |
| `POST /schedule`, `PATCH/DELETE /schedule/:itemId`                                                                                                                      | `schedule.write` |

Organização (`/api/admin/orgs/:orgId`, `requireOrgAccess` + `requireOrgPermission`): `GET /vendors`, `GET /vendors/:vendorId`, `GET /task-templates`, `GET /task-templates/:templateId` (`org.read`); `POST /vendors`, `PATCH/DELETE /vendors/:vendorId` (`vendors.manage`); `POST /task-templates`, `PUT/DELETE /task-templates/:templateId` (`templates.manage`).

## 3. Decisões (padrões adotados)

- **Catálogo por organização, uso por evento.** O anfitrião não entra no painel da organização: vê o catálogo pelo evento (`GET /vendor-catalog`, `vendors.read`) e pode cadastrar fornecedor novo no catálogo ao ligá-lo ao evento (`POST /vendors` com `vendor`, `vendors.write`). Editar/arquivar o catálogo é só pela organização.
- **Fornecedor usado não se apaga** (FK restrict): arquiva-se (some das listas de escolha, continua nos eventos).
- **Mesma organização garantida no banco** (FKs compostas de `event_vendors`), além da conferência da aplicação.
- **Prazos:** relativo guarda o deslocamento e o `due_on` calculado (fuso do evento). Mudou a data do evento → `POST /tasks/recalculate` (o painel oferece; a integração liga também à mudança de data na organização/`/config`). Evento sem data: tarefa relativa fica sem `due_on` até ter data.
- **Aplicar modelo** gera cópias (mudar o modelo depois não mexe nas tarefas); aplicar duas vezes duplica (o painel avisa). Modelos filtrados pelo tipo do evento + os de qualquer tipo.
- **Responsável da tarefa:** só membro da org ou anfitrião do evento (422 senão). Removido da equipe → a tarefa fica com o nome até alguém trocar (o vínculo do usuário continua; só some da lista de escolha).
- **Orçamento contratado é imutável** (itens/valor): editar exige "desfazer" que não existe nesta fase — recusar não vale para contratado. Contratar marca o fornecedor do evento como `hired` e grava as parcelas; a soma tem de bater com o total (422).
- **Parcelas** são registro manual (pago em, forma); sem cobrança nem integração bancária. Refazer o plano não pode apagar parcela paga.
- **Planejado × realizado:** planejado = `budget_lines`; contratado = soma dos orçamentos `contracted` da categoria; pago = soma das parcelas pagas. Categoria do orçamento padrão = a do fornecedor no evento.
- **Contratos privados:** área própria do Storage, download só autenticado com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`; rate limit de upload por usuário (`sensitiveLimit`), como as fotos.
- **Cronograma** em UTC com entrada local (data + hora + fuso do evento, `localDateTimeToIso`); padrão o dia do evento; ordenado por horário e `sort`.
- **Lembretes de tarefa por e-mail:** fora desta fase. Padrão documentado: resumo semanal opcional aos responsáveis (atrasadas + próximos 7 dias) numa fase seguinte, com chave privada `tasks.digest` em `event_settings`.
- **Sem módulo no site:** gestão é só do painel (não entra em `event.modules`).

## 4. Frentes paralelas

Cada frente: worktree próprio, banco `casamento_f4<letra>`, portas de `AGENTES.md`. **Sem migrations.** Contratos de `packages/shared` só mudam de forma aditiva e no arquivo da própria frente; precisou mudar arquivo de outra frente ou da integração → pare e reporte. Ao implementar, apague o `notYet` das suas rotas (o `admin/stub.ts` só sai na integração). Serviços novos em pasta própria da frente.

### A — Tarefas e modelos (branch `saas-f4a`)

- **Arquivos:** `apps/api/src/admin/tasks.ts`, `apps/api/src/admin/org/task-templates.ts`, novos `apps/api/src/tasks/**`; dono de `packages/shared/src/tasks.ts`; painel `pages/Tarefas.tsx`, `pages/org/ModelosTarefas.tsx` (+ `pages/tarefas/**` se precisar); testes novos `apps/api/test/tasks.test.ts` e `apps/api/test/task-templates.test.ts`.
- **Consome:** `eventTasks`, `taskTemplates`, `taskTemplateItems`, `organizationMembers`/`eventMembers`/`user` (responsáveis), `EventCtx.startsAt`/`timezone`, `requireOrgPermission("templates.manage")`.
- **Testes:** prazo relativo calculado no fuso (virada de dia em UTC), recalcular após mudar data; visões atrasadas/próximas com relógio fixo (`deps.now`); responsável fora da org/evento → 422; aplicar modelo de outra org → 404; itens de modelo de outra org nunca aparecem; auditor estrito.

### B — Fornecedores e contratos (branch `saas-f4b`)

- **Arquivos:** `apps/api/src/admin/vendors.ts`, `apps/api/src/admin/org/vendors.ts`, novos `apps/api/src/vendors/**` (inclui detecção de PDF/imagem pelos bytes); dono de `packages/shared/src/vendors.ts`; painel `pages/Fornecedores.tsx`, `pages/org/Fornecedores.tsx` (+ `pages/fornecedores/**`); testes novos `apps/api/test/vendors.test.ts`.
- **Consome:** `vendors`, `eventVendors`, `vendorContracts`, `Storage.putPrivate/getPrivate/deletePrivate`, `sensitiveLimit`, `quotes` (só leitura, para recusar remover fornecedor com orçamento contratado), `scheduleItems` (só anular `event_vendor_id` ao remover).
- **Testes:** documento só dígitos e com 11/14; PDF falso (extensão certa, bytes errados) → 422; > 10 MB → 413; download exige sessão + `vendors.read` e não sai por `/uploads`; fornecedor de outra org → 404; apagar usado → 409; auditor estrito com join catálogo.

### C — Orçamentos, parcelas e financeiro (branch `saas-f4c`)

- **Arquivos:** `apps/api/src/admin/budget.ts`, novos `apps/api/src/budget/**`; dono de `packages/shared/src/budget.ts`; painel `pages/Financeiro.tsx` (+ `pages/financeiro/**`); testes novos `apps/api/test/budget.test.ts`.
- **Consome:** `quotes`, `quoteItems`, `quoteInstallments`, `budgetLines`, `eventVendors` (validar e marcar `hired` ao contratar), `QUOTE_TRANSITIONS`, `Cents`.
- **Testes:** total = Σ(qtd × unitário) − desconto; transições inválidas 422; contratar sem parcelas ou com soma diferente 422; contratado imutável 409; parcela paga não some no replanejamento; planejado × contratado × pago por categoria e totais; orçamento/parcela de outro evento → 404; auditor estrito.

### D — Cronograma e navegação (branch `saas-f4d`)

- **Arquivos:** `apps/api/src/admin/schedule.ts`, novos `apps/api/src/schedule/**`; dono de `packages/shared/src/schedule.ts`; painel `pages/Cronograma.tsx` e `apps/api/painel/src/{App.tsx,org.tsx,nav.ts,event.tsx,ui.tsx,styles.css,tools.css}` e `pages/Dashboard.tsx`, `pages/org/Inicio.tsx`; e2e novo `apps/web/e2e/painel-fase4.spec.ts` (a integração roda).
- **Entregas:** cronograma (lista do dia, imprimir), menu do evento agrupado ("Gestão": Tarefas, Fornecedores, Financeiro, Cronograma) com `useCan`; menu da organização (Fornecedores, Modelos) para quem tem `org.read`; cartões no início do evento (tarefas atrasadas, próximas parcelas — consumindo `GET /tasks?view=overdue` e `GET /budget` com fallback silencioso enquanto A/C não chegam).
- **Testes:** horário local → UTC e volta (horário de verão); fornecedor de outro evento → 422; e2e: fluxo mínimo das quatro páginas.

### Arquivos só da integração

`packages/db/src/schema/**`, `packages/db/migrations/**`, `packages/db/src/{index,tenancy-admin,cli}.ts`, `packages/shared/src/{planning,permissions,org,admin,index}.ts`, `apps/api/src/{app.ts,admin/index.ts,admin/org/index.ts,admin/stub.ts,storage/index.ts,tenancy/**}`, `apps/api/test/{admin-isolation.test.ts,sql-audit.ts,helpers.ts,tenancy.test.ts}`, `CLAUDE.md`, `docs/**`.

### Integração (depois das 4)

Merge A → B → C → D; apagar `admin/stub.ts`; ligar o recálculo de prazos à mudança de data do evento (`admin/org/events.ts` e `/config`); `admin-isolation.test.ts` verde com as rotas reais; `pnpm build`, e2e (`painel`, `multi`) e screenshots em `.screenshots/saas-fase4/`; `CLAUDE.md`, `docs/PERSONALIZAR.md` e `STATUS.md`.

## 5. Decisões do usuário (resolvidas em 21/11/2026)

| Decisão                                                 | Padrão                                                                    | Decisão (21/11/2026)                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Anfitrião vê orçamentos/financeiro e contratos?         | Sim (pode tudo); a organização tira por evento (`budget.*`, `vendors.*`). | Mantido: vê financeiro e contratos.                                                                       |
| Anfitrião pode cadastrar fornecedor no catálogo da org? | Sim, ao ligar ao evento (`vendors.write`).                                | Alterado: não cadastra; só liga fornecedor já existente. Na Fase 6.                                       |
| Categorias de fornecedor/orçamento                      | Lista fixa de 18 em `planning.ts`.                                        | Alterado: categorias personalizadas por organização, além das 18. Na Fase 6.                              |
| Lembretes de tarefa por e-mail                          | Fora da fase.                                                             | Alterado: resumo semanal de atrasadas/próximas para os responsáveis, opt-out por evento. Na Fase 6.       |
| Modelos de tarefas prontos da plataforma                | Nenhum.                                                                   | Alterado: modelos da plataforma por tipo de evento, que a organização copia/aplica. Na Fase 6.            |
| Orçamento contratado pode ser reaberto?                 | Não (imutável).                                                           | Alterado: reabre se nenhuma parcela foi paga (volta a aprovado, apaga parcelas, em transação). Na Fase 6. |

## 6. Integração: desvios e decisões

- **Merges** A → B → C → D sem conflito; `admin/stub.ts` apagado; `admin-isolation.test.ts` também confere que nenhuma rota responde 501.
- **Data do evento:** nenhuma rota mudava `events.starts_at` (a org só muda status; `/config` só tipo/módulos/lados/vocabulário). A data que o painel edita é `wedding.datetime`/`wedding.timezone` (Configurações): o `PUT /settings` agora sincroniza `events.starts_at/timezone`, invalida o resolver e chama `recalculateTaskDues` (teste em `tasks.test.ts`). Mudar a data pela org fica para quando houver tela.
- **Coerência:** `@casamento/db` reexporta `isNotNull` (orçamento, tarefas e conciliação sem `sql` cru); alinhamento do Financeiro em CSS (`.num`, rótulos `data-label` no celular); cartões do resumo conferidos contra `GET /tasks?view=overdue` e `GET /budget`; o Financeiro usa `GET /vendors` da frente B.
- **Remover fornecedor do evento:** orçamentos não contratados saem em cascata (FK), o cronograma é anulado pela aplicação e contratado bloqueia (409); o aviso do painel diz isso (teste em `vendors.test.ts`).
- **Bugs achados no e2e:** `TaskUpdate`/`VendorUpdate` eram `.partial()` de schemas com `.default()` — no zod 4 o padrão é aplicado e "marcar como feita" zerava categoria, prazo e responsável (corrigido, com teste); `formatDate` do painel mostrava datas "AAAA-MM-DD" um dia antes (lia como UTC e formatava em São Paulo).
- **Intermitência do `reminders.test.ts`:** deadlock real do InnoDB (registrado no `SHOW ENGINE INNODB STATUS` do banco da frente A) entre o `insert into event_members` do `beforeAll` dos lembretes e o `delete from user` (cascata em `event_members`) da limpeza de `team-invites.test.ts`, rodando em paralelo. Escritas de setup/limpeza em tabelas compartilhadas (`reminders`, `admin`, `import`, `team-invites`) passam por `retryOnDeadlock`.
- **Testes novos de integração:** isolamento da gestão entre eventos (tarefa, fornecedor, orçamento e cronograma de B invisíveis e intocáveis por A) e permissões do anfitrião por área (`host-permissions.test.ts`).
- **E2E** `painel-fase4.spec.ts`: uma gestora (membro da org do evento de teste, criada pelo apoio de banco) monta modelo e catálogo; o anfitrião aplica o modelo, liga o fornecedor, anexa e baixa um PDF, contrata orçamento com parcelas, paga uma, confere o Financeiro e os cartões do início; cronograma. CSS de celular de Tarefas/Cronograma ajustado (título espremido, abas estourando).
- **Banco de dev:** nada novo a aplicar (0010 já estava). Dados de demonstração das screenshots apagados.
