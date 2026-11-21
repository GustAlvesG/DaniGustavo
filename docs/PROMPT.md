---

## 1. Seu papel e regras de trabalho

Você é o desenvolvedor principal **e** o designer deste projeto. Vai construir o site do casamento de Dani & Gustavo: informações do evento, confirmação de presença (RSVP), lista de presentes com pagamento online e um painel para os noivos.

**Design e animações são a parte mais importante do trabalho.** Um site que funciona mas tem cara de template não atende ao pedido. Trate a seção 4 como requisito, não como sugestão.

Regras:

1. Trabalhe **uma fase por vez** (seção 10). Comece cada fase em modo de planejamento, mostre o plano, implemente, rode as verificações e **pare para revisão**.
2. Antes de usar uma biblioteca, leia a documentação da versão instalada. Next.js, Motion, GSAP, Filament e Mercado Pago mudaram bastante recentemente; não confie em APIs de memória.
3. Não adicione dependências fora da seção 3 sem perguntar.
4. Commits pequenos em Conventional Commits. Nunca commite segredos: mantenha um `.env.example` com as chaves vazias.
5. Ao fim de toda fase com interface, capture screenshots com Playwright em **390×844** e **1440×900**, critique o resultado contra a seção 4 e corrija antes de encerrar. Para animações, grave vídeo curto (`recordVideo`) e revise.
6. Conteúdo real ainda não existe: use os placeholders da seção 2 e marque com `TODO(conteudo)`.
7. Na Fase 0, crie um `CLAUDE.md` na raiz com comandos, convenções e as decisões deste prompt. Mantenha-o atualizado.
8. O Gustavo é desenvolvedor Laravel experiente e mais novo em Next.js: explique em uma linha as decisões de Next.js que não forem óbvias.

---

## 2. Contexto e conteúdo

- **Casal:** Dani & Gustavo. Monograma: **D & G**.
- **Idioma:** pt-BR. Moeda BRL. Fuso `America/Sao_Paulo`.
- **Público:** convidados de todas as idades, abrindo no **celular**, pelo link do WhatsApp. Mobile-first sempre. A prévia do link no WhatsApp (Open Graph) é a primeira impressão do site.
- **Data, horários e locais:** ainda não definidos. Ficam em `settings`, editáveis no painel, com placeholders:
  - data/hora: `2027-05-15T16:00:00-03:00` → `TODO(conteudo)`
  - cerimônia e recepção: "Local a definir", endereço e coordenadas vazios
- **Fotos:** ainda não existem. Gere placeholders próprios (fundo névoa com padrão de azulejo) em `public/placeholder/`. **Nunca** use fotos de banco de imagens.
- **Texto (copy):** tom do casal: direto, caloroso, sem clichês ("o dia mais feliz das nossas vidas"). Frases curtas, sentence case, verbos claros. A ação mantém o nome do botão ao aviso: "Confirmar presença" → "Presença confirmada"; "Presentear" → "Presente enviado". Erros dizem o que houve e como resolver, sem pedir desculpas.

---

## 3. Stack e arquitetura

### Estrutura (monorepo)

```
casamento/
├─ apps/
│  ├─ web/            # Next.js — site público
│  └─ api/            # Laravel — API REST + painel Filament
├─ docs/PROMPT.md
├─ docker-compose.yml # MySQL 8 + Mailpit (desenvolvimento)
├─ CLAUDE.md
└─ .github/workflows/ci.yml
```

### apps/web — frontend

