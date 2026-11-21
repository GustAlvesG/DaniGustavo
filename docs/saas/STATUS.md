# Status da plataforma (atualizado em 21/11/2026)

## Feito (branch `saas`)

- Fase 6 (comercial, LGPD e endurecimento): **fundação feita** (`fase-6.md`; §6 com os desvios). Migration 0012 aplicada no `casamento` (dump antes em scratchpad `casamento-antes-0012.sql`): planos (org 1 e as demais já existentes no plano interno "Cortesia"; `essencial`/`profissional` com preços `TODO(conteudo)`), assinaturas, uso, cadastro, aceite dos termos, domínios verificados (só verificado resolve), LGPD (consentimento, pedidos dos titulares, anonimização, resumo de evento apagado), categorias de fornecedor por organização, lembrete de tarefas e modelos de tarefas da plataforma. Contratos por frente em `packages/shared` (`plans`, `signup`, `privacy`, `ops`, `adjustments`), ações novas (`privacy.*`, `vendors.catalog`, `billing.manage`, `domains.manage`, `events.delete`, `categories.manage`, `platform.*`), rotas reservadas (501), painel da plataforma restrito ao platform admin (404 para os outros), rotinas ligadas no `server.ts`, variáveis novas nos exemplos/compose, Telegram fora dos exemplos e do compose, `gsap` removido. Decisões do usuário de 21/11/2026 registradas em `AGENTES.md` e nos §5 das fases 1–5.

- Fase 5 (recebimentos: subcontas Asaas e split): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-5.md` §6). Conta de recebimento da organização (só o dono cadastra) e, opt-in, do anfitrião; recebedor por evento; cobrança pela subconta com split da taxa (`PLATFORM_FEE_PERCENT`); situação cadastral por webhook da subconta, botão e rotina de 6 h; sem conta aprovada, "Disponível em breve" no site. Casamento e eventos anteriores seguem em `platform`. Nada novo a aplicar no `casamento` (0011 já estava). Screenshots em `.screenshots/saas-fase5/`, e2e em `painel-fase5.spec.ts`. Falta validar no sandbox do Asaas e pedir a liberação de subcontas/split.

- Fase 4 (gestão do evento): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-4.md` §6). Tarefas e modelos, fornecedores com contratos privados, orçamentos/parcelas/planejado × realizado e cronograma do dia; data do evento nas Configurações recalcula os prazos das tarefas. Nada novo a aplicar no `casamento` (0010 já estava). Screenshots em `.screenshots/saas-fase4/`.
- Fase 1 multi-evento: concluída (ver `fase-1.md`).
- Fase 3 (painel da organização): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-3.md` §6). Organização cria evento, monta a equipe, convida anfitriões por e-mail (aceite em `#/aceitar/<token>`) e ajusta as permissões do anfitrião por evento; migration 0009 já estava no `casamento` (nada novo a aplicar na integração).
- Fase 2 (conteúdo, temas e vocabulário): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-2.md` §6). O casamento vem do banco (`content:import-legacy` já rodou no `casamento`; dump antes em scratchpad `casamento-antes-import-legado.sql`) e ficou igual ao `v1-casamento` nos screenshots.

## Próximos passos, em ordem

1. ~~**Merge do `origin/main` na `saas`**~~ — **feito** (merge commit "merge: traz o deploy do main para a plataforma"): Docker/edge/`DEPLOY.md` na plataforma; `/api/health` do Next fora do `proxy.ts`; `setup` de produção também garante evento 1, vínculos e o host de `SITE_URL` em `event_domains`; seção "Plataforma multi-evento" em `docs/DEPLOY.md` (migrations 0006+ com backup, `setup` depois do `migrate`, CLI no container, on-demand TLS como próxima etapa). `docker build` não foi rodado (sem Docker na máquina de dev).
2. ~~**Frentes A–D da Fase 2 em paralelo**~~ — **feito** (`fase-2.md`, regras em `AGENTES.md`). O isolamento automático de worktree do Claude Code falhou neste Windows (criou a partir do `main` e recusou o caminho): criar os worktrees à mão a partir da `saas`, fora do repositório (ex.: `git worktree add C:\dev\casamento-wt\f2a -b saas-f2a saas`), e passar o caminho a cada agente.
3. ~~Integração da Fase 2~~ — **feito** (merges, conteúdo fixo apagado, legado importado, e2e e screenshots; frentes limpas).
4. ~~**Fase 3**~~ — **feito** (fundação, frentes A–D, integração; frentes limpas).
5. ~~**Fase 4**~~ — **feito** (fundação, frentes A–D, integração; frentes limpas).
6. ~~**Fase 5**~~ — **feito** (fundação, frentes A–D, integração; frentes limpas).
7. ~~Pausa de 21/11/2026~~ — retomado no mesmo dia com as decisões do usuário (`AGENTES.md`).
8. **Fase 6:** fundação **feita**. **Próximo: frentes A–E em paralelo** (`fase-6.md` §4; worktrees à mão em `C:\dev\casamento-wt\f6a` … `f6e`, branches `saas-f6a` … `saas-f6e`), depois a integração. Escopo original:
   - Planos e assinaturas: planos em banco (preços `TODO(conteudo)`), limites por plano, taxa da plataforma por plano; assinatura via Asaas `/v3/subscriptions` (com simulado); teste e inadimplência sem derrubar o site de convidados; org 1 num plano interno "Cortesia" sem limites.
   - Cadastro self-service: landing e preços no host da plataforma; cadastro próprio com verificação de e-mail; termos e privacidade.
   - Domínios: `PLATFORM_BASE_DOMAIN` → `slug.<base>`; domínio próprio verificado por DNS; Caddy on-demand TLS via `/api/hosts/:host`.
   - LGPD: exportação, exclusão/anonimização, consentimento no RSVP e recados, retenção, privacidade por evento.
   - Endurecimento: CSP no site e painel, cabeçalhos; **restringir o `X-Forwarded-Host` aceito pelo `proxy.ts`** (desde a Fase 5; com Cloudflare em `trusted_proxies` um cliente pode forjá-lo); logs e alertas; backup incluindo uploads privados; CI com MySQL 8.
   - Painel do platform admin.
   - Migration 0012: **aplicada** pela fundação. A próxima é a 0013.
9. **Depois: Fase 7** (check-in por QR, mapa de mesas, portal do fornecedor, WhatsApp, app do organizador).
10. ~~Limpeza do banco órfão `casamento_mig_…`~~ — feito pelo usuário.

## Decisões ainda abertas com o usuário

As das Fases 1–5 foram respondidas em 21/11/2026 (`AGENTES.md`, "Decisões do usuário"; §5 de cada fase). Ficam para depois: preços e limites finais dos planos e textos legais (`TODO(conteudo)`), `PLATFORM_BASE_DOMAIN`/`PLATFORM_HOST` de produção, a chave sandbox do Asaas (validar pagamentos, subcontas, split e assinaturas) e a liberação de split/subcontas na conta principal.
