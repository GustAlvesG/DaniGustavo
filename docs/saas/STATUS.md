# Status da plataforma (atualizado em 21/11/2026)

## Feito (branch `saas`)

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
7. **Próximo: Fase 6** (comercial: cadastro self-service, planos com a taxa da plataforma, assinatura via Asaas, LGPD), no mesmo fluxo; depois a Fase 7.

## Decisões ainda abertas com o usuário

Papéis de Dani/Gustavo, permissões do anfitrião, Telegram, domínio base (padrões em `AGENTES.md`), as 6 da Fase 3 (`fase-3.md` §5: quem cria evento, quem convida anfitrião, ações configuráveis, validade do convite, evento nasce rascunho, apagar evento) as 6 da Fase 4 (`fase-4.md` §5: anfitrião no financeiro/contratos, anfitrião no catálogo, categorias, lembretes de tarefa, modelos prontos, reabrir orçamento contratado), as 7 da Fase 5 (`fase-5.md` §5: percentual da plataforma, evento sem conta aprovada, eventos existentes na conta principal, quem cadastra a conta da org, conta própria do anfitrião opt-in, taxa do Asaas sobre o líquido, liberar split/subcontas no Asaas) e as 5 da Fase 2 (`fase-2.md` §5: vocabulário por tipo, paletas/fontes dos temas novos, lados padrão, quem pode mudar tipo/módulos, fotos do casamento versionadas em `packages/db/legacy`).
