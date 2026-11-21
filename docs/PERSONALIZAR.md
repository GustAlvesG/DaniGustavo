# Como personalizar o site

Guia rápido para trocar textos, fotos, cores e dados do evento. **Tudo se edita no painel**
(http://localhost:3333/painel/ em dev), sem mexer em código: salvar valida e avisa o site na hora.

## 1. Textos e seções da página inicial (painel → Site)

A página **Site** do painel mostra cada seção da home num bloco que abre e fecha:

| O que                                      | Onde no painel (Site)                                              |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Ordem das seções / esconder uma seção      | **Ordem da página inicial** (subir, descer, ligar/desligar)        |
| Foto de fundo do topo (computador/celular) | **Abertura** → Foto (computador) / Foto (celular)                  |
| "Vamos nos casar", textos da contagem      | **Abertura** → Linha acima dos nomes, Contagem                     |
| Nossa história (polaroids)                 | **Nossa história** → momentos (ano, título, texto, foto)           |
| "Do nosso álbum"                           | **Álbum de fotos** → fotos escolhidas da galeria, com legenda      |
| Foto e legenda do evento, versículo        | **O evento** e **Citação sobre foto**                              |
| Títulos, rótulos e frases de cada seção    | Texto no menu, Rótulo, Título e Frase de apoio de cada seção       |
| Presentes, recados, confirmação, dúvidas   | blocos com o mesmo nome                                            |
| Menu do topo, rodapé e páginas internas    | **Menu**, **Rodapé**, **Páginas** (galeria, padrinhos, mural, 404) |

Convenções:

- Palavra entre `*asteriscos*` num título sai em ênfase (itálico na cor de destaque).
- `{prazo}` no texto da confirmação vira a data limite; `{data}`, a data do evento.
- Uma seção entra no menu se tiver **Texto no menu** preenchido.
- As palavras padrão ("os noivos", "o casamento"...) vêm do **tipo do evento** e podem ser
  trocadas em **Evento → Palavras**.

## 2. Fotos (painel → Galeria)

1. Em **Galeria**, envie as fotos (até 20 por vez; JPEG, PNG ou WebP até 4 MB; o painel gera a
   miniatura no navegador). Cada foto tem texto alternativo (para leitor de tela), legenda,
   álbum e posição.
2. Marque **na galeria** as que aparecem em `/galeria` e ordene.
3. Nas seções do **Site**, os campos de foto escolhem uma foto desta galeria (pelo id: trocar ou
   apagar a foto não deixa link quebrado; foto em uso não pode ser apagada).
4. Rosto cortado? Ajuste a **posição** (é o `object-position` do CSS): `center 30%` mostra mais
   o alto da foto; `40% center` puxa para a esquerda.

Formato: **JPEG**, lado maior com 2000 a 2400 px, qualidade ~80. O Next (`next/image`) gera as
versões menores. Topo no computador: foto deitada; no celular: em pé, com o casal no meio ou no
alto (a contagem cobre o rodapé da foto). Polaroids recortam em 4:5.

Os arquivos ficam em `UPLOAD_DIR/<eventId>/` (padrão `apps/api/storage/uploads`, fora do git),
servidos pela API em `/uploads/<eventId>/<arquivo>`.

> O casamento de Dani & Gustavo veio do código para o banco com
> `pnpm --filter @casamento/db exec node src/cli.ts content:import-legacy` (o seed já roda):
> as fotos originais ficam em `packages/db/legacy/dani-gustavo/fotos`. O comando é idempotente e
> não sobrescreve o que foi editado no painel. As fotos importadas não têm miniatura (gerá-la no
> servidor exigiria uma dependência para decodificar JPEG); o site usa a foto inteira.

## 3. Dados do evento (painel → Configurações)

Data e hora, local e endereço, programação, traje (cores e "evite"), hospedagem, perguntas
frequentes, contato, prazo da confirmação, manual dos padrinhos e textos de SEO ficam em
`event_settings` e chegam ao site por `GET /api/e/<slug>/site`. **Edite pelo painel**, em
**Configurações** (seção 7). Editado direto no banco, o site guarda a resposta em cache por 60 s.

Outras formas (para quem desenvolve):

- **Drizzle Studio**: `pnpm --filter @casamento/db exec drizzle-kit studio` → tabela
  `event_settings` (chave `event_id` + `key`, coluna `value` em JSON).
- **Seed** (`packages/db/src/seed-data.ts`): ponto de partida do evento 1. O `pnpm db:seed` só
  cria chaves que não existem; `pnpm db:reset` **apaga e recria o banco inteiro**.

Sem a API (ex.: `next build` no CI), o site usa um conteúdo de reserva neutro
(`apps/web/src/lib/site-fallback.ts`: só nome, tipo e data do evento).

Dados de marca do evento, sem tela própria (Drizzle Studio ou CLI):

- `couple.monogram_art` = `"dg"`: usa a ligadura DG desenhada (a única arte que existe) no
  lugar das iniciais de `couple.monogram`, no site, favicon, ícones do app e imagem de prévia.
- `calendar.uid`: UID fixo do evento na agenda (`.ics`/Google Agenda). Sem ele, o UID é
  `evento-<data>@<slug>`. O importador grava o UID antigo do casamento para ninguém ganhar um
  evento duplicado na agenda.

## 4. Aparência (painel → Aparência) e tipo do evento (painel → Evento)

- **Aparência**: tema (**Álbum**, **Festa**, **Moderno**), uma das paletas prontas do tema
  (todas com contraste aprovado) e as fontes de texto, rótulos e nomes de uma lista curada. A
  prévia mostra as cores antes de salvar. O tema muda formas, fotos e tipografia por variáveis
  CSS (`apps/web/src/themes/**`); o Álbum é o desenho original do casamento.
- **Evento**: tipo do evento, **módulos** (presentes, recados, galeria, padrinhos, confirmação,
  programação: desligado some do menu e da home e a página dá 404), **lados** dos convites
  (ex.: Noiva/Noivo; um lado em uso não pode sair) e **palavras** do vocabulário.
- Para desenvolver um tema: tokens em `apps/web/src/app/globals.css` (nomes do Álbum: `papel`,
  `tinta`, `marinho`...), registro de temas, paletas e fontes em `packages/shared/src/themes.ts`
  (o teste confere o contraste), CSS de cada tema em `apps/web/src/themes/<tema>/` e fontes em
  `apps/web/src/themes/fonts.ts`. Imagem de prévia do link:
  `apps/web/src/app/[host]/opengraph-image.tsx` (cores do tema e a foto do topo no celular).

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
   `/presentes/obrigado/...`. Para isso, o domínio do site (o host primário do evento) precisa estar cadastrado
   em **Minha conta → Informações** (dados comerciais) do Asaas. Em `localhost` não há
   redirecionamento: a pessoa volta pela aba do site, que já mostra o pagamento confirmado.
6. Reinicie a API (`pnpm dev`). O log deve dizer `Pagamentos: provedor "asaas"`. Teste no sandbox:
   um Pix (no painel do sandbox, abra a cobrança e use **"Confirmar pagamento"** para simular o
   recebimento) e um cartão na fatura com os cartões de teste da documentação do Asaas.
7. **Produção**: na conta real (asaas.com), cadastre uma **chave Pix** (sem ela o Asaas não gera
   o QR), complete a aprovação da conta (inclusive a conta bancária para saque), gere a chave de
   produção (`$aact_prod_...`), cadastre o webhook de produção com um token novo e troque
   `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` no `.env` do servidor (lá a chave vai entre aspas
   simples, `ASAAS_API_KEY='$aact_prod_...'`, por causa do Docker Compose; ver
   [DEPLOY.md](DEPLOY.md) §10). Faça um Pix de R$ 5 e estorne
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
   (`ADMIN_PASSWORD_INICIAL`), criados pelo `pnpm db:seed` (em produção, pelo `setup`; ver
   [DEPLOY.md](DEPLOY.md) §7).
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
- **Exportar confirmados (CSV)** (em Convites) baixa a planilha de todas as pessoas confirmadas.
- **Listas: buffet, cerimonial e portaria** (em Convites; "Baixar lista do buffet" no Início):
  cada aba mostra os confirmados com totais, com **Baixar CSV** (abre no Excel) e **Imprimir ou
  salvar PDF**. Buffet: adulto/criança, faixa etária e restrição alimentar. Cerimonial: por
  convite, com lado, acompanhante, restrição e telefone. Portaria: nomes em ordem alfabética com
  uma caixinha "Chegou", **sem** restrições nem telefone. Restrição alimentar é dado de saúde:
  repasse só ao buffet (e ao cerimonial, que combina o serviço).

### Importar convidados de uma planilha

1. **Convites → Importar planilha**. Baixe o **modelo** (XLSX ou CSV) ou use o exemplo
   `docs/exemplos/convidados-exemplo.csv` (50 convidados fictícios em 22 convites; também em
   `.xlsx`).
2. Uma linha por pessoa. Colunas (a primeira linha tem os nomes; maiúsculas e acentos não
   importam):

   | Coluna                | Obrigatória | O que preencher                                                                      |
   | --------------------- | ----------- | ------------------------------------------------------------------------------------ |
   | `convite`             | sim         | Nome do convite (ex.: Família Silva). Linhas com o mesmo convite viram um convite só |
   | `lado`                | sim         | Dani ou Gustavo                                                                      |
   | `nome`                | sim         | Nome da pessoa                                                                       |
   | `tipo`                | não         | adulto ou criança (vazio = adulto)                                                   |
   | `faixa_etaria`        | só criança  | 0-2, 3-7 ou 8-12                                                                     |
   | `telefone`            | não         | Com DDD; o primeiro do convite vira o WhatsApp do convite                            |
   | `email`               | não         | O primeiro do convite recebe a confirmação da resposta                               |
   | `acompanhante`        | não         | sim ou não; basta marcar em uma linha do convite                                     |
   | `max_pessoas`         | não         | Vazio = número de convidados (+1 se aceita acompanhante)                             |
   | `restricao_alimentar` | não         | Alergia é dado de saúde: só para o buffet                                            |

3. Escolha o arquivo: a **prévia** mostra cada linha como "Pronto", "Já existe" ou com os erros
   em português (ex.: "Lado “Noiva” não reconhecido"). Corrija na planilha e escolha de novo;
   nada é gravado até **Importar N convites**.
4. Reimportar o mesmo arquivo não duplica: convite com o mesmo nome de um que já está no painel
   é ignorado (com aviso). Pessoa com o mesmo nome em outro convite gera só um aviso.
5. Formatos: `.xlsx` (Excel, Google Planilhas → Fazer download → .xlsx) ou `.csv` (vírgula ou
   ponto e vírgula, UTF-8 ou o CSV do Excel). O `.xls` antigo não é aceito: no Excel, **Salvar
   como → Pasta de Trabalho do Excel (.xlsx)**. Até 1.000 pessoas e 2 MB por arquivo.

### QR dos convites para imprimir

- Na página de cada convite aparece o **QR** do link, com **Imprimir QR** e **Baixar QR (SVG)**.
- **Convites → Imprimir QR dos convites** monta cartões no visual do convite (monograma, nomes,
  data, nome do convite, QR e o link em texto), 8 por folha A4. Escolha **Todos**, **Não
  enviados** ou **Escolher** (marque os convites) e toque em **Imprimir ou salvar PDF**; na janela
  do navegador escolha "Salvar como PDF", papel A4, escala 100%. Depois de importar, o botão
  "Imprimir QR dos novos convites" já abre só os importados. Imprimir não marca como enviado.

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
- Os aprovados aparecem no **mural** (`/recados`, e os 3 mais recentes na home). Aprovar ou
  ocultar atualiza o site na hora. Quem não comprou presente também pode escrever em
  `/recados` ("Deixe um recado"): entra como **Aguardando**, com nome e texto apenas (sem
  e-mail, sem guardar o IP), limite de 500 caracteres e 3 recados por pessoa a cada 10 minutos.
- Textos: painel → **Site** → bloco **Recados** (inclusive quantos aparecem na home) e
  **Páginas** (mural e formulário). Para tirar da home, desligue a seção na ordem; para tirar o
  mural inteiro, desligue o módulo em **Evento**.

### Lembretes de confirmação (e-mail)

- **Lembretes** no painel manda um e-mail curto, com o link do convite, para convites **sem
  nenhuma resposta** e **com e-mail** (o de contato do convite ou o de um convidado), enquanto o
  prazo do RSVP não passou. Convites pendentes sem e-mail são só contados (use o WhatsApp).
- **Automático**: a API confere de hora em hora e envia nos dias configurados antes do prazo
  (padrão **14 e 3**). Pode desligar na mesma tela. Cada convite recebe cada lembrete uma vez só
  (tabela `rsvp_reminders`), mesmo que a API reinicie; se ficou parada e duas datas passaram,
  vale só a última. Quem recebeu um lembrete nas últimas 24 horas não recebe outro.
- **Enviar lembretes agora**: mostra quantos convites vão receber e pede confirmação.
- Sem `MAIL_HOST` no `.env`, o e-mail só é impresso no console da API. O texto está em
  `apps/api/src/reminder-email.ts`.

### App instalável (PWA)

O site pode ser instalado no celular ("Instalar app" / "Adicionar à tela inicial"). O nome vem
de `couple.names`; o ícone (monograma do evento nas cores do tema) e o `start_url` saem de
`apps/web/src/app/[host]/manifest.webmanifest/` e `apps/web/src/lib/pwa-icon.tsx`. O service worker
(`apps/web/public/sw.js`) só guarda fontes e ícones e mostra `public/offline.html` quando não
há internet; nunca guarda páginas, convites (`/c/*`), `/confirmar`, pagamento nem a API. Mudou o
`sw.js`? Aumente `VERSION` nele. Precisa de HTTPS em produção.

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
- **Avançado**: aviso de fotos oficiais e manual dos padrinhos (este em JSON). História e fotos
  ficam em **Site** e **Galeria** (seções 1 e 2).

### Gestão do evento: tarefas, fornecedores, financeiro e cronograma

No menu do evento, o grupo **Gestão** reúne o que é só de bastidor (nada disso aparece no site).
A organização tira cada área do anfitrião, se quiser, em **Organização → Eventos → Permissões**.

- **Modelos de tarefas** (painel da organização → Modelos de tarefas): listas reaproveitáveis,
  por tipo de evento ou para qualquer tipo; cada item tem categoria e prazo em dias antes (ou
  depois) da data do evento.
- **Tarefas**: crie à mão ou **aplique um modelo** (gera cópias; aplicar de novo duplica). Prazo
  fixo (uma data) ou relativo à data do evento; responsável da equipe da organização ou anfitrião.
  As abas mostram atrasadas, próximas (30 dias), abertas e feitas. Mudou a data ou o fuso do evento
  em **Configurações → Casal e datas**? Os prazos relativos são recalculados na hora.
- **Fornecedores**: o catálogo é da organização (painel da organização → Fornecedores: contato,
  CPF/CNPJ, avaliação, arquivar). No evento, ligue um fornecedor do catálogo ou cadastre na hora,
  marque a situação (em cotação, contratado, descartado) e anexe **contratos** (PDF, JPG, PNG ou
  WebP até 10 MB). Os contratos ficam numa área privada: só baixam pelo painel, com login.
  Fornecedor já usado não se apaga, arquiva-se. Tirar do evento apaga os contratos e os orçamentos
  não contratados dele; com orçamento contratado, não sai.
- **Financeiro**: defina o **previsto** por categoria e cadastre **orçamentos** (itens com
  quantidade e valor, desconto). O orçamento anda de rascunho → recebido → aprovado → contratado
  (ou recusado); para contratar, monte as **parcelas**, que precisam somar o total. Depois de
  contratado, o orçamento não muda (só o plano de parcelas, sem apagar parcela paga). Marque cada
  parcela como paga (data e forma). A tabela **planejado × realizado** compara previsto,
  contratado e pago por categoria; o início do evento mostra tarefas atrasadas e próximas parcelas.
- **Cronograma**: a programação do dia, com horário no fuso do evento, fim opcional, local e
  responsável (texto livre ou um fornecedor do evento). O botão **Imprimir** gera o roteiro em papel.

## 8. Criar um novo evento

O site atende vários eventos, um por domínio. Quem é **dono ou membro da organização** cria e
administra os eventos pelo painel; a CLI continua valendo para a plataforma (criar a própria
organização, scripts).

### Pelo painel (organização)

1. No seletor do topo, escolha **Organização: <nome>** (ou abra `#/o/<id>`). O **Início** da
   organização mostra cada evento com data, convidados, confirmados e presentes recebidos.
2. **Eventos → Novo evento**: nome, tipo, data, horário, fuso (padrão `America/Sao_Paulo`),
   endereço (o `slug`, conferido enquanto você digita) e, se quiser, o domínio próprio (vira o
   domínio principal dos links). O evento nasce **rascunho** (o site responde 404) com o site
   neutro do tipo; em **Eventos**, **Ativar** coloca no ar e **Arquivar** tira (não há apagar).
3. **Anfitriões** (atalho no menu do evento, para dono e membro): digite o e-mail e **Enviar convite**. A
   pessoa recebe um link que vale 7 dias e só funciona uma vez; **Reenviar** gera um link novo
   (o antigo morre) e **Cancelar convite** invalida. Quem não tem conta cria a senha ao aceitar; quem
   já tem entra com ela e aceita. O anfitrião só vê o próprio evento, nunca a organização.
4. **Permissões do anfitrião** (outro atalho no menu do evento): desmarque o que os anfitriões daquele evento não podem fazer
   (por padrão, tudo). Tirar "ver" uma área tira também "mexer" nela; o início do painel fica
   sempre. Dono e membro da organização não são afetados.
5. **Equipe** (só o dono): convidar dono ou membro, mudar papel e remover. A organização nunca
   fica sem dono. Membro cria eventos, convida anfitriões e ajusta permissões, mas não mexe na
   equipe. **Convites pendentes** lista tudo o que ainda não foi aceito.

Sem SMTP (`MAIL_HOST` vazio), o e-mail do convite sai no console da API, com o link.

### Pela CLI (plataforma)

A partir de `packages/db` (a API não precisa estar parada):

```bash
cd packages/db
node src/cli.ts org:create --slug minha-org --name "Minha organização"
node src/cli.ts event:create --org minha-org --slug ana-bruno --name "Ana & Bruno"   --type wedding --starts-at 2027-09-18T16:00:00-03:00 --status active
node src/cli.ts domain:add --event ana-bruno --host ana-bruno.localhost:3000 --primary
node src/cli.ts user:add --email anfitriao@exemplo.com --name "Ana" --event ana-bruno --role host
node src/cli.ts event:list
```

O painel e a CLI usam o mesmo serviço de criação (`createEventRecord`).

- O host entra como chega no navegador, com a porta em desenvolvimento
  (`ana-bruno.localhost:3000`); em produção, o domínio sem porta. O domínio marcado `--primary`
  é o dos links de e-mail, WhatsApp e QR.
- `user:add` imprime uma senha temporária uma única vez. Para dar acesso à organização inteira,
  troque por `--org minha-org --role owner|member`.
- O evento só aparece no site com `--status active` (`draft` responde 404).
- O evento novo abre com o site neutro do tipo (palavras, tema padrão, módulos do tipo, sem
  fotos); o anfitrião edita tudo no painel (seções 1 a 4).
