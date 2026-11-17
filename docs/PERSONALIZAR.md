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
`settings` do banco e chegam ao site por `GET /api/site`. **O jeito normal de editar é o painel**,
em **Configurações** (passo a passo na seção 7): salvar valida os dados e avisa o site na hora.
Editado fora do painel, o site guarda a resposta em cache por 60 segundos.

Outras formas (para quem desenvolve):

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

Os presentes ficam na tabela `gifts` do banco e aparecem em `/presentes`. Edite pelo **painel**,
em **Presentes** (seção 7): nome, descrição, categoria, preço, cotas, foto, ordem e
mostrar/ocultar. A tabela abaixo é a referência das colunas (para o Drizzle Studio:
`pnpm --filter @casamento/db exec drizzle-kit studio` → tabela `gifts`).

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
  (ex.: `4.98`). Coloque o percentual real do seu plano no Asaas.
- Pedido em aberto segura as cotas por **30 minutos**; depois disso a API expira o pedido
  sozinha (rotina a cada 5 minutos) e devolve as cotas.
- Quando um presente é pago, a API manda o comprovante ao convidado e avisa os noivos por e-mail
  (`ADMIN_EMAIL_1` e `ADMIN_EMAIL_2`) e, se configurado, no Telegram (`TELEGRAM_BOT_TOKEN` e
  `TELEGRAM_CHAT_ID`). O recado, se a pessoa autorizar, entra em `messages` aguardando
  aprovação no painel (**Recados**).

## 6. Pagamentos: modo simulado e Asaas

Com `PAYMENT_PROVIDER=simulado` (o padrão), a API usa o **modo simulado**: o Pix mostra um QR
ilustrativo marcado "Simulação" e um código que nenhum banco aceita, e a tela de pagamento tem o
botão **"Simular pagamento aprovado"**, que entrega à API um webhook no mesmo formato do Asaas
(com o token no header `asaas-access-token`). Cartões de teste do simulado: `4111 1111 1111 1111`
aprova, `4000 0000 0000 0002` recusa (qualquer nome, validade futura e CVV). O log da API mostra
`Pagamentos: provedor "simulado"` ao subir.

### Como funciona com o Asaas

- **Pix**: na nossa tela. O convidado informa o **CPF** no formulário do presente (o Asaas exige
  o documento de quem paga; o campo só aparece com o Asaas ligado, valida os dígitos e explica o
  porquê). O CPF é repassado ao Asaas para criar o cliente e **não fica guardado** no banco nem
  nos logs. A tela mostra o QR e o copia e cola do Asaas e confere o status a cada 3 s.
- **Cartão**: o botão "Pagar com cartão" leva à **fatura segura do Asaas**, onde a pessoa digita o
  cartão e escolhe as parcelas. Os dados do cartão nunca passam pelo site nem pela API. A taxa
  ("Quero cobrir a taxa") continua valendo: o valor da fatura já vem com ela.
- **Confirmação**: pelo webhook. Sem webhook (ex.: em desenvolvimento sem túnel), a tela de
  pagamento e a rotina de expiração também conferem o status no Asaas, então o pedido aparece
  pago do mesmo jeito, só com alguns segundos de atraso.
- **Expiração**: o QR do Asaas valeria por meses; quando o pedido passa dos 30 minutos, a API
  apaga as cobranças abertas no Asaas. Pago por um caminho (Pix ou cartão), a outra cobrança
  aberta também é apagada.

### Ativar o Asaas

1. **Conta de testes (sandbox)**: crie em [sandbox.asaas.com](https://sandbox.asaas.com) (é
   separada da conta real; nada é cobrado). Em **Minha conta → Integrações → Chaves de API**,
   gere uma chave. A do sandbox começa com `$aact_hmlg_`.
2. No `.env` da raiz (a chave **só** fica aqui; nunca vai ao navegador nem ao git):
   ```
   PAYMENT_PROVIDER=asaas
   ASAAS_API_KEY=$aact_hmlg_...   # pode colar com o $ mesmo
   ASAAS_ENV=                     # vazio: deduz pelo prefixo; se preencher e divergir, a API não sobe
   ASAAS_WEBHOOK_TOKEN=           # o token do passo 3
   ```
