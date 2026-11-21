#!/usr/bin/env bash
# Backup do banco (mysqldump) e de todos os arquivos enviados (volume de uploads: fotos dos
# eventos e dos presentes em <evento>/ e os contratos em <evento>/private/), com retenção local.
#
# Uso manual (na pasta do projeto, como o usuário de deploy):  ./scripts/backup-db.sh
# Cron: o script `site` instala (BACKUP_CMD no deploy/deploy.conf); manual: crontab -e e adicione
#   0 3 * * * /root/DaniGustavo/scripts/backup-db.sh >> /root/DaniGustavo/backups/backup.log 2>&1
#
# Variáveis (opcionais):
#   BACKUP_DIR      pasta dos arquivos (padrão ./backups)
#   RETENTION_DAYS  apaga backups mais velhos que isso (padrão 14)
#   KEEP_MIN        mas sempre guarda os N mais recentes de cada tipo, mesmo velhos (padrão 7):
#                   se o backup parar de rodar, a retenção não apaga o último que presta.
#
# Restaurar o banco (APAGA o que estiver lá e põe o backup no lugar):
#   gunzip -c backups/db-AAAAMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db \
#     sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
# Restaurar os arquivos (públicos e privados; sobrescreve os de mesmo nome):
#   docker compose -f docker-compose.prod.yml exec -T happy4ever-api tar xzf - -C /data < backups/uploads-AAAAMMDD-HHMMSS.tar.gz
#
# Os arquivos têm dados pessoais (convidados, pedidos, contratos): ficam só para o dono
# (umask 077) e a cópia para fora da VPS deve ir para um destino privado.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_MIN="${KEEP_MIN:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
trap 'rm -f "$DB_FILE.tmp" "$UP_FILE.tmp"' EXIT

# Uma execução por vez (cron atrasado + execução manual não brigam pelo mesmo arquivo).
if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.lock"
  flock -n 9 || { echo "$(date '+%F %T') outro backup em andamento; saindo."; exit 1; }
fi

# Banco: --single-transaction tira uma foto consistente sem travar as tabelas (InnoDB).
# Usuário e senha vêm das variáveis do próprio container (nada de senha na linha de comando).
"${COMPOSE[@]}" exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" --single-transaction --quick --routines --triggers --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  | gzip -9 > "$DB_FILE.tmp"
# Dump sem a linha final "-- Dump completed" = interrompido no meio.
gunzip -c "$DB_FILE.tmp" | tail -n 1 | grep -q "Dump completed" || { echo "mysqldump incompleto"; exit 1; }
mv "$DB_FILE.tmp" "$DB_FILE"

# Arquivos: o volume é montado em /data/uploads no container da API (UPLOAD_DIR). Vai a pasta
# inteira: fotos públicas de cada evento e a área privada (<evento>/private/, contratos).
"${COMPOSE[@]}" exec -T happy4ever-api tar czf - -C /data uploads > "$UP_FILE.tmp"
# Confere o arquivo antes de aceitar (gzip e tar íntegros) e conta o que entrou.
gzip -t "$UP_FILE.tmp" || { echo "backup dos arquivos corrompido"; exit 1; }
LISTING="$(tar tzf "$UP_FILE.tmp")" || { echo "backup dos arquivos ilegível"; exit 1; }
FILES_TOTAL="$(printf '%s\n' "$LISTING" | grep -vc '/$' || true)"
FILES_PRIVATE="$(printf '%s\n' "$LISTING" | grep '/private/' | grep -vc '/$' || true)"
mv "$UP_FILE.tmp" "$UP_FILE"

# Retenção: apaga os mais velhos que RETENTION_DAYS, mas nunca os KEEP_MIN mais recentes.
prune() {
  local pattern="$1"
  # Mais novo primeiro (o nome tem a data); pula os KEEP_MIN primeiros.
  find "$BACKUP_DIR" -maxdepth 1 -name "$pattern" -print | sort -r | tail -n +"$((KEEP_MIN + 1))" |
    while IFS= read -r file; do
      if [ -n "$(find "$file" -mtime +"$RETENTION_DAYS" -print)" ]; then rm -f -- "$file"; fi
    done
}
prune 'db-*.sql.gz'
prune 'uploads-*.tar.gz'

echo "$(date '+%F %T') backup OK: $DB_FILE ($(du -h "$DB_FILE" | cut -f1)), $UP_FILE ($(du -h "$UP_FILE" | cut -f1); $FILES_TOTAL arquivo(s), $FILES_PRIVATE privado(s))"

# Cópia para fora da VPS (um backup que só existe na VPS não vale como backup).
# Descomente a que for usar (destino privado: há dados pessoais):
# gsutil cp "$DB_FILE" "$UP_FILE" gs://SEU-BUCKET/casamento/
# rclone copy "$BACKUP_DIR" remoto:casamento-backups --include "*-$STAMP.*"
