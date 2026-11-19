# Deploy em produção (VPS Linux + Docker)

Passo a passo para colocar o site no ar numa VPS Ubuntu (Hostinger ou outra). Tudo roda em
containers Docker; a VPS só precisa do Docker e do git.

A VPS é **compartilhada** com outros sites: um Caddy único, o **edge** (`/srv/edge`), é dono das
portas 80/443 e dos certificados, e cada projeto só entrega containers, `deploy/site.caddy` e
`deploy/deploy.conf`. A instalação do edge e o uso do script `site` estão no README do kit da VPS
(`vps-edge`); este documento não repete esse passo a passo. O contrato está no `CLAUDE.md`
(seção "Deploy: arquitetura da VPS ArtZan").

```
Internet ──► edge (Caddy único, :80/:443, HTTPS automático)      rede Docker externa "edge"
               ├─ https://DOMAIN      ──► casamento-web :3000 (Next.js) ──┐
               └─ https://API_DOMAIN  ──► casamento-api :3333 (Hono + painel)◄┘ rede interna (proxy)
                                              └──► db :3306 (MySQL 8.4, rede "banco" sem internet)
```

| Serviço            | O que é                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `web`              | Site público (Next.js em modo `standalone`: um `server.js` com só o necessário)                                       |
| `api`              | API, painel em `/painel`, rotinas (expiração de Pix, conciliação, lembretes) e fotos dos presentes (volume `uploads`) |
| `db`               | MySQL 8.4 com volume `db_data`, sem porta para a internet                                                             |
| `migrate`, `setup` | Ferramentas avulsas (`docker compose run --rm ...`)                                                                   |

Arquivos: `Dockerfile` (alvos `web` e `api`), `docker-compose.prod.yml`, `deploy/site.caddy` (blocos
de site que o edge importa), `deploy/deploy.conf` (lido pelo script `site`), `.env.production.example`,
`scripts/setup-vps.sh`, `scripts/backup-db.sh`. O `docker-compose.yml` da raiz continua sendo só para
desenvolvimento.

O `web` e a `api` entram na rede `edge` com os aliases `casamento-web` e `casamento-api` (os
upstreams do `site.caddy`); o `db` nunca entra nela. O nome do projeto Compose (`name: casamento`) e
o `SLUG` do `deploy.conf` não mudam: o nome dos volumes (`casamento_db_data`, `casamento_uploads`)
depende dele.

## Por que dois endereços (site e API)

- `https://DOMAIN` é o site. `https://API_DOMAIN` (ex.: `api.danigustavo.com.br`) é a API, com o
  painel em `/painel`, o login (Better Auth) e o webhook do Asaas.
- Os dois apps usam `/api/...` (o Next tem `/api/revalidar`, `/api/pedidos`, `/api/health`), então
  dividir um domínio só por caminho exigiria uma lista frágil de exceções.
- O cookie de sessão do painel fica preso ao host da API e nunca vai para o site.
- O painel e o login estão na mesma origem (`BETTER_AUTH_URL = https://API_DOMAIN`), que é o que a
  proteção de CSRF do painel e o `trustedOrigins` do Better Auth já esperam: nenhum código mudou.
- No host da API, o edge (por `deploy/site.caddy`) só libera `/painel`, `/api/auth/*`, `/api/admin/*`, `/api/webhooks/*`,
  `/api/health` e `/uploads/*`. As rotas públicas da API (`/api/site`, `/api/invitations`...) o site
  acessa pela rede interna do Docker (`API_URL=http://api:3333`).
- No host do site, `/api/revalidar` fica fechado (`site.caddy`): a API avisa o site pela rede interna
  (`WEB_INTERNAL_URL=http://web:3000`).

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

No DNS do domínio (Cloudflare, Registro.br...), crie dois registros **A** para o IP da VPS:

| Tipo | Nome                                                    | Valor     |
| ---- | ------------------------------------------------------- | --------- |
| A    | `danigustavo` (`danigustavo.artzan.tech`)               | IP da VPS |
| A    | `painel-danigustavo` (`painel-danigustavo.artzan.tech`) | IP da VPS |

(Hostinger: hPanel → Domínios → artzan.tech → DNS, TTL 300. Só um nível de subdomínio: o SSL da
Cloudflare cobre `*.artzan.tech`, mas não `*.danigustavo.artzan.tech`.)

- Na Cloudflare, deixe a nuvem **cinza (DNS only)** até o HTTPS funcionar (passo 9).
- **Não crie registro AAAA (IPv6)** por enquanto: sem IPv6 configurado no Docker, as conexões por
  IPv6 chegam ao edge com o IP interno do Docker, e o limite de tentativas por IP passaria a valer
  para todo mundo junto.
- Confira antes de subir: `nslookup painel-danigustavo.artzan.tech` tem que devolver o IP da VPS. Com o DNS
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
git clone git@github.com:GustAlvesG/DaniGustavo.git DaniGustavo
cd DaniGustavo
```

## 5. Configurar o `.env`

```bash
cp .env.production.example .env
chmod 600 .env
for i in 1 2 3 4 5; do openssl rand -hex 32; done   # um valor para cada segredo
nano .env
```

Preencha:

- `DOMAIN`, `API_DOMAIN` (o e-mail do Let's Encrypt fica no edge, não aqui);
- `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `WEB_KEY`, `BETTER_AUTH_SECRET` (cada um com um valor
  diferente do `openssl`; hex evita `@ / : #`, que quebram a `DATABASE_URL`);
