#!/usr/bin/env bash
# Backup do banco (mysqldump) e das fotos dos presentes (volume de uploads), com retenção local.
#
# Uso manual (na pasta do projeto, como o usuário de deploy):  ./scripts/backup-db.sh
# Cron (todo dia às 3h):  crontab -e  e adicione
#   0 3 * * * /home/deploy/casamento/scripts/backup-db.sh >> /home/deploy/casamento/backups/backup.log 2>&1
#
# Restaurar o banco (APAGA o que estiver lá e põe o backup no lugar):
#   gunzip -c backups/db-AAAAMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db \
#     sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
# Restaurar as fotos:
#   docker compose -f docker-compose.prod.yml exec -T api tar xzf - -C /data < backups/uploads-AAAAMMDD-HHMMSS.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
trap 'rm -f "$DB_FILE.tmp" "$UP_FILE.tmp"' EXIT

# Banco: --single-transaction tira uma foto consistente sem travar as tabelas (InnoDB).
# Usuário e senha vêm das variáveis do próprio container (nada de senha na linha de comando).
"${COMPOSE[@]}" exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" --single-transaction --quick --routines --triggers --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  | gzip -9 > "$DB_FILE.tmp"
# Dump sem a linha final "-- Dump completed" = interrompido no meio.
gunzip -c "$DB_FILE.tmp" | tail -n 1 | grep -q "Dump completed" || { echo "mysqldump incompleto"; exit 1; }
mv "$DB_FILE.tmp" "$DB_FILE"

# Fotos dos presentes: o volume é montado em /data/uploads no container da API.
"${COMPOSE[@]}" exec -T api tar czf - -C /data uploads > "$UP_FILE.tmp"
mv "$UP_FILE.tmp" "$UP_FILE"

find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "$(date '+%F %T') backup OK: $DB_FILE ($(du -h "$DB_FILE" | cut -f1)), $UP_FILE ($(du -h "$UP_FILE" | cut -f1))"

# Cópia para fora da VPS (um backup que só existe na VPS não vale como backup).
# Descomente a que for usar:
# gsutil cp "$DB_FILE" "$UP_FILE" gs://SEU-BUCKET/casamento/
# rclone copy "$BACKUP_DIR" remoto:casamento-backups --include "*-$STAMP.*"
