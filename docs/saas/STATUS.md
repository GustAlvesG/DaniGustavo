# Status da plataforma (atualizado em 21/11/2026)

## Feito (branch `saas`)

- Fase 6 (comercial, LGPD e endurecimento): **concluída, aguardando revisão** — fundação, frentes A–E e integração (`fase-6.md` §6 e §7). Planos (Cortesia na org 1, `essencial`/`profissional` com preços `TODO(conteudo)`), limites 409 `plan_limit`, assinatura (simulado/Asaas), inadimplência com painel só leitura (exceto reembolso, conciliação e privacidade) e painel da plataforma; cadastro self-service e site da plataforma; domínios (subdomínio automático, domínio próprio por TXT, `ask` do on-demand TLS); LGPD (consentimento, pedidos do titular, anonimização, retenção, apagar evento, exportar/apagar conta); CSP sem nonce, `X-Forwarded-Host` restrito, logs JSON, alertas por e-mail, `/api/health?db=1`, backup com uploads, CI com MySQL 8; Telegram removido; ajustes das Fases 2–5. Nenhuma migration nova (a próxima é a 0013). Screenshots em `.screenshots/saas-fase6/`, e2e em `painel-fase6.spec.ts`.
  - **Retenção do casamento:** o padrão de 365 dias anonimizaria o evento de 10/04/2027 a partir de **09/04/2028**; o usuário decide se muda `retentionDays` ou aceita.

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
8. ~~**Fase 6**~~ — **feito** (fundação, frentes A–E, integração; frentes limpas).
9. **Próximo: Fase 7** (check-in por QR, mapa de mesas, portal do fornecedor, WhatsApp, app do organizador).
10. ~~Limpeza do banco órfão `casamento_mig_…`~~ — feito pelo usuário.

## Decisões ainda abertas com o usuário

As das Fases 1–5 foram respondidas em 21/11/2026 (`AGENTES.md`, "Decisões do usuário"; §5 de cada fase). Em aberto:

- Preços e limites finais dos planos, `PLATFORM_FEE_PERCENT` e textos legais (termos, política, aviso de privacidade): `TODO(conteudo)`.
- `PLATFORM_HOST`, `PLATFORM_BASE_DOMAIN` de produção e o `ask` do on-demand TLS no edge (`DEPLOY.md`).
- Chave sandbox do Asaas (pagamentos, subcontas, split, assinaturas) e liberação de split/subcontas na conta principal.
- Retenção do casamento (acima).
- Acompanhante criado pelo RSVP público deve ou não contar no limite de convidados (hoje não conta).
- CSP do site sem nonce (hoje `'unsafe-inline'`): manter ou reverter.
