O modelo Opus deve ser apenas orquestrar a operação e delegar as tarefas para subagentes Opus ou inferior para execução das tarefas. Deverá ser selecionado entre Opus, Sonnet e Haiku de acordo com a dificuldade do processo.

## Visão geral

Site de casamento de Dani & Gustavo: site público (convidados, RSVP, lista de presentes, recados) e painel dos noivos. Especificação completa em `docs/PROMPT.md` (pt-BR). Gustavo é dev Laravel: explique decisões não óbvias do Next.js em uma linha.

## Stack (como construído)

- Monorepo pnpm 12 (`pnpm-workspace.yaml`), Node 24 (roda `.ts` direto, sem build com tsc).
- `apps/web`: Next.js 16.4.6, React 19.3.0, Tailwind 4.3.3, Vitest 5 + Playwright 1.65.
- `apps/api`: Hono 4.13 (@hono/node-server), Better Auth 1.7 (só e-mail+senha, sem 2FA; rate limit no login), Zod 4, painel React + Vite 8 em `/painel`.
- `packages/db` (`@casamento/db`): Drizzle ORM 0.45 + mysql2 3.24 + drizzle-kit 0.31, migrations e seed.
- Banco: MariaDB 10.4 (XAMPP) em dev, MySQL 8 no CI. TypeScript 5.9, ESLint 9 (flat), Prettier 3.

## Estrutura

- `apps/web/` site público (`src/app`; leia `apps/web/AGENTS.md` e `node_modules/next/dist/docs/`). Textos e fotos de apresentação em `src/content/` (`home.ts`, `galeria.ts`, `paginas.ts`), fotos em `public/fotos/`; guia em `docs/PERSONALIZAR.md`.
- `apps/api/` API Hono (`src/app.ts`, `auth.ts`, `env.ts`, `middleware/`, rotas do painel em `src/admin/`) e painel (`painel/`: `App.tsx` com rotas por hash, `pages/`, `ui.tsx`, `api.ts`).
- `packages/db/` schema, migrations, seed, `src/cli.ts`.
- `docs/PROMPT.md` especificação; `.github/workflows/ci.yml`; `docker-compose.yml` (opcional); `.screenshots/` (ignorado pelo git).

## Comandos

Setup do zero: `cp .env.example .env` (preencher) → subir MariaDB (`C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini`) → `pnpm install` → `pnpm db:reset` → `pnpm dev`.

