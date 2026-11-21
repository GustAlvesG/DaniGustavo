# Status da plataforma (atualizado em 20/11/2026)

## Feito (branch `saas`)

- Fase 4 (gestão do evento): **fundação feita** (`fase-4.md`): schema e migration 0010 (tarefas, modelos, fornecedores, contratos, orçamentos, parcelas, previsto por categoria, cronograma) já aplicada no `casamento` (dump antes em scratchpad `casamento-antes-0010.sql`), contratos zod, permissões novas, área privada do Storage, rotas stub (501) e páginas reservadas do painel. Próximo: frentes A–D (`saas-f4a`…`saas-f4d`) e integração.
- Fase 1 multi-evento: concluída (ver `fase-1.md`).
- Fase 3 (painel da organização): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-3.md` §6). Organização cria evento, monta a equipe, convida anfitriões por e-mail (aceite em `#/aceitar/<token>`) e ajusta as permissões do anfitrião por evento; migration 0009 já estava no `casamento` (nada novo a aplicar na integração).
- Fase 2 (conteúdo, temas e vocabulário): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-2.md` §6). O casamento vem do banco (`content:import-legacy` já rodou no `casamento`; dump antes em scratchpad `casamento-antes-import-legado.sql`) e ficou igual ao `v1-casamento` nos screenshots.

## Próximos passos, em ordem

1. ~~**Merge do `origin/main` na `saas`**~~ — **feito** (merge commit "merge: traz o deploy do main para a plataforma"): Docker/edge/`DEPLOY.md` na plataforma; `/api/health` do Next fora do `proxy.ts`; `setup` de produção também garante evento 1, vínculos e o host de `SITE_URL` em `event_domains`; seção "Plataforma multi-evento" em `docs/DEPLOY.md` (migrations 0006+ com backup, `setup` depois do `migrate`, CLI no container, on-demand TLS como próxima etapa). `docker build` não foi rodado (sem Docker na máquina de dev).
2. ~~**Frentes A–D da Fase 2 em paralelo**~~ — **feito** (`fase-2.md`, regras em `AGENTES.md`). O isolamento automático de worktree do Claude Code falhou neste Windows (criou a partir do `main` e recusou o caminho): criar os worktrees à mão a partir da `saas`, fora do repositório (ex.: `git worktree add C:\dev\casamento-wt\f2a -b saas-f2a saas`), e passar o caminho a cada agente.
3. ~~Integração da Fase 2~~ — **feito** (merges, conteúdo fixo apagado, legado importado, e2e e screenshots; frentes limpas).
4. ~~**Fase 3**~~ — **feito** (fundação, frentes A–D, integração; frentes limpas).
5. **Fase 4** (tarefas, fornecedores e orçamentos): fundação feita; **próximo: frentes A–D em paralelo** (`fase-4.md` §4), depois a integração.
6. Fases 5 a 7, no mesmo fluxo.

## Decisões ainda abertas com o usuário

Papéis de Dani/Gustavo, permissões do anfitrião, Telegram, domínio base (padrões em `AGENTES.md`), as 6 da Fase 3 (`fase-3.md` §5: quem cria evento, quem convida anfitrião, ações configuráveis, validade do convite, evento nasce rascunho, apagar evento) as 6 da Fase 4 (`fase-4.md` §5: anfitrião no financeiro/contratos, anfitrião no catálogo, categorias, lembretes de tarefa, modelos prontos, reabrir orçamento contratado) e as 5 da Fase 2 (`fase-2.md` §5: vocabulário por tipo, paletas/fontes dos temas novos, lados padrão, quem pode mudar tipo/módulos, fotos do casamento versionadas em `packages/db/legacy`).
