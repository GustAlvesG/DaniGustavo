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
  - Desligue o SMTP real (deixe vazio) se existir. O Telegram sai do código na Fase 6.
- `pnpm install` no worktree, depois `pnpm db:reset` (cria e semeia o banco da frente).
- Portas, se precisar subir servidores: frente A web 3101/api 3301, B 3102/3302, C 3103/3303, D 3104/3304, E 3105/3305 (`E2E_PORT`, `NEXT_DIST_DIR=.next-e2e`, `PORT` da API conforme `apps/api/src/env.ts`). E2E completo e screenshots ficam para a integração; nas frentes rode unitários/integração (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
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

## Decisões do usuário (21/11/2026)

- Papéis mantidos (Gustavo platform admin, Dani e Gustavo owners da org 1); `event_host` pode tudo no próprio evento e a organização ajusta por evento.
- Taxa padrão da plataforma: 0,5% sobre o líquido (`PLATFORM_FEE_PERCENT` e plano); na Fase 6 vem do plano da organização.
- Domínio base: definir depois (`PLATFORM_BASE_DOMAIN` vazio por padrão; código pronto na Fase 6); domínio próprio por `event_domains`, SSL no Caddy on-demand consultando `/api/hosts/:host`.
- Planos: estrutura agora, preços `TODO(conteudo)`; org 1 (casamento) no plano interno "Cortesia" (sem limites nem cobrança, taxa 0, continua em `platform`). Cadastro self-service cria uma organização; assinatura via Asaas (fetch).
- `X-Forwarded-Host` no `proxy.ts`: aceito só se o host estiver em `event_domains` (ou for o da plataforma); senão vale o `Host` (Fase 6).
- Telegram desligado: o canal sai do código, env, docs e deploy na Fase 6 (avisos só por e-mail).
- Membro da organização cria eventos e convida anfitriões; só o dono mexe na equipe. Convite vale 7 dias; evento nasce rascunho.
- Apagar evento: o dono apaga um evento arquivado, confirmando com o slug, removendo dados e arquivos (inclusive privados); tratamento de pedidos pagos em `docs/saas/fase-6.md`.
- Recebedor dos presentes (Fase 5): subconta Asaas da organização por padrão; anfitrião opt-in; casamento e anteriores em `platform`; sem conta aprovada, sem presentes em dinheiro.
- Fase 4: anfitrião vê financeiro e contratos, mas não cadastra fornecedor no catálogo; categorias personalizadas por organização; lembrete semanal de tarefas por e-mail; modelos de tarefas da plataforma por tipo de evento; reabrir orçamento contratado sem parcela paga (Fase 6).
- Ajustes da Fase 6: remover `gsap`/`@gsap/react`; tela para `couple.monogram_art` e `calendar.uid`; esconder botões de gravar sem permissão (`useCan`); editar data e fuso pela lista de eventos da organização.
- Arquivos continuam em disco local atrás de uma interface `Storage` (S3 exige dependência: fica para quando o usuário aprovar). Miniaturas geradas no navegador (canvas) antes do upload.

## Decisões do usuário para a Fase 7 (21/11/2026)

- Escopo: check-in por QR, mapa de mesas, portal do fornecedor, WhatsApp e "app" (`docs/saas/fase-7.md`).
- WhatsApp: links prontos (`wa.me`) com modelos por evento (convite, lembrete de RSVP, agradecimento, aviso do dia) e envio em lote assistido pelo WhatsApp do próprio organizador; sem API da Meta e sem custo; "enviado" marcado pelo organizador.
- App do organizador: "site, não app" — nada de app nativo nem PWA instalável; o painel responsivo resolve, com as telas do dia (check-in, cronograma, tarefas, mesas) boas no celular.
- Check-in: portaria por link + PIN, sem conta; a organização gera e revoga; a portaria vê só nome do convite, pessoas e aviso de acesso (sem dado de saúde), lê o QR pela câmera (`BarcodeDetector`; sem ele, digitação/busca; sem dependência nova) e marca chegada, inclusive parcial, com contagem por polling e desfazer. PIN com rate limit e hash; token só em hash; `camera` liberada só na rota da portaria.
- Portal do fornecedor: link mágico por e-mail por fornecedor do evento (token em hash, expira, revogável, uso repetido na validade); vê cronograma do dia e os itens dele, tarefas atribuídas, envia orçamento ("recebido") e documentos (área privada, mesmas regras); não vê convidados nem valores de outros fornecedores.
- Mapa de mesas: lista de mesas (nome, lugares, ordem), distribuição por pessoa respeitando quem confirmou, aviso de lotação, mesa por lado/grupo, impressão por mesa, plaquinhas e lista do cerimonial; mesa aparece no check-in.
- Acompanhantes contam no limite de convidados do plano, mas o RSVP nunca é recusado: passou do limite, e-mail e aviso no painel para a organização.
- Retenção do casamento: manter 365 dias (anonimiza a partir de 09/04/2028); só deixar a data visível na Privacidade do evento.