| Item | Escolha |
| --- | --- |
| Framework | **Next.js 16** (App Router, TypeScript estrito, Turbopack), React 19. Server Components por padrão; `"use client"` só onde há interação ou animação |
| Estilo | **Tailwind CSS v4**, tokens em CSS com `@theme` |
| Animação de interface | **Motion** (pacote `motion`, import de `motion/react`): transições de estado, gestos, layout, `AnimatePresence` |
| Animação de cena e scroll | **GSAP** + `@gsap/react` (`useGSAP`): abertura e "Nossa história". ScrollTrigger, SplitText e DrawSVG são gratuitos hoje |
| Scroll suave | `lenis`, **somente desktop**, integrado ao ScrollTrigger |
| Fontes e imagens | `next/font/google`, `next/image` |
| Formulários | `react-hook-form` + `zod` |
| Cartão | SDK JS oficial do Mercado Pago, só para tokenizar o cartão no navegador |
| Testes | Vitest (utilitários) e Playwright (e2e + screenshots) |
| Qualidade | ESLint, Prettier, `tsc --noEmit`. Gerenciador: **pnpm** |

### apps/api — backend e painel

| Item | Escolha |
| --- | --- |
| Framework | **Laravel 13** (PHP 8.3+) |
| Banco | MySQL 8 (MariaDB aceito) |
| Painel | **Filament 5** em `/painel` |
| Filas e rotinas | Fila `database`; Scheduler para expiração de pedidos, lembretes e conciliação |
| Pagamento | SDK oficial `mercadopago/dx-php` |
| E-mail | Mailpit em dev; serviço transacional em produção |
| Avisos aos noivos | E-mail (o Telegram foi removido na Fase 6 da plataforma) |
| Testes | Pest |

### Comunicação web ↔ api

- **Leituras públicas** (conteúdo, presentes): Server Components fazem `fetch` em `API_URL` com `revalidate: 60` e tags de cache.
- **Escritas** (RSVP, pedidos, recados): **Server Actions** chamam a API servidor-a-servidor com o header `X-Web-Key` (segredo compartilhado). A API recusa escritas sem essa chave, exceto o webhook.
- **Status do pagamento:** o cliente consulta um Route Handler do Next a cada 3 s enquanto a tela do Pix estiver aberta.
- A URL e a chave da API **nunca** vão para o bundle do cliente.

---

## 4. Direção de design (requisito principal)

### 4.1 Conceito: "Azulejo"

Azul e branco são as cores do casal. O site trata essa dupla como no **azulejo português**: tinta cobalto sobre esmalte branco, pintada à mão. O elemento memorável é **um sistema de azulejos** criado para o casal: ladrilhos quadrados com desenhos de linha que se montam, viram e se desenham. Todo o resto fica calmo e disciplinado: muito branco, tipografia grande, quase nenhuma decoração.

### 4.2 Paleta

| Token | Hex | Uso |
| --- | --- | --- |
| `--color-tinta` | `#0E1F4D` | Texto principal e títulos (no lugar do preto) |
| `--color-cobalto` | `#1F3FAE` | Cor da marca: azulejos, botões, links, foco |
| `--color-anil` | `#4C6FD8` | Traços secundários e hover. **Não** usar em texto menor que 24 px |
| `--color-nevoa` | `#E6EDFA` | Fundos de destaque, placeholders, skeletons |
| `--color-esmalte` | `#FBFCFF` | Fundo da página (branco frio, nunca creme) |
| `--color-branco` | `#FFFFFF` | Superfícies e texto sobre cobalto |
| `--color-erro` | `#B3261E` | Somente mensagens de erro |

Contraste conferido: tinta/esmalte 15,5:1; cobalto/esmalte 8,6:1; branco/cobalto 8,8:1; anil/esmalte 4,5:1 (por isso só em texto grande ou elementos não textuais).

Sem degradês decorativos e sem sombra cinza genérica. A profundidade vem de camadas (névoa sob branco) e de linhas finas em cobalto.

### 4.3 Tipografia

- **Display: Bodoni Moda** (variável, eixo `opsz`). Para os nomes, títulos e números grandes (data, contagem). A tipografia é elemento gráfico: no hero, "Dani" e "& Gustavo" em tamanho de cartaz (`clamp` até ~18vw no celular), entrelinha 0,9, tracking levemente negativo.
- **Texto e interface: Figtree** (400, 500, 600). Corpo 17–18 px no celular, entrelinha 1,6, linhas de até 66 caracteres.
- Escala modular 1,25 para texto; saltos maiores só no display.
- `tabular-nums` na contagem regressiva e em valores.

