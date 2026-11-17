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
- `apps/api/` API Hono (`src/app.ts`, `auth.ts`, `env.ts`, `middleware/`) e painel (`painel/`).
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
- Painel próprio em React+Vite servido em `/painel`; em dev: `vite build --watch` + `node --watch`, sem HMR (atualizar a página).
- Pagamentos atrás da interface `PaymentProvider` (`apps/api/src/payments/`): `simulado` (padrão sem credenciais; Pix fictício, cartões 4111…1111 aprova / 4000…0002 recusa, botão "Simular pagamento aprovado" que chama `POST /api/dev/orders/:id/approve`, só fora de produção, e entrega um webhook assinado à rota real) e `mercadopago` (Checkout Transparente via **Orders API** `/v1/orders` com `fetch`, sem o SDK de Node; SDK JS v2 carregado de sdk.mercadopago.com só para tokenizar o cartão). `PAYMENT_PROVIDER`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` no `.env`; passo a passo em `docs/PERSONALIZAR.md` §6.
- Pedidos: `gifts.quota_sold` conta vendidas + reservadas; reserva com `SELECT … FOR UPDATE` na transação; pendente segura 30 min; rotina de expiração a cada 5 min dentro do processo da API (`src/jobs.ts`, `setInterval`), que antes confere no provedor se o Pix não foi pago. Webhook `/api/webhooks/payments` valida `x-signature` (401), é idempotente (`webhook_events.event_id`, `payments.gateway_id`) e processa na própria requisição. `applyCharge` em `src/orders/service.ts` é o único lugar que marca pedido como pago.
- Status do Pix no navegador: Route Handler `/api/pedidos/[publicId]` do Next consultado a cada 3 s.
- Login do painel só com e-mail e senha (2FA removido a pedido do casal); rate limit do Better Auth ligado em todos os ambientes (5 tentativas/min por IP em `/sign-in/email`).
- Sem Docker local: dev usa MariaDB do XAMPP; `docker-compose.yml` é opcional; CI usa MySQL 8.
- Schema compatível com MariaDB 10.4 e MySQL 8: sem `serial`, coluna JSON customizada (parse na leitura), DATETIME(3) em UTC preenchido pelo app, varchar indexado ≤191.
- Projeto em `C:\dev\casamento` (fora do OneDrive).
- Web→API: Server Actions enviam `X-Web-Key` em não-GET `/api/*`; `/api/webhooks/*` e `/api/auth/*` são isentos. URL e chave da API nunca vão ao bundle do cliente.
- Design "Álbum" (Proposta C): papel + tinta marinho, polaroids, cartões de fio duplo; tokens em `globals.css`, peças em `src/app/album.css`; revelações por `animation-timeline: view()` (sem JS), menu fixo de 72px com a data entrando ao rolar (IntersectionObserver).
- Next 16: `cacheComponents: true` (dados de runtime sob Suspense ou em cache); Tailwind v4 via `@tailwindcss/turbopack` (sem postcss config); ESLint flat com `eslint` puro; `typecheck` = `next typegen && tsc --noEmit`.

## Fases

- Fases 0 a 3: concluídas. Fase 4 (presentes e pagamento): concluída no modo simulado, aguardando revisão; Mercado Pago real depende da conta do casal.
- Próxima: Fase 5 (painel).

## Pendências

- O CI nunca rodou no GitHub (ainda sem remote).
- `gsap` e `@gsap/react` ficaram sem uso depois do design "Álbum" (Lenis roda sozinho): remover com o ok do usuário.
- Mercado Pago real sem teste em sandbox (sem conta): validar Pix, cartão e webhook com as credenciais de teste antes de publicar.
- Conciliação diária com o Mercado Pago (PROMPT §6) e botão de reembolso: Fase 5 (o `refund` já existe no provedor).
- CSP compatível com o SDK do Mercado Pago (PROMPT §9): Fase 7.
- E2E: o `next dev` não sobe duas vezes na mesma pasta; com o servidor do usuário na 3000, rode `E2E_PORT=3000 pnpm --filter @casamento/web test:e2e`.
