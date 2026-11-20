# Status da plataforma (atualizado em 20/11/2026)

## Feito (branch `saas`)

- Fase 1 multi-evento: concluída (ver `fase-1.md`).
- Fase 3 (painel da organização): **fundação feita** (`fase-3.md`): migration 0009 (`team_invites`, aplicada no `casamento`; dump antes em scratchpad `casamento-antes-0009.sql`), contratos em `packages/shared` (`org`, `org-events`, `team`, `permissions`), `requireOrgAccess`/`requireOrgPermission`/`requireOrgEvent`, `/me` com organizações, rotas `/api/admin/orgs/:orgId/*` e `/api/team-invites/*` como stubs, serviço `createEventRecord` compartilhado com a CLI, auditor com `organization_id`, painel com `#/o/:orgId` e `#/aceitar/<token>` reservados.
- Fase 2 (conteúdo, temas e vocabulário): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-2.md` §6). O casamento vem do banco (`content:import-legacy` já rodou no `casamento`; dump antes em scratchpad `casamento-antes-import-legado.sql`) e ficou igual ao `v1-casamento` nos screenshots.

## Próximos passos, em ordem

1. ~~**Merge do `origin/main` na `saas`**~~ — **feito** (merge commit "merge: traz o deploy do main para a plataforma"): Docker/edge/`DEPLOY.md` na plataforma; `/api/health` do Next fora do `proxy.ts`; `setup` de produção também garante evento 1, vínculos e o host de `SITE_URL` em `event_domains`; seção "Plataforma multi-evento" em `docs/DEPLOY.md` (migrations 0006+ com backup, `setup` depois do `migrate`, CLI no container, on-demand TLS como próxima etapa). `docker build` não foi rodado (sem Docker na máquina de dev).
2. ~~**Frentes A–D da Fase 2 em paralelo**~~ — **feito** (`fase-2.md`, regras em `AGENTES.md`). O isolamento automático de worktree do Claude Code falhou neste Windows (criou a partir do `main` e recusou o caminho): criar os worktrees à mão a partir da `saas`, fora do repositório (ex.: `git worktree add C:\dev\casamento-wt\f2a -b saas-f2a saas`), e passar o caminho a cada agente.
3. ~~Integração da Fase 2~~ — **feito** (merges, conteúdo fixo apagado, legado importado, e2e e screenshots; frentes limpas).
4. **Fase 3** (painel da organização): fundação feita. **Próximo: frentes A–D em paralelo** (`fase-3.md` §4; branches `saas-f3a`…`saas-f3d`, worktrees à mão a partir da `saas`, bancos `casamento_f3a`…), depois a integração.
5. Fases 4 a 7, no mesmo fluxo (fundação → frentes → integração).

## Decisões ainda abertas com o usuário

Papéis de Dani/Gustavo, permissões do anfitrião, Telegram, domínio base (padrões em `AGENTES.md`), as 6 da Fase 3 (`fase-3.md` §5: quem cria evento, quem convida anfitrião, ações configuráveis, validade do convite, evento nasce rascunho, apagar evento) e as 5 da Fase 2 (`fase-2.md` §5: vocabulário por tipo, paletas/fontes dos temas novos, lados padrão, quem pode mudar tipo/módulos, fotos do casamento versionadas em `packages/db/legacy`).