### 4.4 Layout

- Mobile-first: coluna única, margens de 24 px. A partir de 1024 px, grade de 12 colunas com composição assimétrica (texto em 5–6 colunas; azulejos ou foto no restante).
- Texto corrido alinhado à esquerda. Centralizado só no hero e no monograma.
- Seções separadas por **faixas de azulejo** (uma fileira de ladrilhos), não por cards ou linhas cinza.

Hero no celular:

```
┌────────────────────────────┐
│ ▦ ▦ ▦ ▦ ▦  faixa de azulejo│
│                            │
│ Dani                       │
│ & Gustavo      ← Bodoni    │
│                  gigante   │
│ 15 de maio de 2027         │
│ Local a definir            │
│                            │
│ [ Confirmar presença ]     │
│ [ Ver lista de presentes ] │
│                            │
│ faltam 180 dias 4 h 12 min │
└────────────────────────────┘
```

### 4.5 O sistema de azulejos

- Componente `<Tile design="..." rotate={0|90|180|270} />` em SVG 1:1: traço cobalto sobre esmalte.
- Crie **6 a 8 desenhos originais** (ex.: monograma D&G, ramo, flor de quatro pétalas, onda, estrela de oito pontas, canto de moldura). Estilo de pintura à mão: traço com espessura levemente variável, mas vetor limpo e leve.
- `<TileBand>` (faixa) e `<TileGrid>` (grade) combinam rotações de 90° de um mesmo desenho, como no azulejo de verdade.
- Não copie azulejos históricos específicos nem padrões de marcas: os desenhos são próprios.
- Os paths precisam permitir animação de traço (`stroke-dasharray`/DrawSVG).

### 4.6 Movimento

**Princípio:** um grande momento orquestrado, uma narrativa de scroll e, no resto, movimento que **responde ao toque** e mostra o que mudou. **Não** anime a entrada de cada seção com fade-and-slide-up: é o que deixa um site com cara de gerado.

1. **Abertura (a assinatura do site)** — primeira visita da sessão:
   - Uma grade de azulejos cobre a tela; os ladrilhos viram em onda a partir do centro (`rotateY`, stagger pela distância ao centro).
   - Ao virar, formam o monograma **D & G**, que se desenha em linha cobalto (DrawSVG).
   - A grade se abre como duas folhas de porta e revela o hero; "Dani" e "& Gustavo" sobem por máscara, letra a letra (SplitText).
   - Duração total ≤ 3,2 s. Toque, clique ou tecla pula. `sessionStorage` evita repetir.
   - O hero já está renderizado por baixo: a abertura **não pode atrasar o LCP**.
2. **Nossa história** — no desktop, seção fixada (pin) com rolagem horizontal entre momentos do casal; uma única linha de tinta cobalto se desenha ligando os momentos conforme o scroll (`scrub`). No celular, versão vertical: a mesma linha desce pela coluna.
3. **Faixas de azulejo** — os ladrilhos viram um a um quando a faixa entra na tela, uma vez só. É a única animação de entrada permitida fora da abertura.
4. **Respostas ao usuário:**
   - **Presente:** o azulejo do presente vira (flip 3D) e mostra detalhes e o botão "Presentear". O seletor de cotas tem número que rola.
   - **RSVP:** etapas com transição horizontal (`AnimatePresence`, direção conforme avança ou volta). Ao confirmar, um check se desenha e cada nome confirmado ganha um pequeno azulejo.
   - **Pix aguardando:** o QR fica numa moldura de azulejo com um brilho de esmalte passando devagar. Ao aprovar, a moldura se completa e cai uma chuva curta de mini-azulejos azuis e brancos (≤ 1,5 s).
   - **Botões:** pressão (`scale: 0.97`) e foco visível. Sem efeito magnético.
   - **Contagem regressiva:** dias, horas e minutos; o dígito rola quando muda. Sem segundos.
   - **Entre páginas:** View Transitions com o monograma como elemento compartilhado, **se** a versão instalada de React/Next suportar de forma estável; senão, crossfade simples.
