# Status da plataforma (atualizado em 21/11/2026)

**Plataforma concluída (Fases 1 a 7), aguardando revisão.**

## Feito (branch `saas`)

- Fase 7 (o dia do evento: check-in, mesas, portal do fornecedor, WhatsApp, painel no celular): **concluída, aguardando revisão** — fundação, frentes A–D e integração (`fase-7.md` §6 e §7). Portaria por link + PIN com QR pela câmera (ou digitação/busca), mapa de mesas com impressão e plaquinhas, portal do fornecedor por link mágico, WhatsApp por `wa.me` com modelos e fila, página Hoje, aviso de limite de convidados por acompanhantes e data de anonimização em destaque. Nenhuma migration nova além da 0013 (já aplicada no `casamento`). Screenshots em `.screenshots/saas-fase7/`, e2e em `painel-fase7.spec.ts`. **Com ela, a plataforma está concluída (Fases 1 a 7).**

- Fase 6 (comercial, LGPD e endurecimento): **concluída, aguardando revisão** — fundação, frentes A–E e integração (`fase-6.md` §6 e §7). Planos (Cortesia na org 1, `essencial`/`profissional` com preços `TODO(conteudo)`), limites 409 `plan_limit`, assinatura (simulado/Asaas), inadimplência com painel só leitura (exceto reembolso, conciliação e privacidade) e painel da plataforma; cadastro self-service e site da plataforma; domínios (subdomínio automático, domínio próprio por TXT, `ask` do on-demand TLS); LGPD (consentimento, pedidos do titular, anonimização, retenção, apagar evento, exportar/apagar conta); CSP sem nonce, `X-Forwarded-Host` restrito, logs JSON, alertas por e-mail, `/api/health?db=1`, backup com uploads, CI com MySQL 8; Telegram removido; ajustes das Fases 2–5. Nenhuma migration nova (a próxima é a 0013). Screenshots em `.screenshots/saas-fase6/`, e2e em `painel-fase6.spec.ts`.
  - **Retenção do casamento:** mantida em 365 dias (decisão de 21/11/2026): anonimiza a partir de **09/04/2028**.

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
9. ~~**Fase 7**~~ — **feito** (fundação, frentes A–D, integração). **Plataforma concluída**: resta a revisão e a lista abaixo.
10. ~~Limpeza do banco órfão `casamento_mig_…`~~ — feito pelo usuário.

## Pendências para produção e revisão

- **Deploy ao lado do casamento** (decisão do usuário): a `saas` sobe como projeto `happy4ever` (`SLUG`/`name`, imagens `happy4ever/*`, serviços `happy4ever-web`/`happy4ever-api`, volumes `happy4ever_*`), hosts `happy4ever.artzan.tech` (`DOMAIN` = `PLATFORM_HOST`) e `happy4ever-api.artzan.tech`, banco vazio com `SETUP_WEDDING=0` (setup só plataforma). O projeto `casamento` (`main`, danigustavo/painel-danigustavo) segue intocado; a migração dele para a plataforma está em `docs/DEPLOY.md` "Depois: trazer o casamento para a plataforma". Falta: registros A na Hostinger, `.env` e `site registrar` na VPS; `docker build` não rodado (sem Docker na máquina de dev).

As decisões das Fases 1–7 foram respondidas em 21/11/2026 (`AGENTES.md`, §5 de cada fase). Falta:

- Revisão do usuário das Fases 1 a 7 (todas "aguardando revisão"); `docker build` nunca rodado (sem Docker na máquina de dev) e CI nunca rodou no GitHub (sem remote).
- `TODO(conteudo)`: preços e limites finais dos planos, `PLATFORM_FEE_PERCENT`, textos legais (termos, política, aviso de privacidade) e textos padrão do WhatsApp.
- `PLATFORM_HOST` definido: `happy4ever.artzan.tech` (API recomendada: `happy4ever-api.artzan.tech`). Pendentes: `PLATFORM_BASE_DOMAIN` (não pode ser `happy4ever.artzan.tech`; ver `DEPLOY.md`) e o `ask` do on-demand TLS no edge (`DEPLOY.md`).
- Asaas: chave sandbox (`$aact_hmlg_`) para validar Pix, cartão, webhooks, conciliação, reembolso, subcontas, split e assinaturas; liberação de split e subcontas na conta principal; `PAYMENT_SECRETS_KEY` obrigatória em produção (rotação fica para depois).
- Fase 7: ferramentas por plano (hoje nenhuma é limitada), validades padrão dos links (portaria 48 h, portal 30 dias) e o cuidado com `Permissions-Policy` no edge (`DEPLOY.md`).
- CSP do site sem nonce (hoje `'unsafe-inline'` em scripts): manter ou reverter.
- Papéis de Dani e Gustavo seguem como estão (`TODO(fase1-papeis)`); retenção do casamento mantida em 365 dias (anonimiza a partir de 09/04/2028).
