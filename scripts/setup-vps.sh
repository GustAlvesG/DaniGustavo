#!/usr/bin/env bash
# Preparação inicial de uma VPS Ubuntu/Debian para rodar o site do casamento em Docker
# (docker-compose.prod.yml). Passo a passo completo em docs/DEPLOY.md.
#
# Uso (como root, via SSH):
#   1ª vez:  bash setup-vps.sh deploy
#   Depois de confirmar que consegue entrar como "deploy" com chave SSH:
#            bash setup-vps.sh deploy --harden-ssh
#
# O que faz: atualiza o sistema, ativa atualizações automáticas de segurança,
# cria swap, instala Docker, cria o usuário de deploy, configura UFW e fail2ban
# e (opcional) desliga login por senha e login direto como root no SSH.
set -euo pipefail

USER_NAME="${1:-}"
HARDEN_SSH="no"
[[ "${2:-}" == "--harden-ssh" ]] && HARDEN_SSH="yes"

if [[ $EUID -ne 0 ]]; then echo "Rode como root."; exit 1; fi
if [[ -z "$USER_NAME" ]]; then echo "Uso: $0 <usuario> [--harden-ssh]"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
mkdir -p /run/sshd
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
SSH_PORT="${SSH_PORT:-22}"

echo "==> Atualizando o sistema"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban python3-systemd unattended-upgrades

echo "==> Atualizações automáticas de segurança"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Fuso horário"
timedatectl set-timezone America/Sao_Paulo || true

echo "==> Swap (o 'next build' e o MySQL juntos apertam VPS com pouca RAM)"
if [[ -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "    swap já existe, pulando"
fi

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker já instalado: $(docker --version)"
fi
systemctl enable --now docker

echo "==> Usuário '$USER_NAME'"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$USER_NAME"
fi
usermod -aG sudo,docker "$USER_NAME"
# Sem senha o sudo não funciona: pede uma agora (só se ainda não tiver)
if [[ "$(passwd -S "$USER_NAME" | awk '{print $2}')" != "P" ]]; then
  echo "    Defina a senha de '$USER_NAME' (usada só para o sudo):"
  passwd "$USER_NAME"
fi
# Copia as chaves SSH do root para o novo usuário (se ele ainda não tiver)
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
if [[ -s /root/.ssh/authorized_keys && ! -s "$USER_HOME/.ssh/authorized_keys" ]]; then
  install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.ssh"
  install -m 600 -o "$USER_NAME" -g "$USER_NAME" /root/.ssh/authorized_keys "$USER_HOME/.ssh/authorized_keys"
  echo "    chaves do root copiadas para $USER_HOME/.ssh/authorized_keys"
fi

echo "==> Firewall (UFW) — SSH na porta $SSH_PORT, 80 e 443"
ufw default deny incoming
ufw default allow outgoing
ufw limit "$SSH_PORT/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban (bloqueia força bruta no SSH)"
cat > /etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled  = true
port     = $SSH_PORT
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban
systemctl restart fail2ban

if [[ "$HARDEN_SSH" == "yes" ]]; then
  echo "==> Endurecendo o SSH"
  if [[ ! -s "$USER_HOME/.ssh/authorized_keys" ]]; then
    echo "!! '$USER_NAME' não tem chave em $USER_HOME/.ssh/authorized_keys."
    echo "!! Pulando o hardening para você não ficar trancado fora."
  else
    # Prefixo 00-: o sshd usa o PRIMEIRO valor que encontra, e o Ubuntu traz
    # 50-cloud-init.conf com PasswordAuthentication yes.
    cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
    if sshd -t; then
      systemctl reload ssh 2>/dev/null || systemctl reload sshd
      echo "    SSH: só chave, sem root. NÃO feche esta sessão antes de testar um login novo."
    else
      rm -f /etc/ssh/sshd_config.d/00-hardening.conf
      echo "!! Configuração do SSH inválida — alteração desfeita."
    fi
  fi
fi

cat <<EOF

Pronto.
Próximos passos (detalhes em docs/DEPLOY.md):
  1. Em outro terminal, teste:  ssh $USER_NAME@<IP_DA_VPS>
  2. Se entrou com a chave, rode de novo com --harden-ssh
  3. Como $USER_NAME:
       git clone https://github.com/GustAlvesG/DaniGustavo.git casamento && cd casamento
       cp .env.production.example .env && nano .env
       docker compose up -d --build
       docker compose run --rm migrate && docker compose run --rm setup
EOF