- `pnpm dev` sobe web e api em paralelo; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` / `format:check`.
- E2E: `pnpm --filter @casamento/web test:e2e`.
- Banco: `pnpm db:generate`, `db:migrate`, `db:seed`, `db:reset`.
- Se `drizzle-kit migrate` falhar em silêncio: `pnpm --filter @casamento/db exec node src/cli.ts migrate`.

## URLs locais

- Site: http://localhost:3000 (h1 "Dani & Gustavo")
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
- `/api/admin/*`: sessão do Better Auth obrigatória (`requireSession`), isento de X-Web-Key; escrita com `Origin` de outra origem → 403 (CSRF); rate limit por usuário em reembolso, conciliação, upload e novo link; troca de senha limitada a 5/min no Better Auth.
- Fotos dos presentes: upload pelo painel (JPG/PNG/WebP até 2 MB, tipo conferido pelos bytes) em `UPLOAD_DIR` (padrão `apps/api/storage/uploads`, fora do git), servidas pela API em `/uploads/:arquivo`; o Next repassa `/uploads/*` à API por `rewrites`.
- Cache do site após mudanças no painel: a API chama `POST SITE_URL/api/revalidar` (Route Handler do Next, protegido pelo mesmo `X-Web-Key`) com as tags `site`/`gifts`/`messages` → `revalidateTag(tag, { expire: 0 })`.
- Reembolso (`src/orders/reconcile.ts`): `PaymentProvider.refund` + `applyCharge` (cotas devolvidas, recado sai do mural). Conciliação: botão no painel e rotina diária (`startReconcileJob` em `src/jobs.ts`) sobre pendentes e pedidos dos últimos 3 dias.
- Pagamentos atrás da interface `PaymentProvider` (`apps/api/src/payments/`): `simulado` (padrão; Pix fictício, cartões 4111…1111 aprova / 4000…0002 recusa, botão "Simular pagamento aprovado" que chama `POST /api/dev/orders/:id/approve`, só fora de produção, e entrega à rota real um webhook no formato do Asaas) e `asaas` (API v3 com `fetch`, sem SDK; Mercado Pago removido por decisão do casal). Asaas: Pix na nossa tela (cliente por CPF → cobrança PIX → `/pixQrCode`); cartão na fatura hospedada (`invoiceUrl`, `POST /api/orders/:id/card-checkout`), dados do cartão nunca passam por nós. CPF obrigatório no formulário só com Asaas (`requiresCpf` em `/api/gifts`), validado por dígitos, repassado ao Asaas e nunca gravado/logado. `.env`: `PAYMENT_PROVIDER=simulado|asaas` (explícito), `ASAAS_API_KEY`, `ASAAS_ENV` (deduzido pelo prefixo `$aact_hmlg_`/`$aact_prod_`; diverge → API não sobe), `ASAAS_WEBHOOK_TOKEN` (obrigatório em produção). Passo a passo em `docs/PERSONALIZAR.md` §6.
- Pedidos: `gifts.quota_sold` conta vendidas + reservadas; reserva com `SELECT … FOR UPDATE` na transação; pendente segura 30 min; rotina de expiração a cada 5 min dentro do processo da API (`src/jobs.ts`, `setInterval`), que antes confere no provedor se não foi pago e, no Asaas, apaga as cobranças abertas (o QR do Asaas valeria meses). Webhook `/api/webhooks/payments` confere o header `asaas-access-token` em tempo constante (401), ignora eventos que não mudam o pedido, é idempotente (`webhook_events.event_id` = id do evento, `payments.gateway_id`) e sempre consulta o status no provedor. Sem webhook, `GET /api/orders/:id` consulta o Asaas no máximo a cada 15 s por pedido. `applyCharge` em `src/orders/service.ts` é o único lugar que marca pedido como pago (e apaga a outra cobrança aberta do pedido).
- Status do Pix no navegador: Route Handler `/api/pedidos/[publicId]` do Next consultado a cada 3 s.
- Login do painel só com e-mail e senha (2FA removido a pedido do casal); rate limit do Better Auth ligado em todos os ambientes (5 tentativas/min por IP em `/sign-in/email`).
- Sem Docker local: dev usa MariaDB do XAMPP; `docker-compose.yml` é opcional; CI usa MySQL 8.
- Schema compatível com MariaDB 10.4 e MySQL 8: sem `serial`, coluna JSON customizada (parse na leitura), DATETIME(3) em UTC preenchido pelo app, varchar indexado ≤191.
- Projeto em `C:\dev\casamento` (fora do OneDrive).
- Web→API: Server Actions enviam `X-Web-Key` em não-GET `/api/*`; `/api/webhooks/*` e `/api/auth/*` são isentos. URL e chave da API nunca vão ao bundle do cliente.
- Design "Álbum" (Proposta C): papel + tinta marinho, polaroids, cartões de fio duplo; tokens em `globals.css`, peças em `src/app/album.css`; revelações por `animation-timeline: view()` (sem JS), menu fixo de 72px com a data entrando ao rolar (IntersectionObserver).
- Next 16: `cacheComponents: true` (dados de runtime sob Suspense ou em cache); Tailwind v4 via `@tailwindcss/turbopack` (sem postcss config); ESLint flat com `eslint` puro; `typecheck` = `next typegen && tsc --noEmit`.

## Fases

- Fases 0 a 3: concluídas. Fase 4 (presentes e pagamento): concluída; Asaas implementado e testado com respostas gravadas, falta teste real no sandbox.
- Fase 5 (painel): concluída, aguardando revisão. Dashboard, convites (link, WhatsApp, respostas, CSV), presentes (CRUD, foto, ordem), pedidos (reembolso, conciliação), recados, configurações, trocar senha. E2E: `pnpm --filter @casamento/web exec playwright test --project=painel` (usa `ADMIN_EMAIL_1`/`ADMIN_PASSWORD_INICIAL` ou `E2E_ADMIN_*`; `PAINEL_URL` para outra porta).
- Próxima: Fase 6 (extras).

## Pendências

- O CI nunca rodou no GitHub (ainda sem remote).
- `gsap` e `@gsap/react` ficaram sem uso depois do design "Álbum" (Lenis roda sozinho): remover com o ok do usuário.
- Asaas real sem teste em sandbox (a chave no `.env` é de produção): com uma chave `$aact_hmlg_`, validar Pix, fatura do cartão e webhook antes de publicar.
- Conciliação diária e reembolso pelo painel: prontos sobre a interface (`getCharge`/`refund`); validar com o Asaas no sandbox.
- Fase 5 fora do escopo entregue: importar convidados de CSV/XLSX e QR dos convites em lote (PDF) — PROMPT §8/§10.
- Login no painel: 5 tentativas/min por IP; e2e + screenshots seguidos podem esbarrar no limite (reinicie a API de teste).
- CSP (PROMPT §9): Fase 7. Sem SDK de pagamento no front (o cartão é na página do Asaas); o QR é data URI (`img-src data:`).
- E2E: o `next dev` não sobe duas vezes na mesma pasta; com o servidor do usuário na 3000, rode `E2E_PORT=3000 pnpm --filter @casamento/web test:e2e`.