5. **Curvas e tempos (tokens):**
   - `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`; `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`
   - 160 ms (micro), 320 ms (componentes), 600–900 ms (cenas). Springs do Motion com `bounce` ≤ 0.2.
6. **Regras técnicas:**
   - Animar só `transform`, `opacity`, `clip-path` e traço de SVG. `will-change` só durante a animação.
   - GSAP carregado sob demanda nas seções que o usam (fora do bundle inicial da home).
   - Limpeza com `useGSAP`/`gsap.context` para não vazar ScrollTriggers entre rotas.
   - 60 fps num Android intermediário (teste com CPU 4× mais lenta no DevTools).
7. **Movimento reduzido** (`prefers-reduced-motion: reduce`): abertura vira fade de 200 ms; história fica vertical e sem pin; flips viram crossfade; sem chuva de azulejos; Lenis desligado.

### 4.7 Anti-padrões (não fazer)

- Rótulo em caixa alta com espaçamento largo acima de cada título.
- Destacar uma palavra do título em itálico ou outra cor.
- Cards idênticos com sombra cinza e o mesmo raio em tudo.
- Degradês decorativos, glassmorphism, fundo creme.
- "→" no fim de botões e links; metadados separados por "·".
- Numeração 01 / 02 / 03 em conteúdo que não é sequência.
- Fade-and-slide-up em todas as seções.
- Fotos de banco de imagens; emoji como ícone.

### 4.8 Piso de qualidade

- WCAG 2.2 AA. Foco visível em cobalto (outline 2 px + offset). Alvos de toque ≥ 44 px.
- Mobile: LCP < 2,5 s em 4G, CLS < 0,1, INP < 200 ms. Lighthouse ≥ 90 em Performance e 100 em Acessibilidade.
- Página `/dev/design` (só em desenvolvimento) com tokens, tipografia, todos os azulejos, componentes e cada animação com botão de replay, para revisão.

---

## 5. Páginas e rotas (web)

| Rota | Conteúdo |
| --- | --- |
| `/` | Abertura e hero; Nossa história; O casamento (cerimônia e recepção, mapa, botões Google Maps e Waze); Programação; Dress code; Hospedagem e como chegar; Dúvidas; rodapé com contato |
| `/presentes` | Grade de azulejos-presente; filtro por categoria e faixa de preço; item "Contribuição livre" |
| `/presentes/pagamento/[publicId]` | Pix (QR, copia e cola, status ao vivo) ou cartão (campos tokenizados) |
| `/presentes/obrigado/[publicId]` | Confirmação com a mensagem enviada |
| `/c/[token]` | RSVP do convite |
| `/confirmar` | Busca do convite por nome e sobrenome |
| `/recados` | Mural de recados aprovados e formulário |
| `/padrinhos` | Manual dos padrinhos: traje, horários, paleta |
| `/galeria` | Fotos (pré-wedding agora; oficiais depois) |

- Open Graph: imagem gerada com `opengraph-image.tsx` (monograma, nomes, data) pensada para a prévia do WhatsApp.
- `noindex` em `/c/*`, `/confirmar` e `/presentes/pagamento/*`.
- "Adicionar à agenda": arquivo `.ics` e link do Google Agenda.

---

## 6. API e dados (api)

### Endpoints

