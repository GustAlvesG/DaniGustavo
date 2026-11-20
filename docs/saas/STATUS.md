# Status da plataforma (pausado em 20/11/2026)

## Feito (branch `saas`)

- Fase 1 multi-evento: concluída (ver `fase-1.md`).
- Fase 2: **só a fundação** (commits `0c347f5`..`b5f06e5`): migration 0008 (aplicada no banco `casamento`, dump em scratchpad `casamento-antes-0008.sql`), contratos em `packages/shared`, `Storage`, rotas do editor com GET e escrita 501, páginas vazias no painel. Plano e frentes em `fase-2.md`.

## Próximos passos, em ordem

1. ~~**Merge do `origin/main` na `saas`**~~ — **feito** (merge commit "merge: traz o deploy do main para a plataforma"): Docker/edge/`DEPLOY.md` na plataforma; `/api/health` do Next fora do `proxy.ts`; `setup` de produção também garante evento 1, vínculos e o host de `SITE_URL` em `event_domains`; seção "Plataforma multi-evento" em `docs/DEPLOY.md` (migrations 0006+ com backup, `setup` depois do `migrate`, CLI no container, on-demand TLS como próxima etapa). `docker build` não foi rodado (sem Docker na máquina de dev).
2. **Frentes A–D da Fase 2 em paralelo** (`fase-2.md`, regras em `AGENTES.md`). O isolamento automático de worktree do Claude Code falhou neste Windows (criou a partir do `main` e recusou o caminho): criar os worktrees à mão a partir da `saas`, fora do repositório (ex.: `git worktree add C:\dev\casamento-wt\f2a -b saas-f2a saas`), e passar o caminho a cada agente.
3. Integração da Fase 2 (apagar conteúdo fixo, importar o legado no banco `casamento`, e2e, screenshots).
4. Fases 3 a 7, no mesmo fluxo (fundação → frentes → integração).

## Decisões ainda abertas com o usuário

Papéis de Dani/Gustavo, permissões do anfitrião, Telegram, domínio base (padrões em `AGENTES.md`), e as 5 da Fase 2 (`fase-2.md` §5: vocabulário por tipo, paletas/fontes dos temas novos, lados padrão, quem pode mudar tipo/módulos, fotos do casamento versionadas em `packages/db/legacy`).
