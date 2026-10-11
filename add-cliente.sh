#!/usr/bin/env bash
# Cria um cliente e gera o arquivo .conf que o app importa.
# Uso: sudo bash add-cliente.sh NOME
set -euo pipefail
[ "$EUID" -eq 0 ] || { echo "Rode como root."; exit 1; }
NOME=${1:-}
[[ "$NOME" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "Uso: sudo bash add-cliente.sh NOME (letras, números, - ou _)"; exit 1; }

REDE=10.8.0
cd /etc/wireguard
[ -f "clientes/$NOME.conf" ] && { echo "Cliente '$NOME' já existe: /etc/wireguard/clientes/$NOME.conf"; exit 1; }

# Próximo IP livre
USADOS=$(grep -oP "AllowedIPs = ${REDE//./\\.}\.\K[0-9]+" wg0.conf || true)
IP=""
for i in $(seq 2 254); do
  echo "$USADOS" | grep -qx "$i" || { IP=$i; break; }
done
[ -n "$IP" ] || { echo "Sem IPs livres."; exit 1; }

PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
PSK=$(wg genpsk)

cat >> wg0.conf <<CONF

[Peer]
# $NOME
PublicKey = $PUB
PresharedKey = $PSK
AllowedIPs = ${REDE}.${IP}/32
CONF

# Aplica sem derrubar quem já está conectado
wg set wg0 peer "$PUB" preshared-key <(echo "$PSK") allowed-ips "${REDE}.${IP}/32"

umask 077
cat > "clientes/$NOME.conf" <<CONF
[Interface]
PrivateKey = $PRIV
Address = ${REDE}.${IP}/32
DNS = 1.1.1.1, 9.9.9.9

[Peer]
PublicKey = $(cat server.pub)
PresharedKey = $PSK
Endpoint = $(cat endpoint)
# ::/0 joga o IPv6 no túnel também, evitando vazamento de IP
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
CONF

echo "Cliente criado: /etc/wireguard/clientes/$NOME.conf"
echo "Baixe no seu PC com:  scp root@SEU_IP:/etc/wireguard/clientes/$NOME.conf ."
