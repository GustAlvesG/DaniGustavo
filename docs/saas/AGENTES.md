# Regras para agentes (Fases 2–7 da plataforma)

Leia antes de qualquer coisa: `CLAUDE.md`, este arquivo e o `docs/saas/fase-N.md` da fase em curso.

## Fluxo de cada fase

1. **Fundação** (um agente, na branch `saas`): escreve `docs/saas/fase-N.md` (escopo, decisões, frentes de trabalho com arquivos de cada uma), faz schema + migration + contratos zod em `packages/shared` + stubs/rotas vazias que as frentes vão preencher, deixa tudo verde e commita.
2. **Frentes em paralelo** (um agente por frente, cada um num git worktree próprio): só mexem nos arquivos da sua frente; **não criam migrations** (se precisarem de coluna nova, param e reportam); commitam no próprio branch.
3. **Integração** (um agente, na branch `saas`): faz merge dos branches das frentes, resolve conflitos, roda tudo (inclusive e2e e screenshots) e commita.

## Ambiente em worktree (frentes)

- O `.env` não está no git. Copie `C:\dev\casamento\.env` para a raiz do worktree e altere:
  - `DATABASE_URL=mysql://root:@127.0.0.1:3306/casamento_<frente>` (nome exclusivo, minúsculo, ex.: `casamento_f2a`). Os bancos de teste derivam dele (`<nome>_test`, `<nome>_api_test`), então nada colide com outras frentes.
  - `PAYMENT_PROVIDER=simulado` e **apague** `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` (a chave do `.env` raiz é de PRODUÇÃO).
  - Desligue Telegram/SMTP reais (deixe vazios) se existirem.
- `pnpm install` no worktree, depois `pnpm db:reset` (cria e semeia o banco da frente).
- Portas, se precisar subir servidores: frente A web 3101/api 3301, B 3102/3302, C 3103/3303, D 3104/3304 (`E2E_PORT`, `NEXT_DIST_DIR=.next-e2e`, `PORT` da API conforme `apps/api/src/env.ts`). E2E completo e screenshots ficam para a integração; nas frentes rode unitários/integração (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
- Nunca use o banco `casamento` (dev do usuário) nem a porta 3000/3333 em frentes.

## Regras de código

- Tudo do `CLAUDE.md`: pt-BR, Conventional Commits pt-BR com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, centavos, ULID/bigint conforme schema, helpers Drizzle de `@casamento/db`, Server Components por padrão, ler a doc instalada da lib (Next 16!).
- **Sem novas dependências npm.** Se algo parecer exigir uma, implemente sem (fetch, Web APIs, canvas no navegador) ou pare e reporte.
- Isolamento: toda tabela nova de dados de evento tem `event_id` (ou `organization_id` para dados da organização) e o auditor de SQL (`apps/api/test/sql-audit.ts`) deve continuar estrito e verde — se a tabela for por organização, estenda o auditor para `organization_id`.
- Rotas novas do painel por evento sob `/api/admin/events/:eventId/*` com `requireEventAccess` + `requirePermission`; rotas por organização sob `/api/admin/orgs/:orgId/*` (criadas na Fase 3) com o mesmo padrão. O teste que enumera rotas (`admin-isolation.test.ts`) deve cobrir as novas.
- Painel: rotas por hash, visual atual, textos pt-BR. Site: design "Álbum" e temas da Fase 2.
- Pagamentos: nunca chamar o Asaas real; testes com respostas gravadas.
- Não apague dados que você não criou no banco de dev do usuário.
- Antes de aplicar migration no banco `casamento` (só a fundação/integração fazem), dump com `C:\xampp\mysql\bin\mysqldump.exe` em `C:\Users\user\AppData\Local\Temp\claude\710ce89835f369af\543d55e2-0c58-4bf1-b616-59c268d59659\scratchpad\`.

## Relatório final de cada agente

≤350 palavras: branch/worktree e commits, o que foi feito, resultado de lint/typecheck/test (e e2e quando couber), desvios do plano, pendências e qualquer decisão que precise do usuário.

## Decisões padrão adotadas (o usuário pode mudar depois)

- Papéis atuais mantidos (Gustavo platform admin, Dani e Gustavo owners da org 1).
- `event_host` pode tudo no próprio evento; a Fase 3 cria ajuste por evento das permissões do anfitrião (feito pela organização).
- Telegram: canal da plataforma.
- Domínio: `PLATFORM_BASE_DOMAIN` (env) gera `slug.<base>`; domínio próprio por `event_domains`, SSL no proxy reverso (Caddy on-demand TLS consultando `/api/hosts/:host`) — documentado, sem código de infraestrutura.
- Recebedor dos presentes (Fase 5): subconta Asaas da organização por padrão; por evento, pode-se escolher a subconta do anfitrião. Taxa da plataforma via split (percentual por plano).
- Comercial (Fase 6): cadastro self-service cria uma organização (serve para cerimonialista e para casal que se organiza sozinho); planos em banco, preços `TODO(conteudo)`; assinatura via Asaas (fetch).
- Arquivos continuam em disco local atrás de uma interface `Storage` (S3 exige dependência: fica para quando o usuário aprovar). Miniaturas geradas no navegador (canvas) antes do upload.
