# Como personalizar o site

Guia rápido para trocar textos, fotos, cores e dados do casamento. Rode `pnpm dev` e deixe
http://localhost:3000 aberto: a maioria das mudanças aparece sozinha ao salvar o arquivo.

## 1. Textos e fotos da página inicial

Tudo que é "apresentação" da home fica em **`apps/web/src/content/home.ts`**, com comentários em
cada campo:

| O que                                      | Onde em `home.ts`                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Ordem das seções / esconder uma seção      | `secoes` (mude a ordem ou apague)                                            |
| Foto de fundo do topo (computador/celular) | `hero.fotoDesktop`, `hero.fotoCelular`                                       |
| "Vamos nos casar", título da contagem      | `hero.chamada`, `hero.contador`                                              |
| Nossa história (polaroids)                 | `historia.momentos` (ano, título, texto, foto)                               |
| Galeria "Do nosso álbum"                   | `album.fotos` (foto + legenda)                                               |
| Foto e legenda do casamento                | `casamento.foto`, `casamento.legendaFoto`                                    |
| Versículo sobre a foto                     | `versiculo.linhas`, `versiculo.referencia`                                   |
| Títulos e frases de cada seção             | `rotulo`, `titulo`, `lead` de cada seção                                     |
| Presentes (texto, botões)                  | `presentes` (com `botoes: []` aparece o aviso; a lista em si está no item 5) |
| Cartão-resposta (confirmação)              | `rsvp.cartao`                                                                |
| Menu do topo e links do rodapé             | `menu`, `rodape`                                                             |

Convenções:

- Palavra entre `*asteriscos*` num título sai em itálico azul: `"Do nosso *álbum*"`.
- `{prazo}` no texto da confirmação vira a data limite que está no banco.
- Item do menu: a seção aparece no menu se tiver `menu: "Texto"`.

Outras páginas:

- **`apps/web/src/content/galeria.ts`**: fotos da página `/galeria` (ordem = ordem na página).
- **`apps/web/src/content/paginas.ts`**: foto da capa de `/padrinhos` e da página 404.

## 2. Fotos

1. Coloque o arquivo em **`apps/web/public/fotos/`** (nome sem espaços, em minúsculas, ex.:
   `praia-2024.jpg`).
2. No `home.ts` (ou `galeria.ts`), escreva só o nome: `arquivo: "praia-2024.jpg"`, e uma
   descrição curta em `alt` (para leitor de tela).
3. Se um rosto ficar cortado, ajuste `posicao` (é o `object-position` do CSS):
   `"center 30%"` mostra mais o alto da foto; `"40% center"` puxa para a esquerda.

Formato e tamanho: **JPEG**, lado maior com **2000 a 2400 px**, qualidade ~80 (até ~800 KB).
PNG e WebP também funcionam. Não precisa gerar versões menores: o Next (`next/image`) cria as
versões em WebP/AVIF no tamanho de cada tela. A largura e a altura são lidas do próprio arquivo.

- Topo no computador: foto **deitada** (paisagem). Topo no celular: foto **em pé** (retrato),
  com o casal no meio ou na metade de cima (a contagem cobre o rodapé da foto).
- Polaroids da história recortam em 4:5 (retrato); o álbum e a galeria mostram a foto inteira.

> As fotos do casal ficam versionadas no repositório (é privado). Antes de publicar o
> repositório em algum lugar aberto, tire-as do git.

## 3. Dados do casamento (vêm do banco)

Data e hora, local e endereço, programação, traje (cores e "evite"), hospedagem, perguntas
frequentes, contato, prazo da confirmação, manual dos padrinhos e textos de SEO ficam na tabela
`settings` do banco e chegam ao site por `GET /api/site`. O site guarda essa resposta em cache
por 60 segundos: depois de mudar, espere um minuto (ou reinicie o `pnpm dev`).

Para editar:

- **Drizzle Studio** (planilha no navegador, sem apagar nada):
  `pnpm --filter @casamento/db exec drizzle-kit studio` → tabela `settings` → coluna `value`
  (JSON). Ex.: `schedule.items`, `dresscode`, `faq.items`, `couple.contact`, `rsvp.deadline`.
- **Seed** (`packages/db/src/seed-data.ts`, lista `seedSettings`): é o ponto de partida do banco.
  O `pnpm db:seed` só cria as chaves que ainda não existem (não sobrescreve). Para aplicar
  mudanças do seed em chaves existentes, use `pnpm db:reset`, que **apaga e recria o banco
  inteiro, inclusive convites e respostas**: só antes de enviar os convites.

O conteúdo de reserva em `apps/web/src/content/site-fallback.ts` só aparece se a API estiver fora
do ar; mantenha-o parecido com o seed.

## 4. Cores e fontes

- **Cores**: `apps/web/src/app/globals.css`, bloco `@theme static` (`--color-papel`,
  `--color-tinta`, `--color-marinho`, `--color-serenity`…). Viram classes do Tailwind
  (`bg-papel`, `text-tinta`) e variáveis CSS. Mudou uma cor, atualize
  `apps/web/src/lib/palette.ts`: `pnpm test` confere o contraste (acessibilidade).
- **Fontes**: `apps/web/src/app/layout.tsx` (Cormorant Garamond no texto, Jost nos rótulos e
  botões, Pinyon Script só nos nomes), ligadas aos tokens `--font-serif`, `--font-sans` e
  `--font-script` em `globals.css`.
- **Peças do álbum** (polaroid, fita, cartão de fio duplo, moldura com cantoneiras, arco,
  animações na rolagem): `apps/web/src/app/album.css`. Layout das seções da home:
  `apps/web/src/components/home/home.module.css`.