| Método | Endpoint | Descrição |
| --- | --- | --- |
| GET | `/api/site` | Conteúdo e configurações públicas |
| GET | `/api/gifts` | Presentes com cotas restantes |
| POST | `/api/orders` | Cria pedido e cobrança (`pix` ou `card`) |
| GET | `/api/orders/{publicId}` | Status: `pending`, `paid`, `expired`, `failed`, `refunded` |
| POST | `/api/webhooks/mercadopago` | Webhook com validação de assinatura |
| GET | `/api/invitations/{token}` | Convite e convidados |
| PUT | `/api/invitations/{token}/rsvp` | Salva a resposta |
| POST | `/api/invitations/lookup` | Busca por nome (throttle 5/min por IP) |
| GET, POST | `/api/messages` | Mural de recados |

### Tabelas

| Tabela | Campos principais |
| --- | --- |
| `invitations` | id, token, label, max_guests, side (`dani`/`gustavo`), allow_plus_one, sent_at |
| `guests` | id, invitation_id, name, is_child, age_range, rsvp_status, dietary_notes, phone, email |
| `rsvp_logs` | invitation_id, payload (json), ip, created_at |
| `gifts` | id, slug, title, description, image, price_cents, quota_total, quota_sold, category, tile_design, active, sort |
| `gift_orders` | id, public_id, gift_id, quantity, amount_cents, fee_cents, fee_covered, buyer_name, buyer_email, message, show_on_wall, status, expires_at, paid_at |
| `payments` | order_id, gateway, gateway_id (único), method, gross_cents, fee_cents, net_cents, raw (json) |
| `webhook_events` | gateway, event_id (único), payload (json), processed_at |
| `messages` | author, body, approved |
| `settings` | key, value (json) |

### Regras

- `token` e `public_id` aleatórios (ULID ou similar), nunca IDs sequenciais.
- Valores sempre em **centavos** (inteiros).
- Pedido pendente reserva as cotas por 30 min (o Pix expira junto). Job a cada 5 min expira pendentes e devolve as cotas. Use transação + `lockForUpdate` para nunca vender além de `quota_total`.
- Webhook: responder 200 rápido e processar em job; idempotente por `webhook_events.event_id` e `payments.gateway_id`.
- Pagamento aprovado: pedido `paid`, baixa de cota, e-mail de agradecimento ao convidado, aviso por e-mail aos noivos.
- Conciliação diária: consultar no Mercado Pago os pedidos pendentes e recentes e corrigir divergências.
- RSVP: só altera até o prazo em `settings`; depois disso, a API recusa e o front mostra o contato dos noivos.

---

## 7. Pagamentos (Mercado Pago)

- **Antes de codar**, leia a documentação atual do Checkout API do Mercado Pago Brasil (Pix, cartão, notificações e validação de assinatura) e use a API que a documentação indicar como atual para novas integrações. Os tópicos de webhook dependem dela (`order` ou `payment`).
- **Pix:** cobrança criada na API com expiração de 30 min; devolver ao front o código copia e cola e a imagem do QR. Pix aparece primeiro e já selecionado.
- **Cartão:** tokenizado no navegador com o SDK oficial (campos seguros). O número do cartão nunca passa pelo nosso servidor. Parcelamento até 12x com juros pagos pelo convidado. Campos estilizados com os tokens da seção 4.
- **"Quero cobrir a taxa":** caixa que soma a tarifa ao valor; o percentual fica em `settings`.
- **Webhook:** validar o header `x-signature` com o validador do SDK oficial e o segredo configurado no painel do Mercado Pago; responder 401 se inválido.
- **Testes:** credenciais e usuários de teste do Mercado Pago; e2e dos fluxos Pix e cartão em sandbox.

---

## 8. Painel dos noivos (Filament)

- Login só para dois usuários (seeder com e-mails do `.env`), com e-mail e senha (2FA removido por decisão do casal).
- **Dashboard:** confirmados, pendentes e recusados; adultos e crianças por faixa; total arrecadado bruto e líquido; últimos presentes com mensagem.
- **Recursos:** Convites (com convidados), Presentes, Pedidos (somente leitura + reembolso), Recados (aprovar), Configurações (textos, datas, locais, prazo do RSVP, taxa).
- **Ações:** importar convidados (CSV/XLSX); gerar QR dos convites em lote (PDF para impressão); botão "Enviar no WhatsApp" (link `wa.me` com mensagem e link do convite); exportar listas para buffet, cerimonial e portaria, com restrições alimentares.
- Tema do Filament com primária cobalto e fonte Figtree.