- `ADMIN_EMAIL_1`, `ADMIN_EMAIL_2`, `ADMIN_PASSWORD_INICIAL` (mín. 10 caracteres);
- SMTP (`MAIL_*`): sem ele os e-mails de confirmação e lembretes não saem (só aparecem no log);
- pagamentos: comece com `PAYMENT_PROVIDER=simulado` e ligue o Asaas no passo 10.

`SITE_URL`, `BETTER_AUTH_URL`, `API_URL`, `DATABASE_URL` e `NEXT_PUBLIC_SITE_URL` **não** vão no
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
sobe o compose, roda `setup` na primeira vez e `migrate` sempre, registra o `deploy/site.caddy` no
edge e confere os `HEALTH_URLS`):

```bash
site novo git@github.com:GustAlvesG/DaniGustavo.git   # clona, cria o .env e sobe
# ou, se o projeto já foi clonado (passos 4 e 5):
site registrar ~/DaniGustavo
```

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
docker compose run --rm setup     # configurações + os dois usuários do painel
```

- O `setup` cria as configurações (textos, datas e locais provisórios; o site não funciona sem
  elas) e os usuários `ADMIN_EMAIL_1`/`ADMIN_EMAIL_2` com a senha `ADMIN_PASSWORD_INICIAL`. Não cria
  convites nem presentes. Pode rodar de novo: não sobrescreve nada.
- **Não use o `seed` em produção.** Ele cria convites e 8 presentes fictícios, e cada nova execução
  recria os presentes de exemplo que vocês tiverem apagado (o seed é de desenvolvimento).

## 8. Conferir

```bash
docker compose ps                    # web, api e db "healthy"
docker logs edge-caddy-1 2>&1 | grep -i "certificate obtained"
docker compose logs -f api           # "Pagamentos: provedor ..." e nenhum erro de configuração
curl -I https://danigustavo.artzan.tech
curl https://painel-danigustavo.artzan.tech/api/health
```

Depois:

1. Abra `https://API_DOMAIN/painel/`, entre com o seu e-mail e a senha inicial e troque a senha
   (seu nome → **Trocar senha**). Os dois.
2. Apague `ADMIN_PASSWORD_INICIAL` do `.env` (ela só serve para o `setup`).
3. Ajuste em **Configurações** os textos, datas, locais e o prazo do RSVP.
4. Cadastre presentes e convites (ou importe a planilha, `docs/PERSONALIZAR.md` §7).

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

- Webhook do Asaas: `https://API_DOMAIN/api/webhooks/payments`, com o token gerado lá.
- No `.env`:
  ```
  PAYMENT_PROVIDER=asaas
  ASAAS_API_KEY='$aact_prod_...'
  ASAAS_WEBHOOK_TOKEN=o-mesmo-token-do-webhook
  ```
- Cadastre o domínio do site (`https://DOMAIN`) em Minha conta → Informações, para a volta do
  cartão.
- Aplique: `docker compose up -d api` (o `restart` **não** relê o `.env`; o `up -d` recria o
  container com os valores novos). O log deve mostrar `Pagamentos: provedor "asaas"`.
- Teste com um Pix de R$ 5 e estorne pelo painel (Pedidos).

## 11. Backup

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh               # teste manual: backups/db-*.sql.gz e backups/uploads-*.tar.gz
```

O `deploy.conf` declara `BACKUP_CMD="scripts/backup-db.sh"`: o script `site` coloca esse comando no
cron do root (por padrão às 3h; `BACKUP_CRON` muda). O script faz `cd` para a raiz do projeto, então
roda de qualquer pasta.

O script faz `mysqldump --single-transaction` (foto consistente sem travar o site), guarda as fotos
dos presentes e apaga backups com mais de 14 dias (`RETENTION_DAYS`). **Configure a cópia para
fora da VPS** no fim do script (`gsutil` ou `rclone`): backup só na VPS não vale como backup. Os
comandos de restauração estão no topo do script; teste uma restauração antes do grande dia.

## 12. Atualizar o site

```bash
site atualizar casamento   # git pull, up -d --build, migrate, atualiza o site.caddy no edge, confere a saúde
docker image prune -f      # limpa imagens antigas
```

Manual, se preferir: `cd ~/DaniGustavo && git pull && docker compose up -d --build &&
docker compose run --rm migrate`. Mudou o `deploy/site.caddy`? Rode `site atualizar casamento` (ou
`site registrar`) para o edge reler o arquivo.

Quem estiver com o site aberto durante a troca pode ver um erro ao enviar um formulário; recarregar
a página resolve (cada build tem seus próprios identificadores de Server Actions).

## Comandos úteis

```bash
docker compose logs -f web api                 # logs
docker compose exec db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
site atualizar casamento                       # depois de mudar o deploy/site.caddy
docker compose down                            # para tudo (os volumes ficam)
```

Banco no DBeaver/HeidiSQL do seu PC: descomente `127.0.0.1:3306:3306` no serviço `db`, rode
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

## Migração do Caddy próprio para o edge

Para quem já tem o site no ar com o Caddy do próprio compose (`/root/DaniGustavo`, projeto
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