3. **Webhook**: em **Integrações → Webhooks → Adicionar**:
   - URL: `https://SEU-DOMINIO-DA-API/api/webhooks/payments`;
   - E-mail: o seu (o Asaas avisa se o webhook falhar);
   - Versão da API: v3; Envio: **não sequencial**; ativo;
   - **Token de autenticação**: clique em "Gerar token" (32 a 255 caracteres, sem espaços; não
     use a chave de API) e copie o mesmo valor para `ASAAS_WEBHOOK_TOKEN=`. Se o token não bater,
     a API responde 401;
   - **Eventos de cobrança**: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
     `PAYMENT_DELETED`, `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`,
     `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUND_DENIED`, `PAYMENT_CHARGEBACK_REQUESTED`,
     `PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`,
     `PAYMENT_REPROVED_BY_RISK_ANALYSIS`. Outros eventos são aceitos (200) e ignorados.
4. **Webhook em desenvolvimento**: o Asaas precisa alcançar a sua máquina. Use um túnel, por
   exemplo `cloudflared tunnel --url http://localhost:3333`, e cadastre no sandbox a URL que ele
   mostrar + `/api/webhooks/payments`. Sem túnel tudo funciona pela consulta de status descrita
   acima; o webhook passa a valer depois do deploy. Em desenvolvimento a API sobe sem o token
   (avisa no log e responde 401 a todo webhook); em produção ele é obrigatório.
5. **Volta do cartão**: em produção, depois de pagar a fatura o Asaas devolve a pessoa para
   `/presentes/obrigado/...`. Para isso, o domínio do site (`SITE_URL`) precisa estar cadastrado
   em **Minha conta → Informações** (dados comerciais) do Asaas. Em `localhost` não há
   redirecionamento: a pessoa volta pela aba do site, que já mostra o pagamento confirmado.
6. Reinicie a API (`pnpm dev`). O log deve dizer `Pagamentos: provedor "asaas"`. Teste no sandbox:
   um Pix (no painel do sandbox, abra a cobrança e use **"Confirmar pagamento"** para simular o
   recebimento) e um cartão na fatura com os cartões de teste da documentação do Asaas.
7. **Produção**: na conta real (asaas.com), cadastre uma **chave Pix** (sem ela o Asaas não gera
   o QR), complete a aprovação da conta (inclusive a conta bancária para saque), gere a chave de
   produção (`$aact_prod_...`), cadastre o webhook de produção com um token novo e troque
   `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` no `.env` do servidor. Faça um Pix de R$ 5 e estorne
   pelo painel dos noivos para conferir. Ajuste `payments.card_fee_percent` para a taxa de cartão
   do seu plano no Asaas.

Atenção: com a chave de produção em desenvolvimento, todo Pix ou cartão gerado no site local é
uma cobrança real (a API avisa no log). Para testar, use a chave do sandbox.

A integração usa a API v3 do Asaas com `fetch` (sem SDK). Código em `apps/api/src/payments/`
(`asaas.ts`, `simulado.ts`, `provider.ts`).

## 7. Administrar pelo painel

O painel é o "admin" dos noivos: fica em **http://localhost:3333/painel/** em desenvolvimento
(em produção, `https://<endereço da API>/painel/`). Funciona no celular; vale salvar o endereço
na tela inicial.

### Acesso

1. Entre com o seu e-mail (`ADMIN_EMAIL_1` ou `ADMIN_EMAIL_2` do `.env`) e a senha inicial
   (`ADMIN_PASSWORD_INICIAL`), criados pelo `pnpm db:seed`.
2. No primeiro acesso, toque no seu nome (canto de cima) → **Trocar senha**. Marque "Sair dos
   outros aparelhos" se suspeitar que alguém viu a senha.
3. **Sair** fica no canto de cima. Depois de 5 senhas erradas em um minuto, o login espera um
   minuto.

### Criar convites e enviar os links

1. **Convites → Novo convite**. Preencha o nome do convite (como aparece para o convidado, ex.:
   "Família Silva"), o lado (Dani ou Gustavo), o máximo de pessoas e o telefone com DDD.
