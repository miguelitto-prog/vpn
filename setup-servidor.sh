#!/usr/bin/env bash
# Instala e configura um servidor WireGuard num VPS Ubuntu 22.04/24.04.
# Uso: sudo bash setup-servidor.sh
set -euo pipefail
[ "$EUID" -eq 0 ] || { echo "Rode como root: sudo bash setup-servidor.sh"; exit 1; }

PORTA=${PORTA:-51820}
REDE=10.8.0

apt-get update -y
apt-get install -y wireguard iptables curl qrencode

IFACE=$(ip route show default | awk '{print $5; exit}')
IP_PUBLICO=$(curl -4 -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')

mkdir -p /etc/wireguard/clientes
chmod 700 /etc/wireguard
cd /etc/wireguard

if [ ! -f server.key ]; then
  umask 077
  wg genkey | tee server.key | wg pubkey > server.pub
fi
echo "${IP_PUBLICO}:${PORTA}" > endpoint

if [ ! -f wg0.conf ]; then
cat > wg0.conf <<CONF
[Interface]
Address = ${REDE}.1/24
ListenPort = ${PORTA}
PrivateKey = $(cat server.key)
PostUp = iptables -t nat -A POSTROUTING -s ${REDE}.0/24 -o ${IFACE} -j MASQUERADE; iptables -I FORWARD -i wg0 -j ACCEPT; iptables -I FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s ${REDE}.0/24 -o ${IFACE} -j MASQUERADE; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT
CONF
chmod 600 wg0.conf
fi

# Liga o roteamento de pacotes
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl --system >/dev/null

# Libera a porta no ufw, se estiver ativo
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow ${PORTA}/udp
fi

systemctl enable --now wg-quick@wg0

echo
echo "Servidor pronto em ${IP_PUBLICO}:${PORTA}/udp"
echo "Agora crie um cliente:  sudo bash add-cliente.sh meu-pc"