- Imagem de prévia do link (WhatsApp): `apps/web/src/app/opengraph-image.tsx` (usa a foto
  `hero.fotoCelular`).

## 5. Lista de presentes

Os presentes ficam na tabela `gifts` do banco e aparecem em `/presentes` (o site guarda a lista
em cache por 30 segundos). Até o painel ganhar a tela de presentes (Fase 5), edite pelo
**Drizzle Studio**: `pnpm --filter @casamento/db exec drizzle-kit studio` → tabela `gifts`.

| Coluna        | O que é                                                               |
| ------------- | --------------------------------------------------------------------- |
| `slug`        | Identificador na URL, sem acento nem espaço (ex.: `jantar-em-lisboa`) |
| `title`       | Nome do presente                                                      |
| `description` | Frase curta abaixo do nome                                            |
| `price_cents` | Preço de **uma cota**, em centavos (R$ 450,00 = `45000`)              |
| `quota_total` | Quantas cotas existem (1 = presente único)                            |
| `quota_sold`  | Cotas vendidas **ou reservadas** por Pix em aberto. Não mexa à mão    |
| `open_amount` | `1` no item de valor livre (o convidado escolhe; mínimo R$ 10,00)     |
| `category`    | Um dos `slug` de `gifts.categories` (filtro da página)                |
| `active`      | `0` esconde o presente sem apagar os pedidos                          |
| `sort`        | Ordem na lista (menor primeiro)                                       |

- **Novo presente**: no Studio, "Add record" com os campos acima (`tile_design` pode ficar
  `flor`; não é mais usado). O desenho do cartão é escolhido pelo nome (jantar, barco, panela,
  café, cama, planta, noite/estrela); sem acerto, aparece um pacote de presente.
- **Não apague** presente que já tem pedido: marque `active = 0`.
- **Categorias**: chave `gifts.categories` em `settings` (lista de `{ slug, label }`).
- **Taxa do cartão** ("Quero cobrir a taxa"): chave `payments.card_fee_percent` em `settings`
  (ex.: `4.98`). Coloque o percentual real do seu plano no Mercado Pago.
- Pedido em aberto segura as cotas por **30 minutos**; depois disso a API expira o pedido
  sozinha (rotina a cada 5 minutos) e devolve as cotas.
- Quando um presente é pago, a API manda o comprovante ao convidado e avisa os noivos por e-mail
  (`ADMIN_EMAIL_1` e `ADMIN_EMAIL_2`) e, se configurado, no Telegram (`TELEGRAM_BOT_TOKEN` e
  `TELEGRAM_CHAT_ID`). O recado, se a pessoa autorizar, entra em `messages` aguardando
  aprovação (a moderação chega com o painel).

## 6. Pagamentos: modo simulado e Mercado Pago

Sem credenciais do Mercado Pago no `.env`, a API usa o **modo simulado**: o Pix mostra um QR
ilustrativo marcado "Simulação" e um código que nenhum banco aceita, e a tela de pagamento tem o
botão **"Simular pagamento aprovado"**, que entrega à API um webhook assinado pelo mesmo caminho
do Mercado Pago. Cartões de teste do simulado: `4111 1111 1111 1111` aprova,
`4000 0000 0000 0002` recusa (qualquer nome, validade futura e CVV). O log da API mostra
`Pagamentos: provedor "simulado"` ao subir.

### Ativar o Mercado Pago de verdade

1. Crie a conta (de preferência como pessoa física no nome de quem vai receber) em
   mercadopago.com.br e entre em **Seu negócio → Configurações → Suas integrações**
   (developers.mercadopago.com.br/panel). Crie uma aplicação do tipo **Checkout Transparente /
   Pagamentos online**.
2. Em **Credenciais de teste**, copie a _Public Key_ e o _Access Token_ (começam com
   `APP_USR-` ou `TEST-`). No `.env` da raiz:
   ```
   PAYMENT_PROVIDER=mercadopago
   MP_ACCESS_TOKEN=APP_USR-...   # nunca no front
   MP_PUBLIC_KEY=APP_USR-...     # vai para o navegador, para tokenizar o cartão
   ```
3. Em **Webhooks → Configurar notificações**, cadastre a URL
   `https://SEU-DOMINIO-DA-API/api/webhooks/payments` e marque o evento **Order (Mercado
   Pago)**. Salve e copie a **assinatura secreta** para `MP_WEBHOOK_SECRET=` no `.env`. Em
   desenvolvimento, o Mercado Pago precisa alcançar a sua máquina: use um túnel (ex.:
   `cloudflared tunnel --url http://localhost:3333`) e cadastre a URL do túnel. Sem webhook, o
   pedido ainda é conferido no Mercado Pago quando a rotina de expiração passa.
4. Reinicie a API (`pnpm dev`). O log deve dizer `Pagamentos: provedor "mercadopago"`. Se faltar
   alguma das três variáveis, a API não sobe e diz qual falta.
5. Teste no ambiente de testes: faça um Pix (o QR vem do Mercado Pago) e um cartão com os
   **cartões de teste** da documentação (developers.mercadopago.com.br → Checkout API → Cartões
   de teste; o nome do titular `APRO` aprova e `OTHE` recusa). Use o botão "Simular
   notificação" do painel de webhooks para conferir a assinatura (a API responde 401 se o
   segredo estiver errado).
6. Para receber de verdade, troque pelas **Credenciais de produção** (e o segredo do webhook de
   produção) e faça um Pix de R$ 1 para conferir. O reembolso pela API já existe
   (`refund` no provedor); o botão no painel chega na Fase 5.

A integração usa a **Orders API** (`/v1/orders`) do Checkout Transparente, a que a documentação
indica para integrações novas. Código em `apps/api/src/payments/`.
