#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 && ${SUDO_USER:-} == deploy ]] || { echo 'Run with sudo from deploy SSH session' >&2; exit 1; }
[[ $(id -u deploy) == 1000 && -n ${SSH_CONNECTION:-} && -s /home/deploy/.ssh/authorized_keys ]] || { echo 'Test UID-1000 deploy key login before hardening' >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Ubuntu 24.04 required' >&2; exit 1; }
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades chrony restic rsync
install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-stella.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
sshd -t
# Retain the server's existing SSH port; do not assume 22 if the operator changed it.
ssh_port=$(sshd -T | awk '$1=="port" {print $2; exit}')
ufw allow "$ssh_port/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
cat > /etc/apt/apt.conf.d/52stella-security <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
CONF
systemctl enable --now fail2ban chrony
systemctl reload ssh
install -d -o deploy -g deploy -m 700 /srv/stella
echo 'SSH/firewall/security updates/time sync configured. Keep this session open; test a second key login.'