---

## 9. Segurança e LGPD

- Coletar só o necessário: nome, contato, presença, restrições alimentares.
- Alergia é dado de saúde (sensível): campo opcional, com aviso de uso apenas pelo buffet.
- Aviso de privacidade curto nos formulários; comando `php artisan casamento:purge` para apagar dados de convidados após o evento.
- Rate limit em RSVP, busca e recados; honeypot nos formulários públicos.
- Headers de segurança (CSP compatível com o SDK do Mercado Pago), HTTPS, cookies `secure`.
- Backup diário do banco fora do servidor.

---

## 10. Fases e critérios de aceite

Ao terminar cada fase: rode lint, typecheck, testes e build; revise os screenshots; atualize o `CLAUDE.md`; e entregue um resumo curto com **o que foi feito, como testar, decisões tomadas e pendências**.

### Fase 0 — Fundação
- Monorepo, `docker-compose.yml`, apps criados, CI (lint, typecheck, testes) no GitHub Actions, `.env.example`, `CLAUDE.md`.
- Migrations e seeders com dados fictícios: 3 convites, 8 presentes, configurações placeholder.
- **Aceite:** `docker compose up`, `pnpm dev` e `php artisan serve` sobem; `/painel` abre com login; CI verde.

### Fase 1 — Design system e abertura ⟵ **parar para revisão de design**
- Tokens, fontes, escala tipográfica, os 6–8 azulejos, `TileBand`, `TileGrid`, botões, campos, `/dev/design`.
- Abertura e hero completos, inclusive a versão de movimento reduzido.
- **Aceite:** screenshots 390 e 1440 + vídeo da abertura; nenhum anti-padrão da seção 4.7; 60 fps com CPU 4× mais lenta.

### Fase 2 — Páginas de informação
- Todas as seções de `/` (incluindo "Nossa história" com scroll), `/padrinhos`, `/galeria`, Open Graph, "Adicionar à agenda".
- **Aceite:** conteúdo vindo de `/api/site`; Lighthouse mobile dentro do piso da seção 4.8.

### Fase 3 — Confirmação de presença
- `/c/[token]`, `/confirmar`, endpoints e regras de RSVP, e-mail de confirmação.
- **Aceite:** e2e de confirmar, alterar e recusar; busca por nome mostra só o próprio grupo; prazo respeitado.

### Fase 4 — Presentes e pagamento
- `/presentes`, fluxo de pedido, Pix e cartão em sandbox, webhook, expiração, avisos por e-mail.
- **Aceite:** e2e Pix e cartão aprovados em sandbox; webhook com assinatura inválida recebe 401; duas compras simultâneas da última cota → só uma passa.

### Fase 5 — Painel
- Dashboard, recursos, importação, QR em lote, WhatsApp, exportações.
- **Aceite:** importar 50 convidados de um CSV de exemplo e exportar a lista do buffet.

### Fase 6 — Extras
- Mural de recados com moderação, PWA (manifest e ícones com o monograma), lembretes de RSVP por e-mail.
- **Aceite:** recado só aparece após aprovação; PWA instalável no Android.

### Fase 7 — Qualidade e publicação
- e2e completo, auditoria com axe, revisão do movimento reduzido, testes em Safari iOS e Chrome Android.
- Deploy: api numa VPS (Nginx + PHP-FPM, Supervisor para filas, cron para o Scheduler); web na Vercel ou na mesma VPS (`output: 'standalone'`). Cloudflare na frente. Backups configurados.
- **Aceite:** site no ar com HTTPS, pagamento real de R$ 1 em Pix aprovado e estornado pelo painel.
