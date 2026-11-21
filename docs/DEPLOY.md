# Deploy em produção (VPS Linux + Docker)

Passo a passo para colocar a plataforma no ar numa VPS Ubuntu (Hostinger ou outra). Tudo roda em
containers Docker; a VPS só precisa do Docker e do git.

**Dois projetos na mesma VPS.** O site do casamento segue no ar pelo projeto `casamento` (branch
`main`, `SLUG="casamento"`, hosts `danigustavo.artzan.tech` e `painel-danigustavo.artzan.tech`,
volumes com os dados reais) e não é tocado. Esta branch (`saas`) sobe a plataforma como **outro
projeto**, `happy4ever`, ao lado dele (passo a passo em "Subir a plataforma ao lado do casamento").
O casamento só vem para a plataforma depois do teste do Asaas ("Depois: trazer o casamento para a
plataforma").

A VPS é **compartilhada** com outros sites: um Caddy único, o **edge** (`/srv/edge`), é dono das
portas 80/443 e dos certificados, e cada projeto só entrega containers, `deploy/site.caddy` e
`deploy/deploy.conf`. A instalação do edge e o uso do script `site` estão no README do kit da VPS
(`vps-edge`); este documento não repete esse passo a passo. O contrato está no `CLAUDE.md`
(seção "Deploy: arquitetura da VPS ArtZan").

```
Internet ──► edge (Caddy único, :80/:443, HTTPS automático)      rede Docker externa "edge"
               ├─ https://DOMAIN       ──► happy4ever-web :3000 (Next.js) ──┐
               ├─ https://API_DOMAIN   ──► happy4ever-api :3333 (Hono + painel)◄┘ rede interna (proxy)
               │                                        └──► db :3306 (MySQL 8.4, rede "banco" sem internet)
               └─ danigustavo / painel-danigustavo ──► projeto "casamento" (main), intocado
```

| Serviço            | O que é                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `happy4ever-web`   | Site público (Next.js em modo `standalone`: um `server.js` com só o necessário)                                       |
| `happy4ever-api`   | API, painel em `/painel`, rotinas (expiração de Pix, conciliação, lembretes) e fotos dos presentes (volume `uploads`) |
| `db`               | MySQL 8.4 com volume `db_data`, sem porta para a internet                                                             |
| `migrate`, `setup` | Ferramentas avulsas (`docker compose run --rm ...`)                                                                   |

Arquivos: `Dockerfile` (alvos `web` e `api`), `docker-compose.prod.yml`, `deploy/site.caddy` (blocos
de site que o edge importa), `deploy/deploy.conf` (lido pelo script `site`), `.env.production.example`,
`scripts/setup-vps.sh`, `scripts/backup-db.sh`. O `docker-compose.yml` da raiz continua sendo só para
desenvolvimento.

O `web` e a `api` entram na rede `edge` com os aliases `happy4ever-web` e `happy4ever-api` (os
upstreams do `site.caddy`); o `db` nunca entra nela. O nome do projeto Compose (`name: happy4ever`) e
o `SLUG` do `deploy.conf` não mudam: o Compose prefixa volumes e redes com ele
(`happy4ever_db_data`, `happy4ever_uploads`, `happy4ever_proxy`, `happy4ever_banco`), por isso nada
colide com os `casamento_*` do outro projeto.

Os serviços que entram na `edge` se chamam `happy4ever-web`/`happy4ever-api` (e não `web`/`api`): o
Compose registra o nome do serviço em todas as redes do container, e a `edge` é compartilhada; com
um segundo `api` nela, o `http://api:3333` do projeto `casamento` poderia cair na API deste projeto.

## Hosts de produção

| Variável     | Host                         | Para onde                                                                         |
| ------------ | ---------------------------- | --------------------------------------------------------------------------------- |
| `DOMAIN`     | `happy4ever.artzan.tech`     | `web`: site da plataforma (landing, preços, cadastro); também é o `PLATFORM_HOST` |
| `API_DOMAIN` | `happy4ever-api.artzan.tech` | `api`: painel, login, uploads, portaria, portal e webhooks de todos os eventos    |

Os dois estão em `DOMAIN_VARS` e `REQUIRED_VARS` do `deploy/deploy.conf` e têm bloco próprio no
`deploy/site.caddy`. O compose passa `PLATFORM_HOST = DOMAIN` (não se preenche no `.env`).
`danigustavo.artzan.tech` e `painel-danigustavo.artzan.tech` pertencem ao projeto `casamento` e não
entram aqui até a migração. **Webhook do Asaas**: quando o Asaas for ligado neste projeto, cadastre
`https://happy4ever-api.artzan.tech/api/webhooks/payments` (§10).

## Por que dois endereços (site e API)

- `https://DOMAIN` é o site. `https://API_DOMAIN` é a API, com o
  painel em `/painel`, o login (Better Auth) e o webhook do Asaas.
- Os dois apps usam `/api/...` (o Next tem `/api/revalidar`, `/api/pedidos`, `/api/health`), então
  dividir um domínio só por caminho exigiria uma lista frágil de exceções.
- O cookie de sessão do painel fica preso ao host da API e nunca vai para o site.
- O painel e o login estão na mesma origem (`BETTER_AUTH_URL = https://API_DOMAIN`, montado pelo
  compose), que é o que a proteção de CSRF do painel (`Origin`), o aceite de convites, a confirmação
  do cadastro e o `trustedOrigins` do Better Auth esperam. Os links dos e-mails também saem dela.
- O site da plataforma não chama a API pelo navegador: o cadastro é uma Server Action do Next, que
  faz `POST /api/signup` pela rede interna com `X-Web-Key`. O link do painel no site da plataforma
  aponta para `BETTER_AUTH_URL/painel/` (build arg e variável do `web` no compose: mudou
  `API_DOMAIN`, rebuild do `web`).
- No host da API, o edge (por `deploy/site.caddy`) só libera `/painel`, `/api/auth/*`, `/api/admin/*`, `/api/webhooks/*`,
  `/api/health` e `/uploads/*`. As rotas públicas da API (`/api/site`, `/api/invitations`...) o site
  acessa pela rede interna do Docker (`API_URL=http://happy4ever-api:3333`).
- No host do site, `/api/revalidar` fica fechado (`site.caddy`): a API avisa o site pela rede interna
  (`WEB_INTERNAL_URL=http://happy4ever-web:3000`).

---

## 1. Chave SSH (no seu PC, PowerShell)

```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP_DA_VPS "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Também dá para cadastrar a chave pública no painel da Hostinger (VPS → Chaves SSH).

## 2. Preparar a VPS

Copie o script e rode como root:

```powershell
scp scripts\setup-vps.sh root@IP_DA_VPS:/root/
```

```bash
ssh root@IP_DA_VPS
bash setup-vps.sh deploy
```

Ele atualiza o sistema, liga as atualizações automáticas de segurança, cria 2 GB de swap, instala o
Docker, cria o usuário `deploy`, configura o UFW (22, 80, 443) e o fail2ban.

Abra **outro** terminal e teste `ssh deploy@IP_DA_VPS`. Entrou com a chave? Volte na sessão root:

```bash
bash setup-vps.sh deploy --harden-ssh
```

Isso desliga o login por senha e o login direto como root. Se o firewall do painel da Hostinger
estiver ligado, libere lá também 22, 80 e 443 (TCP) e 443 (UDP).

## 3. DNS

No DNS do domínio, crie dois registros **A** para o IP da VPS, TTL 300, **sem AAAA** (os de
`danigustavo` e `painel-danigustavo` já existem e são do projeto `casamento`; não mexa neles):

| Tipo | Nome             | Host completo                | Valor     | TTL |
| ---- | ---------------- | ---------------------------- | --------- | --- |
| A    | `happy4ever`     | `happy4ever.artzan.tech`     | IP da VPS | 300 |
| A    | `happy4ever-api` | `happy4ever-api.artzan.tech` | IP da VPS | 300 |

(Hostinger: hPanel → Domínios → artzan.tech → DNS, TTL 300. Só um nível de subdomínio: o SSL da
Cloudflare cobre `*.artzan.tech`, mas não `*.danigustavo.artzan.tech`.)

- Na Cloudflare, deixe a nuvem **cinza (DNS only)** até o HTTPS funcionar (passo 9).
- **Não crie registro AAAA (IPv6)** por enquanto: sem IPv6 configurado no Docker, as conexões por
  IPv6 chegam ao edge com o IP interno do Docker, e o limite de tentativas por IP passaria a valer
  para todo mundo junto.
- Confira antes de subir: `nslookup` de cada um dos dois hosts tem que devolver o IP da VPS. Com o DNS
  errado, o edge fica tentando emitir o certificado e pode esbarrar no limite do Let's Encrypt.

## 4. Clonar o projeto

O repositório é privado: use uma **deploy key** (chave só de leitura, só deste repositório).

```bash
ssh deploy@IP_DA_VPS
ssh-keygen -t ed25519 -C "deploy-vps" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key**, cole a chave (sem marcar
"Allow write access"). Depois:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
git clone -b saas git@github.com:GustAlvesG/DaniGustavo.git ~/happy4ever
cd ~/happy4ever
```

A pasta do projeto `casamento` (`/root/DaniGustavo`, branch `main`) continua onde está; esta é
outra pasta, na branch `saas`. A mesma deploy key serve para as duas (é o mesmo repositório).

## 5. Configurar o `.env`

```bash
cp .env.production.example .env
chmod 600 .env
for i in 1 2 3 4 5; do openssl rand -hex 32; done   # um valor para cada segredo
nano .env
```

Preencha:

- `DOMAIN` e `API_DOMAIN` (o e-mail do Let's Encrypt fica no edge, não aqui);
- `SETUP_WEDDING=0` (já vem assim): o `setup` cria só planos, contas e o admin da plataforma, sem
  importar o casamento;
- `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `WEB_KEY`, `BETTER_AUTH_SECRET` (cada um com um valor
  diferente do `openssl`; hex evita `@ / : #`, que quebram a `DATABASE_URL`);
- `ADMIN_EMAIL_1`, `ADMIN_EMAIL_2`, `ADMIN_PASSWORD_INICIAL` (mín. 10 caracteres);
- SMTP (`MAIL_*`): sem ele os e-mails de confirmação e lembretes não saem (só aparecem no log);
- pagamentos: comece com `PAYMENT_PROVIDER=simulado` e ligue o Asaas no passo 10;
- `PAYMENT_SECRETS_KEY` (plataforma, Fase 5): mais um valor do `openssl rand -hex 32`,
  **obrigatório em produção** (a API não sobe sem ele). Cifra as chaves de API das subcontas
  Asaas; trocá-lo depois invalida as chaves gravadas. `PLATFORM_FEE_PERCENT` (taxa da plataforma,
  padrão 0) e `ASAAS_PLATFORM_WALLET_ID` ficam para o passo 10;
- Fase 6 (todas opcionais; ver "Plataforma multi-evento" abaixo): `BILLING_PROVIDER`
  (`simulado` padrão ou `asaas`), `SIGNUP_ENABLED` (`0` padrão),
  `PLATFORM_BASE_DOMAIN`, `PLATFORM_ALERT_EMAIL` (recebe falhas de rotina e erros 5xx, com
  intervalo mínimo entre avisos; vazio = só log) e `LOG_FORMAT` (`json` padrão em produção, ou
  `texto`). Os avisos de pedido e RSVP saem só por e-mail (o Telegram foi removido).

`SITE_URL`, `BETTER_AUTH_URL`, `API_URL`, `DATABASE_URL`, `PLATFORM_HOST` e `NEXT_PUBLIC_SITE_URL` **não** vão no
`.env`: o `docker-compose.prod.yml` monta a partir de `DOMAIN`, `API_DOMAIN` e `MYSQL_*`. A linha
`COMPOSE_FILE=docker-compose.prod.yml` faz o `docker compose` usar o arquivo de produção sem `-f`.

> **`$` no `.env`**: o Docker Compose trata `$nome` como variável. Valor com `$` (a chave do Asaas
> começa com `$aact_`) vai **entre aspas simples**: `ASAAS_API_KEY='$aact_prod_...'`.

## 6. Subir (edge + site)

Se o edge ainda não está instalado nesta VPS, instale uma vez (README do kit da VPS):

```bash
site instalar-edge        # cria a rede "edge", sobe o Caddy único e pede o e-mail do Let's Encrypt
```

Depois, com o `.env` pronto (passo 5), o script `site` faz o resto (valida `deploy/deploy.conf`,
sobe o compose, roda `migrate` + `setup` na primeira vez (`primeira_vez`) e `migrate` sempre
(`pos_subida`), registra o `deploy/site.caddy` no edge e confere os `HEALTH_URLS`):

```bash
site registrar ~/happy4ever   # projeto já clonado na branch saas, com o .env pronto (passos 4 e 5)
```

(`site novo <repo>` clonaria a branch padrão, `main`, que é o projeto `casamento`: por isso o
clone manual com `-b saas` no passo 4.)

Sem o script, o equivalente manual é `docker compose up -d --build` seguido do passo 7, mais o
registro do `site.caddy` no edge.

O primeiro build leva alguns minutos (instala as dependências, compila o site e o painel). O `next
build` baixa as fontes do Google, então a VPS precisa de internet nessa hora.

O build do site é feito **sem a API no ar**: as páginas saem com o conteúdo provisório e se refazem
sozinhas na primeira visita depois que a API sobe (o cache dessas páginas dura 15 s). Se a primeira
visita mostrar textos provisórios, recarregue a página.

## 7. Banco: migrations e primeira carga

```bash
docker compose run --rm migrate   # cria/atualiza as tabelas
docker compose run --rm setup     # SETUP_WEDDING=0: planos, contas e admin da plataforma
```

- Com `SETUP_WEDDING=0` (este projeto) o `setup` cria os planos, os modelos de tarefas, os
  usuários `ADMIN_EMAIL_1`/`ADMIN_EMAIL_2` com a senha `ADMIN_PASSWORD_INICIAL` e marca
  `ADMIN_EMAIL_2` como admin da plataforma. Não cria evento, não importa o casamento e não
  cadastra domínio. Num banco vazio a migration 0006 deixa um evento 1 de reserva ("Evento 1", sem
  data nem domínio); o setup o arquiva para que não responda. Pode rodar de novo: não sobrescreve
  nada.
- Com `SETUP_WEDDING=1` (só depois de trazer o banco do casamento) ele garante o evento 1, as
  configurações e o conteúdo do casamento, os vínculos dos dois usuários com a organização 1 e o
  host de `DOMAIN` como domínio do evento 1 se ele não tiver nenhum.
- **Não use o `seed` em produção.** Ele cria convites e 8 presentes fictícios, e cada nova execução
  recria os presentes de exemplo que vocês tiverem apagado (o seed é de desenvolvimento).

## 8. Conferir

```bash
docker compose ps                         # happy4ever-web, happy4ever-api e db "healthy"
docker logs edge-caddy-1 2>&1 | grep -i "certificate obtained"
docker compose logs -f happy4ever-api     # "Pagamentos: provedor ..." e nenhum erro de configuração
curl -I https://happy4ever.artzan.tech                       # landing da plataforma
curl https://happy4ever-api.artzan.tech/api/health
curl 'https://happy4ever-api.artzan.tech/api/health?db=1'    # também confere o banco (503 se falhar)
curl -I https://danigustavo.artzan.tech                      # o casamento continua respondendo
```

Depois:

1. Abra `https://API_DOMAIN/painel/`, entre com o seu e-mail e a senha inicial e troque a senha
   (seu nome → **Trocar senha**). Os dois.
2. Apague `ADMIN_PASSWORD_INICIAL` do `.env` (ela só serve para o `setup`).
3. Crie organizações e eventos pela CLI ou pelo painel (`docs/PERSONALIZAR.md`).

## 9. Cloudflare (recomendado)

Com o HTTPS funcionando nos dois endereços:

1. Ligue a nuvem **laranja** nos dois registros.
2. **SSL/TLS → Visão geral → Full (strict)**. (Flexible causa loop de redirecionamento.)
3. Pronto: o edge já confia no header `CF-Connecting-IP` **só** quando a conexão vem dos IPs da
   Cloudflare (`trusted_proxies` no Caddyfile global do edge, lista de
   <https://www.cloudflare.com/ips/>; confira uma vez por ano). Assim o limite de tentativas continua por visitante, e ninguém forja o IP
   chamando a VPS direto.
4. Se o Asaas receber 403 no webhook (Bot Fight Mode/WAF), crie em **Security → WAF** uma regra
   "Skip" para o host `API_DOMAIN` e caminho começando com `/api/webhooks/`.

O certificado continua sendo renovado pelo edge, inclusive com a nuvem laranja.

### Como o IP real chega ao app

- O edge calcula o IP do visitante (`{client_ip}`: o da conexão, ou o `CF-Connecting-IP` quando a
  conexão vem da Cloudflare) e, pelo snippet `ip_real` (usado no `site.caddy`), **sobrescreve** `X-Forwarded-For` e `X-Real-IP` com esse valor
  único. O que o visitante mandar nesses headers é descartado.
- Login do painel (Better Auth, 5 tentativas/min por IP): lê o `X-Forwarded-For` e só aceita um
  valor único, por isso a sobrescrita. Com uma lista (`ip1, ip2`), ele não confiaria e todo mundo
  cairia no mesmo contador.
- RSVP, busca de convite, pedidos e recados: o Next lê o `X-Forwarded-For` e repassa à API em
  `X-Client-Ip`. A API só usa esse header em escritas com `X-Web-Key` (vindas do Next); no host da
  API o `site.caddy` ainda apaga qualquer `X-Client-Ip` vindo de fora.

## 10. Pagamentos com o Asaas

Siga `docs/PERSONALIZAR.md` §6 (conta, chave Pix, chave de API). Em produção:

- Webhook do Asaas: `https://API_DOMAIN/api/webhooks/payments`
  (`https://happy4ever-api.artzan.tech/api/webhooks/payments`), com o token gerado lá. Enquanto o
  casamento estiver no projeto `casamento`, o webhook do Asaas dele continua em
  `painel-danigustavo.artzan.tech`; só troque na migração ("Depois: trazer o casamento...").
- No `.env`:
  ```
  PAYMENT_PROVIDER=asaas
  ASAAS_API_KEY='$aact_prod_...'
  ASAAS_WEBHOOK_TOKEN=o-mesmo-token-do-webhook
  ```
- Cadastre o domínio do site (`https://DOMAIN`) em Minha conta → Informações, para a volta do
  cartão.
- Aplique: `docker compose up -d happy4ever-api` (o `restart` **não** relê o `.env`; o `up -d` recria o
  container com os valores novos). O log deve mostrar `Pagamentos: provedor "asaas"`.
- Teste com um Pix de R$ 5 e estorne pelo painel (Pedidos).
- **Subcontas e split (plataforma, Fase 5)**: peça ao Asaas a liberação de subcontas e split e
  valide no sandbox antes (`docs/PERSONALIZAR.md` §6, "Recebimentos por subconta"). Com taxa,
  preencha `PLATFORM_FEE_PERCENT` e `ASAAS_PLATFORM_WALLET_ID` (o `walletId` da conta principal).
  O webhook de cada subconta é registrado pela API ao criar a subconta, em
  `https://API_DOMAIN/api/webhooks/payments/accounts/<id público>` (já liberado pelo
  `/api/webhooks/*` do `site.caddy` e pela regra do Cloudflare do §9); não há cadastro manual.

## 11. Backup

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh               # teste manual: backups/db-*.sql.gz e backups/uploads-*.tar.gz
```

O `deploy.conf` declara `BACKUP_CMD="scripts/backup-db.sh"`: o script `site` coloca esse comando no
cron do root (por padrão às 3h; `BACKUP_CRON` muda). O script faz `cd` para a raiz do projeto, então
roda de qualquer pasta.

O script faz `mysqldump --single-transaction` (foto consistente sem travar o site), guarda as fotos
dos presentes e os contratos (o volume de uploads inteiro, inclusive `<evento>/private/`, em `uploads-*.tar.gz`) e apaga backups com mais de 14 dias (`RETENTION_DAYS`). **Configure a cópia para
fora da VPS** no fim do script (`gsutil` ou `rclone`): backup só na VPS não vale como backup. Os
comandos de restauração estão no topo do script; teste uma restauração antes do grande dia.

## 12. Atualizar o site

```bash
site atualizar happy4ever  # git pull, up -d --build, migrate, atualiza o site.caddy no edge, confere a saúde
docker image prune -f      # limpa imagens antigas
```

Manual, se preferir: `cd ~/happy4ever && git pull && docker compose up -d --build &&
docker compose run --rm migrate`. Mudou o `deploy/site.caddy`? Rode `site atualizar happy4ever` (ou
`site registrar`) para o edge reler o arquivo.

Quem estiver com o site aberto durante a troca pode ver um erro ao enviar um formulário; recarregar
a página resolve (cada build tem seus próprios identificadores de Server Actions).

## Comandos úteis

```bash
docker compose logs -f happy4ever-web happy4ever-api   # logs
docker compose exec db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
site atualizar happy4ever                      # depois de mudar o deploy/site.caddy
docker compose down                            # para tudo (os volumes ficam)
```

Banco no DBeaver/HeidiSQL do seu PC: descomente `127.0.0.1:3306:3306` no serviço `db` (se o projeto
`casamento` já usa a 3306 da VPS, troque por `127.0.0.1:3307:3306` aqui), rode
`docker compose up -d db` e abra um túnel: `ssh -L 3306:127.0.0.1:3306 deploy@IP_DA_VPS`.

## Pegadinhas

- **O Docker passa por fora do UFW.** Toda porta em `ports:` publicada em `0.0.0.0` fica aberta para
  a internet, mesmo com o firewall bloqueando. Só o edge publica portas (este projeto não
  publica nenhuma); para o banco, só `127.0.0.1:3306` + túnel SSH.
- **`NEXT_PUBLIC_*` e o rewrite de `/uploads` são gravados no build.** Mudou `DOMAIN`? Rode
  `docker compose up -d --build` (não basta reiniciar).
- **`restart` não relê o `.env`.** Use `docker compose up -d` (recria só o que mudou).
- **`$` no `.env`** vai entre aspas simples (passo 5).
- **IPv6**: sem registro AAAA (passo 3), a não ser que você ligue o IPv6 no Docker.
- **Nunca `docker compose down -v`**: o `-v` apaga os volumes (banco e fotos).
- **RAM**: build do Next + MySQL apertam VPS de 1-2 GB. O `setup-vps.sh` cria 2 GB de swap; no
  `docker-compose.prod.yml` há uma linha para desligar o `performance_schema` do MySQL (~200 MB).
- **Primeira visita com conteúdo provisório**: normal logo depois de um build (passo 6).
- **Login bloqueado por 1 minuto** depois de 5 senhas erradas, por IP. Se todos forem bloqueados
  juntos, o IP real não está chegando: confira o AAAA e o `trusted_proxies` do edge.
- **Senha do MySQL**: o usuário e a senha só são criados na **primeira** subida do volume
  `db_data`. Trocar `MYSQL_PASSWORD` no `.env` depois disso não muda a senha no banco (use
  `ALTER USER` no MySQL e depois ajuste o `.env`).

## Migração do Caddy próprio para o edge (histórico, projeto `casamento`)

Já feito no projeto `casamento` (branch `main`); fica como referência. Para quem já tem o site no ar com o Caddy do próprio compose (`/root/DaniGustavo`, projeto
`casamento`, `DOMAIN=danigustavo.artzan.tech`, `API_DOMAIN=painel-danigustavo.artzan.tech`). O
banco e as fotos não são tocados: o `name: casamento` continua, então os volumes são os mesmos.

```bash
docker network create edge                 # 1. rede compartilhada (uma vez)
cd /root/DaniGustavo && git pull           # 2. traz o compose novo, site.caddy e deploy.conf
sed -i '/^ACME_EMAIL=/d' .env              #    (opcional) a variável não é mais usada
docker compose up -d --remove-orphans      # 3. web/api entram na edge; o caddy antigo sai
site instalar-edge                         # 4. sobe o edge (portas 80/443 já livres)
site registrar /root/DaniGustavo           # 5. registra o site.caddy e confere a saúde
```

- Entre os passos 3 e 5 o site fica fora do ar (cerca de 1 minuto): o Caddy antigo sai no passo 3 e
  o edge só atende depois do 4. Faça fora do horário de pico e não deixe o passo 4 para depois.
- Os certificados serão **reemitidos pelo edge** (o `casamento_caddy_data` não é reaproveitado).
  É normal: leva alguns segundos por domínio. O DNS precisa estar apontando para a VPS.
- Conferido tudo, apague os volumes do Caddy antigo (só eles; nunca `db_data` ou `uploads`):
  `docker volume rm casamento_caddy_data casamento_caddy_config`.
- Se algo der errado, volte: `git checkout main` na pasta, `docker compose up -d --remove-orphans`
  (o `site instalar-edge` já teria tomado as portas: pare o edge antes com `docker compose down`
  em `/srv/edge`).

## Subir a plataforma ao lado do casamento

Resumo do caminho deste projeto (`happy4ever`, branch `saas`), sem tocar no projeto `casamento`:

1. **DNS** (Hostinger: hPanel → Domínios → artzan.tech → DNS): registros **A** `happy4ever` e
   `happy4ever-api` para o IP da VPS, TTL 300, **sem AAAA** (§3). Confira com `nslookup`.
2. **Clonar** na branch `saas`, em outra pasta: `git clone -b saas ... ~/happy4ever` (§4).
3. **`.env`**: `cp .env.production.example .env && chmod 600 .env` e preencha (§5):
   - `DOMAIN=happy4ever.artzan.tech`: site da plataforma (o compose o usa também como
     `PLATFORM_HOST`).
   - `API_DOMAIN=happy4ever-api.artzan.tech`: painel, login, uploads, portaria, portal e webhooks.
   - `MYSQL_DATABASE`/`MYSQL_USER` = `happy4ever`: banco próprio, no volume `happy4ever_db_data`.
   - `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `WEB_KEY`, `BETTER_AUTH_SECRET`,
     `PAYMENT_SECRETS_KEY`: um `openssl rand -hex 32` diferente para cada; **não** reaproveite os
     do projeto `casamento`.
   - `ADMIN_EMAIL_1`, `ADMIN_EMAIL_2`, `ADMIN_PASSWORD_INICIAL`: contas do painel; o
     `ADMIN_EMAIL_2` (Gustavo) vira admin da plataforma.
   - `SETUP_WEDDING=0`: o `setup` não cria evento nem importa o casamento (uma cópia aqui
     divergiria dos dados reais, que seguem chegando no projeto antigo).
   - `MAIL_*`, `PAYMENT_PROVIDER`, `BILLING_PROVIDER`, `SIGNUP_ENABLED`...: como no §5; comece
     com `simulado` e cadastro fechado.
4. **Subir**: `site registrar ~/happy4ever` (§6). O `primeira_vez` roda `migrate` + `setup` (só
   plataforma); o `pos_subida`, `migrate`. O script registra o `site.caddy` (blocos `DOMAIN` e
   `API_DOMAIN`, snippet `happy4ever_web`) e confere os `HEALTH_URLS`.
5. **Verificar** (§8): `https://happy4ever.artzan.tech` mostra a landing,
   `https://happy4ever-api.artzan.tech/api/health?db=1` dá 200, o painel abre e aceita o login, e
   `https://danigustavo.artzan.tech` continua igual (projeto `casamento`).
6. **Backup**: o `BACKUP_CMD` do `deploy.conf` entra no cron deste projeto; os arquivos ficam em
   `~/happy4ever/backups`, separados dos do casamento.

Fica separado dos dois lados: `name`/`SLUG`, imagens (`happy4ever/*` × `casamento/*`), nomes dos
serviços na `edge`, redes internas (`happy4ever_proxy`/`happy4ever_banco`), aliases, volumes, banco,
segredos, pasta e cron de backup. Só a rede `edge` e o Caddy do edge são compartilhados.

## Depois: trazer o casamento para a plataforma

Quando o Asaas estiver testado e o casal decidir migrar. Faça fora do horário de pico: o que
chegar no projeto antigo depois do backup do passo 1 não vem junto.

1. **Backup do projeto `casamento`** e parada do site antigo:
   `cd /root/DaniGustavo && docker compose stop web && ./scripts/backup-db.sh` (só o `web`: o
   backup lê os uploads de dentro da `api`, que precisa estar no ar; confira o
   `db-*.sql.gz` e o `uploads-*.tar.gz`).
2. **Importar no `happy4ever`**. Substitui o banco dele: o que tiver sido criado na plataforma até
   aqui se perde (se já houver clientes, faça backup do `happy4ever` e planeje a fusão dos dados,
   que este passo não cobre).
   ```bash
   cd ~/happy4ever && ./scripts/backup-db.sh
   docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON \`$MYSQL_DATABASE\`.* TO \"$MYSQL_USER\"@\"%\";"'
   gunzip -c /root/DaniGustavo/backups/db-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db \
     sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
   docker compose exec -T happy4ever-api tar xzf - -C /data < /root/DaniGustavo/backups/uploads-AAAAMMDD-HHMMSS.tar.gz
   ```
3. **Migrations 0006+**: `docker compose run --rm migrate` (organizações, eventos, domínios e
   `event_id` em tudo; o casamento vira o evento 1).
4. **Domínio do casamento antes do setup**: cadastre `danigustavo.artzan.tech` no evento 1 com o
   `domain:add` da CLI (`docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts`
   sem argumentos lista as opções). Sem isso o `setup` cadastraria o `DOMAIN`
   (`happy4ever.artzan.tech`, o site da plataforma) como domínio do casamento.
5. **`setup` normal**: `SETUP_WEDDING=1` no `.env`, `docker compose run --rm setup` (vínculos dos
   admins com a organização 1, conteúdo do casamento; idempotente) e volte para `SETUP_WEDDING=0`.
6. **Fotos**: `docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts uploads:migrate`
   (move as fotos antigas para `uploads/1/`).
7. **Hosts**: no `deploy/site.caddy` deste projeto, acrescente o bloco do site do casamento
   (`import happy4ever_web`) e o do host antigo do painel (`import seguranca` +
   `redir https://${API_DOMAIN}{uri} 308`), com as variáveis em `DOMAIN_VARS`/`REQUIRED_VARS`/
   `HEALTH_URLS` e no `.env.production.example` (o desenho estava no commit `10c83c4`,
   `LEGACY_API_DOMAIN`). Tire o `site.caddy` do projeto `casamento` do edge e rode
   `site atualizar happy4ever`.
8. **Webhook do Asaas**: troque para `https://happy4ever-api.artzan.tech/api/webhooks/payments`
   (com `ASAAS_*` e o token no `.env` deste projeto). O 308 do host antigo não é confiável para
   POST de webhook.
9. **Conferir**: `https://danigustavo.artzan.tech` com o casal, um RSVP de teste, painel em
   `happy4ever-api` com o evento, `painel-danigustavo` redirecionando.
10. **Desligar o projeto antigo**: `cd /root/DaniGustavo && docker compose down` (**sem** `-v`;
    guarde os volumes `casamento_*` e os backups por um tempo) e tire o cron de backup dele.

## Plataforma multi-evento (branch saas)

Referência do funcionamento da plataforma em produção.

- **Hosts por evento.** O site descobre o evento pelo `Host` da requisição, consultando a tabela
  `event_domains`. Host que não está lá → 404. Hosts entram pela CLI (`domain:add`) ou pelo painel
  da organização. O `/api/health` do site responde com qualquer `Host`.
- **`WEB_INTERNAL_URL`** (já no compose: `http://happy4ever-web:3000`): a API avisa o site por ela
  com `{ eventId, tags }`; o `/api/revalidar` continua fechado no `site.caddy`.
- **Migrations 0006 em diante** reescrevem tabelas com dados (organizações, eventos, domínios,
  `event_settings`, `event_id` em todas as tabelas). Só pesam ao trazer o banco do casamento
  (seção anterior); num banco novo o `migrate` cria tudo do zero.
- **Migration 0011 (recebimentos, Fase 5)**: cria `payment_accounts` e põe todos os eventos
  existentes em `payment_receiver = platform` (continuam na conta principal, sem taxa). Exige
  `PAYMENT_SECRETS_KEY` no `.env` (ver §5) antes de subir a API nova.
- **Host público**: o site lê o `X-Forwarded-Host` antes do `Host` (o Caddy manda o host
  original nele; o próprio Next também, ao seguir o `redirect()` de uma Server Action).
- **CLI de plataforma no container** (mesma imagem da API):
  `docker compose run --rm --entrypoint node happy4ever-api /app/packages/db/src/cli.ts <comando>`
  (`event:list`, `org:create`, `event:create`, `domain:add`, `user:add`; sem argumentos lista as
  opções). Um evento novo num subdomínio de `artzan.tech` também precisa do DNS (§3) e de um
  bloco no `site.caddy` com `import happy4ever_web`.
- **Planos, cadastro, domínios e LGPD (Fase 6)**: sem migration nova além da 0012 (aplicada pelo
  `migrate`; ela põe as organizações existentes no plano interno Cortesia e marca os domínios
  existentes como verificados: só domínio verificado resolve). `docs/PERSONALIZAR.md` §9 a §11
  descrevem o uso.
- **Logs e saúde**: em produção cada requisição e erro sai como uma linha JSON no `docker compose
logs happy4ever-api` (sem corpo, e-mail ou IP em claro). `GET /api/health` só confirma o processo (é o do
  healthcheck e do `HEALTH_URLS`); `?db=1` também faz `SELECT 1` e dá 503 se o banco falhar
  (use-o em monitor externo).
- **Backup**: `scripts/backup-db.sh` guarda também os uploads (fotos e contratos privados).

### Site da plataforma e subdomínios automáticos

- `PLATFORM_HOST` (`happy4ever.artzan.tech`): host da landing, dos preços e do cadastro. Neste
  projeto é o próprio `DOMAIN` (o compose repassa), com registro A (passo 3) e o bloco `${DOMAIN}`
  do `site.caddy` (snippet `happy4ever_web`). `SIGNUP_ENABLED=1` abre o cadastro; fechado por padrão.
- `PLATFORM_BASE_DOMAIN` (ex.: `eventos.artzan.tech`): cada evento ganha `<slug>.<base>` sozinho.
  Exige um registro curinga `*.eventos.artzan.tech` e um certificado que o cubra (curinga via DNS
  challenge no edge, ou on-demand TLS abaixo). **Atenção:** o SSL da Cloudflare cobre só
  `*.artzan.tech` (um nível), então um curinga de dois níveis precisa da nuvem **cinza** (DNS only)
  e de certificado emitido pelo próprio edge; ou use uma base de um nível.

### Domínio da plataforma: happy4ever.artzan.tech

Decidido: a plataforma fica em **`happy4ever.artzan.tech`** (`PLATFORM_HOST`: landing, preços e
cadastro). Contrato da VPS: só um nível de subdomínio em `artzan.tech`.

- Hosts decididos (tabela em "Hosts de produção" e DNS no passo 3): `happy4ever.artzan.tech`
  (`DOMAIN` = `PLATFORM_HOST`, site) e `happy4ever-api.artzan.tech` (`API_DOMAIN`, API e painel de
  todos os eventos). O casamento e o redirecionamento de `painel-danigustavo.artzan.tech` entram
  depois ("Depois: trazer o casamento para a plataforma").
- Mudou o `API_DOMAIN`? `docker compose up -d --build` (o `web` embute o link do painel no build)
  e `site atualizar happy4ever` para o edge ler o `site.caddy` novo.
- `PLATFORM_BASE_DOMAIN` fica **vazio**: não pode ser `happy4ever.artzan.tech` (geraria
  `slug.happy4ever.artzan.tech`, dois níveis, sem cobertura do SSL universal da Cloudflare).
  Alternativas: certificado avançado da Cloudflare para `*.happy4ever.artzan.tech`; um domínio
  próprio da plataforma no futuro; ou eventos só com domínio próprio verificado (on-demand TLS).

### Domínios próprios (on-demand TLS no edge)

O cliente aponta o domínio dele (registro A para o IP da VPS) e prova a posse com o registro TXT
`_plataforma-verificacao.<domínio>` (painel da organização → evento → **Domínios**). Para o edge
emitir o certificado só de quem está cadastrado, o Caddy pergunta à API antes de cada emissão. Isto
muda o edge (`/srv/edge`), fora deste repositório, e **não** entra no `deploy/site.caddy`
(o contrato proíbe bloco global ali). Exemplo:

```caddy
# Bloco global do Caddyfile do edge
{
	on_demand_tls {
		# 200 só para host verificado de evento ativo, subdomínio da base e PLATFORM_HOST; o resto 404
		ask http://happy4ever-api:3333/api/hosts/ask
	}
}

# Bloco de domínios próprios (edge): qualquer host que o ask aprovar vai para o site
https:// {
	tls {
		on_demand
	}
	import seguranca
	reverse_proxy happy4ever-web:3000 {
		import ip_real
		flush_interval -1
	}
}
```

- `GET /api/hosts/ask?domain=<host>` responde só na rede interna (`happy4ever-api:3333`); o host da
  API (`site.caddy`) não o expõe.
- O `/api/revalidar` precisa continuar fechado também no bloco dos domínios próprios (`respond 404`
  para esse caminho, como no `site.caddy`).
- Se o domínio estiver na Cloudflare, mantenha a nuvem cinza até o certificado sair.
- Sem esse bloco no edge, domínios próprios cadastrados no painel não ganham HTTPS (o subdomínio
  `<slug>.<base>` e o `PLATFORM_HOST` continuam dependendo do DNS e do certificado acima).

### Dia do evento (Fase 7): caminhos, câmera e e-mails

- **Caminhos do host da API** (`API_DOMAIN`, já no `deploy/site.caddy`): além do painel, passam
  `/portaria*` e `/fornecedor*` (páginas sem conta; o token vai no fragmento `#`, que nem chega ao
  servidor), `/api/checkin/*` e `/api/vendor-portal/*` (isentas de `X-Web-Key`, usam
  `Authorization: Bearer`), e também `/api/team-invites/*` e `/api/signup/*` (o painel as chama;
  estavam fechadas). Quem mantém o `site.caddy` por cópia precisa levar essas linhas.
- **Câmera da portaria**: a API responde `Permissions-Policy: camera=(self)` só em `/portaria/`
  (o resto da API manda `camera=()`). O snippet `seguranca` do edge, pelo contrato, só define HSTS,
  `nosniff`, `Referrer-Policy` e remove `Server`/`X-Powered-By`, então o cabeçalho chega intacto.
  **Cuidado:** se o edge passar a definir `Permissions-Policy`, ele deve fazê-lo só quando ausente,
  ou excluir `/portaria*`; senão a câmera não abre. A portaria continua útil pela digitação do
  código e pela busca por nome. Exemplo (edge):
  ```caddy
  header ?Permissions-Policy "camera=(), microphone=(), geolocation=()"
  ```
  (`?` = só define se a resposta não trouxe o cabeçalho.)
- **E-mails novos** (link do portal do fornecedor e aviso de convidados acima do limite do plano)
  dependem do SMTP (`MAIL_*`); sem ele, saem só no log da API. O link do portal usa o host da API
  (`/fornecedor/#<token>`), então `BETTER_AUTH_URL` precisa apontar para ele.
- Sem migration nova além da 0013 (aplicada pelo `migrate`).
