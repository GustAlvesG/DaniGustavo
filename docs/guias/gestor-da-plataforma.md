# Happy4Ever: guia do gestor da plataforma

**Para quem é:** para quem cuida do Happy4Ever inteiro (o papel "Administração da plataforma").
Você cria as organizações dos clientes, decide o plano de cada uma, acompanha quem está em dia e
mantém o servidor saudável. O Happy4Ever fica em dois endereços:

- **Site da plataforma** (apresentação, preços e cadastro): https://happy4ever.artzan.tech
- **Painel** (onde tudo se administra): https://happy4ever-api.artzan.tech/painel/

Algumas tarefas deste guia são feitas no servidor, com comandos. Eles estão em blocos cinza:
basta copiar, trocar o que está entre `<sinais>` e colar no terminal da VPS.

## Sumário

1. [Primeiro acesso e troca de senha](#1-primeiro-acesso-e-troca-de-senha)
2. [Conhecendo o painel da plataforma](#2-conhecendo-o-painel-da-plataforma)
3. [Criar a organização de um cliente](#3-criar-a-organização-de-um-cliente)
4. [Colocar uma organização num plano ou na Cortesia](#4-colocar-uma-organização-num-plano-ou-na-cortesia)
5. [Cuidar dos planos e dos preços](#5-cuidar-dos-planos-e-dos-preços)
6. [Abrir o cadastro público](#6-abrir-o-cadastro-público)
7. [Acompanhar a inadimplência](#7-acompanhar-a-inadimplência)
8. [Endereços dos eventos (domínios)](#8-endereços-dos-eventos-domínios)
9. [Alertas de erro por e-mail](#9-alertas-de-erro-por-e-mail)
10. [Backups](#10-backups)
11. [O que ainda está pendente](#11-o-que-ainda-está-pendente)
12. [Dúvidas comuns](#dúvidas-comuns)

## 1. Primeiro acesso e troca de senha

A sua conta foi criada na instalação do servidor, com a senha inicial definida no arquivo `.env`
(`ADMIN_PASSWORD_INICIAL`). O e-mail de `ADMIN_EMAIL_2` é o administrador da plataforma (`ADMIN_EMAIL_1` é opcional).

1. Abra https://happy4ever-api.artzan.tech/painel/.
2. Em **Entrar no painel**, digite o seu e-mail e a senha inicial e toque em **Entrar**.
3. Toque no seu nome, no canto de cima. Abre a página **Minha conta**.
4. Em **Trocar senha**, preencha **Senha atual**, **Nova senha** (pelo menos 10 caracteres) e
   **Repita a nova senha**. Marque **Sair dos outros aparelhos** se alguém pode ter visto a senha.
5. Toque em **Trocar senha**.
6. No servidor, apague o valor de `ADMIN_PASSWORD_INICIAL` do `.env`. Ele só serve para a
   instalação.

> Errou a senha 5 vezes em um minuto? O login espera um minuto. Ainda **não existe "Esqueci minha
> senha"**: guarde a sua num gerenciador de senhas.

## 2. Conhecendo o painel da plataforma

Só você vê o botão **Plataforma**, no topo do painel. Ele abre quatro abas:

| Aba                    | O que mostra                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Visão geral**        | Quantas organizações existem, eventos ativos, taxas dos últimos 30 dias e as assinaturas por situação.                           |
| **Organizações**       | Todas as organizações, com plano, situação, eventos ativos e tamanho da equipe. Tem busca e filtro por situação.                 |
| **Planos**             | O catálogo de planos: preços, dias de teste, taxa sobre os presentes, limites e módulos.                                         |
| **Modelos de tarefas** | As listas de tarefas prontas que a plataforma oferece aos clientes. Aqui é só consulta: as organizações copiam ou aplicam de lá. |

Ao abrir uma organização em **Organizações**, você vê:

- o plano, a situação da assinatura, a taxa sobre os presentes e o fim do teste;
- o **Uso**: eventos ativos, convidados no maior evento, pessoas na equipe e espaço em disco;
- as **Cobranças** da assinatura;
- os **Ajustes**: **Atribuir plano**, **Salvar taxa** (taxa negociada) e **Suspender organização**.

Você também entra no painel de qualquer organização e de qualquer evento. Use o seletor do topo
(**Organização: <nome>**) ou a lista que aparece em **Todas as organizações e eventos**.

## 3. Criar a organização de um cliente

> O painel da plataforma **ainda não tem botão para criar organização**. Ela nasce por comando no
> servidor; depois, todo o resto é feito no painel.

### Passo 1: criar a organização (no servidor)

1. Entre na VPS e vá para a pasta do projeto:

   ```bash
   cd ~/happy4ever
   ```

2. Crie a organização. Escolha um endereço curto (só letras minúsculas, números e hífen) e o
   plano. Para um cliente que você vai atender sem cobrança, use `cortesia`:

   ```bash
   docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts \
     org:create --slug <cerimonial-flores> --name "<Cerimonial Flores>" --plan cortesia
   ```

   Sem `--plan`, a organização entra no plano `essencial`, em período de teste.

3. Anote o número (id) que aparece na resposta: "Organização criada: id 7...".

### Passo 2: convidar a dona da organização (no painel)

1. No painel, abra a organização nova (seletor do topo ou **Todas as organizações e eventos**).
2. No menu da organização, toque em **Equipe**.
3. Em **Convidar para a equipe**, digite o e-mail da cliente, escolha o **Papel** **Dono** e
   toque em **Enviar convite**.
4. Ela recebe um e-mail com um link que vale 7 dias e serve uma vez. Ao abrir, cria a própria
   senha. Pronto: a partir daí ela segue o [guia do organizador](organizador.md).

O convite aparece em **Convites pendentes** até ser aceito. Lá dá para **Reenviar** (o link
antigo morre) ou **Cancelar convite**.

### Alternativa: criar a conta por comando

Se o e-mail não estiver saindo, crie a conta com uma senha temporária e passe a senha à cliente
por um canal seguro (ela troca no primeiro acesso, em **Minha conta**):

```bash
docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts \
  user:add --email <cliente@exemplo.com> --name "<Nome da cliente>" --org <cerimonial-flores> --role owner
```

A senha temporária aparece **uma única vez**. Para um membro (não dono), use `--role member`.

Outros comandos úteis (sem argumentos, a lista completa aparece):

```bash
docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts event:list
docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts
```

## 4. Colocar uma organização num plano ou na Cortesia

**Pelo painel (recomendado):**

1. **Plataforma → Organizações** e toque na organização.
2. Em **Ajustes**, escolha o **Plano** (os internos, como a **Cortesia**, aparecem com
   "(interno)").
3. Toque em **Atribuir plano**.

A Cortesia não tem cobrança nem limites. Atribuir pelo painel não confere o uso: se você passar
alguém para um plano menor do que o que ele já usa, nada é apagado, mas ele não consegue criar
mais coisas até ajustar.

**Taxa negociada:** no mesmo lugar, em **Taxa negociada sobre os presentes (%)**, digite o
percentual combinado e toque em **Salvar taxa**. Vazio volta para a taxa do plano.

**Pelo servidor** (troca sem cobrança):

```bash
docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts \
  org:plan <cerimonial-flores> cortesia
```

## 5. Cuidar dos planos e dos preços

1. **Plataforma → Planos**. Toque num plano para editar, ou em **Novo plano**.
2. Preencha **Nome**, **Descrição**, **Preço mensal (R$)**, **Preço anual (R$)** (vazio = "a
   definir"), **Dias de teste**, **Taxa sobre os presentes (%)** e **Ordem na página de preços**.
3. Em **Limites (vazio = sem limite)**, defina eventos ativos, convidados por evento, pessoas na
   equipe, espaço para fotos e arquivos e os módulos do site (ou marque **Todos os módulos do
   site**).
4. Marque **Aparece na página de preços** para o plano ser vendido no site; desmarcado, ele é
   interno e só você atribui.
5. **Ativo** desmarcado tira o plano da página de preços; quem já tem continua nele.
6. Toque em **Salvar plano**.

> Os preços e limites de `essencial` e `profissional` ainda são **provisórios** (marcados
> `TODO(conteudo)`). Defina os valores finais antes de abrir o cadastro.

## 6. Abrir o cadastro público

Hoje o cadastro do site da plataforma está **fechado** (`SIGNUP_ENABLED=0`): o formulário em
https://happy4ever.artzan.tech/cadastro aparece, mas não aceita pedidos. Abra só quando tiver:

- os preços finais dos planos (seção 5);
- os textos legais revisados: **termos de uso** e **política de privacidade** (as páginas
  `/termos` e `/privacidade` do site da plataforma são rascunhos);
- a cobrança real ligada (seção 11), senão os clientes do cadastro ficam sem como pagar.

Para abrir:

1. No servidor, edite o `.env`:

   ```bash
   cd ~/happy4ever
   nano .env          # troque para SIGNUP_ENABLED=1 e salve
   docker compose up -d happy4ever-api
   ```

   O `up -d` recria a API com o valor novo (um simples `restart` não relê o `.env`).

2. Quem se cadastra recebe um e-mail, confirma, escolhe a senha e já ganha a própria organização,
   como dona, em período de teste. O aceite dos termos fica gravado.

Para fechar de novo, volte para `SIGNUP_ENABLED=0` e repita o `up -d`.

## 7. Acompanhar a inadimplência

1. **Plataforma → Visão geral**: em **Assinaturas por situação**, veja quantas estão
   **Pagamento em atraso**.
2. **Plataforma → Organizações**: em **Situação**, escolha **Pagamento em atraso** e toque em
   **Filtrar**.
3. Abra a organização para ver as **Cobranças** e a data do atraso.

Como funciona:

- O teste que acaba sem pagamento também vira "Pagamento em atraso".
- Os donos recebem aviso por e-mail, e o painel deles mostra um aviso no topo.
- Depois de **15 dias** de atraso, o painel da organização fica **só para consulta**. Ainda
  funcionam: plano, reembolso, conciliação e privacidade. O site dos convidados **nunca sai do
  ar**.
- Quando o pagamento entra, tudo volta ao normal sozinho.

**Suspender** (botão **Suspender organização**, nos Ajustes) deixa o painel da organização só
para consulta na hora, por decisão sua. **Reativar organização** desfaz.

## 8. Endereços dos eventos (domínios)

Cada evento precisa de um endereço para o site dos convidados abrir. Situação hoje:

- **Endereço automático** (`<evento>.<domínio base>`): **ainda não existe**. O domínio base
  (`PLATFORM_BASE_DOMAIN`) está vazio, e o painel avisa "Os endereços automáticos ainda não estão
  disponíveis nesta plataforma".
- **Domínio próprio do cliente** (ex.: `anaebruno.com.br`): o organizador cadastra em
  **Domínios** e verifica por um registro TXT. Mas o certificado de segurança (HTTPS) para esses
  domínios depende de um ajuste no Caddy do servidor (o "on-demand TLS", em `docs/DEPLOY.md`,
  "Domínios próprios") que **ainda não foi feito**. Até lá, o domínio próprio não abre.

**Caminho que funciona hoje: um subdomínio de artzan.tech** (ex.: `anaebruno.artzan.tech`):

1. Na Hostinger (hPanel → Domínios → artzan.tech → DNS), crie um registro **A** com o nome do
   subdomínio, apontando para o IP da VPS, TTL 300, sem AAAA.
2. Cadastre o endereço no evento (ele já entra verificado):

   ```bash
   docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts \
     domain:add --event <slug-do-evento> --host <anaebruno.artzan.tech> --primary
   ```

3. Acrescente um bloco ao `deploy/site.caddy` do projeto e publique (commit e `git push`):

   ```caddy
   <anaebruno.artzan.tech> {
   	import happy4ever_web
   }
   ```

4. Na VPS, aplique:

   ```bash
   site atualizar happy4ever
   ```

O endereço marcado como principal é o que vai nos convites, e-mails e QR codes. Lembre-se: o
subdomínio só pode ter **um nível** (`nome.artzan.tech`), porque o certificado da Cloudflare cobre
só esse formato.

## 9. Alertas de erro por e-mail

A plataforma avisa por e-mail quando uma rotina falha ou quando acontecem erros no servidor.

1. No `.env`, preencha `PLATFORM_ALERT_EMAIL` com o e-mail que deve receber os alertas.
2. Confira se o envio de e-mail (`MAIL_*`) está configurado: sem ele, nenhum e-mail sai (nem
   alertas, nem convites, nem lembretes); tudo vai só para o log.
3. Aplique com `docker compose up -d happy4ever-api`.

Vazio, os alertas ficam só no log. Para olhar o log:

```bash
docker compose logs -f happy4ever-api
```

Para conferir se tudo está de pé (o banco incluído):

```bash
curl 'https://happy4ever-api.artzan.tech/api/health?db=1'
```

## 10. Backups

O backup roda sozinho toda madrugada (às 3h), guardando o banco e todas as fotos e contratos em
`~/happy4ever/backups`. Arquivos com mais de 14 dias são apagados.

- **Testar à mão:**

  ```bash
  cd ~/happy4ever
  ./scripts/backup-db.sh
  ls backups
  ```

- **Importante:** backup só dentro da VPS não protege de perder a VPS. Configure a cópia para
  fora (rclone ou gsutil) no fim de `scripts/backup-db.sh`. Isso **ainda está pendente**.
- Os comandos para restaurar estão no topo do script. Faça um teste de restauração antes de um
  evento importante.

## 11. O que ainda está pendente

- **Pagamentos ainda não ligados.** Os presentes e as assinaturas estão no modo **simulado**, e
  no servidor de produção esse modo não aceita nada de mentira:
  - os presentes em dinheiro aparecem como **"Disponível em breve"** no site de todos os
    eventos (nenhum convidado consegue "comprar" um presente sem pagar), e o painel mostra
    "Pagamentos ainda não estão ativos na plataforma". Os organizadores podem montar a lista e
    deixar o módulo ligado: ela passa a aceitar presentes sozinha quando o Asaas for ligado;
  - as assinaturas não são cobradas e não ficam em atraso: o fim do teste não deixa o painel só
    para consulta. Os limites do plano continuam valendo e o painel do plano mostra "Cobrança de
    assinaturas ainda não ativa". Não precisa colocar ninguém na **Cortesia** só por isso.
- **Ligar o Asaas** exige, antes: uma chave do ambiente de testes do Asaas para validar Pix,
  cartão, reembolso, subcontas, divisão da taxa (split) e assinaturas; e pedir ao Asaas a
  liberação de subcontas e split na conta principal. O passo a passo técnico está em
  `docs/DEPLOY.md` §10 e `docs/PERSONALIZAR.md` §6.
- **Preços dos planos** e a **taxa da plataforma**: provisórios (`TODO(conteudo)`).
- **Textos legais**: termos de uso, política de privacidade e aviso de privacidade dos eventos,
  ainda rascunhos.
- **Textos padrão do WhatsApp**: provisórios (cada evento pode trocar os dele).
- **Endereços automáticos e domínios próprios com HTTPS** (seção 8).
- **Cópia do backup para fora da VPS** (seção 10).
- **Recuperação de senha**: não existe "Esqueci minha senha".

## Dúvidas comuns

**Um cliente esqueceu a senha. O que eu faço?**
Ainda não há recuperação de senha, nem pelo painel nem por comando (remover e convidar de novo não
resolve, porque a conta continua existindo). Hoje a saída é técnica: fale com quem desenvolve o
Happy4Ever.

**Suspender uma organização tira o site dos convidados do ar?**
Não. O site, as confirmações e os presentes continuam. Só o painel fica para consulta.

**Posso testar um pagamento sem gastar dinheiro?**
No servidor de produção, não: com o modo simulado, os presentes em dinheiro ficam "Disponível em
breve". Num ambiente de testes (fora da produção), o cartão 4111 1111 1111 1111 "aprova", o
4000 0000 0000 0002 "recusa" e aparecem os botões "Simular pagamento" do painel.

**Criei a organização, mas ela não aparece no seletor do topo.**
Recarregue a página do painel. O seletor só aparece quando você tem mais de uma organização ou
evento; senão, use **Todas as organizações e eventos**.

**Mudei o `.env` e nada mudou.**
Rode `docker compose up -d happy4ever-api`. O `restart` não relê o arquivo.

**Onde vejo quanto a plataforma ganhou de taxa?**
Em **Plataforma → Visão geral**, "Taxas nos últimos 30 dias". Enquanto o Asaas não estiver
ligado, não há presentes pagos e o valor fica zerado.