2. Adicione cada pessoa em **+ Adicionar convidado** (marque "Criança" e a faixa etária quando
   for o caso). Marque "Pode levar acompanhante" se o convite aceita +1: o convidado digita o
   nome ao confirmar.
3. Salve. Na página do convite:
   - **Enviar no WhatsApp** abre a conversa (com o telefone do convite, se houver) já com a
     mensagem e o link; **Copiar** copia só o link. Os dois marcam o convite como "enviado".
   - **Gerar link novo** invalida o link antigo (use se ele foi parar com a pessoa errada).
4. Para mudar nomes, pessoas ou corrigir uma resposta recebida por telefone, use **Editar** e
   mude a "Resposta" de cada convidado.

### Acompanhar as confirmações

- **Início** mostra convites e pessoas confirmados, pendentes e que não vão, quantos adultos e
  crianças (por faixa) vêm, o total arrecadado e o prazo do RSVP.
- **Convites** tem busca por nome (do convite ou de quem está nele) e filtro por situação. Na
  página de cada convite aparecem as respostas recebidas pelo site, com data e restrições
  alimentares.
- **Exportar confirmados (CSV)** (em Convites, ou "Baixar lista do buffet" no Início) baixa a
  planilha das pessoas confirmadas com restrições alimentares, pronta para buffet, cerimonial e
  portaria. Abre direto no Excel. Restrição alimentar é dado de saúde: compartilhe só com o
  buffet.

### Presentes

- **Presentes → Novo presente** ou **Editar**: nome, descrição, categoria, preço da cota (em
  reais, ex.: `150,00`), total de cotas (1 = presente inteiro) e foto (JPG, PNG ou WebP até
  2 MB, guardada em `UPLOAD_DIR` no servidor). "Valor livre" deixa o convidado escolher quanto
  dar.
- Cada linha mostra cotas **pagas**, **reservadas** (Pix aguardando, seguram a cota por 30 min) e
  livres. O total de cotas não pode ficar abaixo de pagas + reservadas.
- As setas ↑ ↓ mudam a ordem da lista no site. **Ocultar** tira o presente do site sem apagar;
  **Excluir** só aparece para presentes que nunca tiveram pedido.
- O site atualiza na hora ao salvar (a API avisa o site para limpar o cache).

### Pedidos e reembolso

- **Pedidos** lista os presentes comprados, com filtros por situação (aguardando, pago,
  expirado, falhou, reembolsado), forma (Pix ou cartão) e busca por nome, e-mail ou presente.
  Toque num pedido para ver os detalhes e o recado.
- **Reembolsar** (só em pedidos pagos) pede a devolução ao provedor de pagamento, depois de
  confirmar: o pedido vira "Reembolsado", as cotas voltam para a lista e o recado sai do mural.
  No modo simulado nada é cobrado nem devolvido de verdade.
- **Conferir com o provedor** consulta os pedidos em aberto e os dos últimos 3 dias e corrige
  divergências (ex.: um Pix pago cujo aviso se perdeu). A API faz essa conferência sozinha uma
  vez por dia.

### Recados

- **Recados → Aguardando** lista os recados novos (os que vêm junto com presentes, quando o
  convidado autoriza). **Aprovar** libera para aparecer no site; **Ocultar** tira de novo.
  Recado não aprovado nunca aparece publicamente.

### Configurações

Cada bloco tem o próprio botão de salvar e é validado antes de ir para o site:

- **Casal e datas**: nomes, monograma, data e hora do casamento e **prazo para confirmar
  presença** (depois dele o site não aceita respostas e mostra o contato de vocês).
- **Locais**: cerimônia e recepção (nome, horário, endereço, link do mapa opcional, latitude e
  longitude). Sem link, o site monta o do Google Maps pelo endereço.
- **Contato**: WhatsApp (só números, com 55 e DDD), e-mail e frase.
- **Presentes e pagamento**: taxa do cartão (%) e categorias da lista.
- **Programação**, **Traje** (texto, paleta e o que evitar), **Hospedagem**, **Dúvidas** e
  **Compartilhamento** (título e descrição do link).
- **Avançado**: nossa história, galeria e manual dos padrinhos (este em JSON). As fotos em si
  continuam na pasta do site (seção 2).
