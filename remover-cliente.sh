#!/usr/bin/env bash
# Remove um cliente. Uso: sudo bash remover-cliente.sh NOME
set -euo pipefail
[ "$EUID" -eq 0 ] || { echo "Rode como root."; exit 1; }
NOME=${1:?Uso: sudo bash remover-cliente.sh NOME}
cd /etc/wireguard
[ -f "clientes/$NOME.conf" ] || { echo "Cliente '$NOME' não existe."; exit 1; }
PUB=$(grep -A1 "^# $NOME$" wg0.conf | grep PublicKey | awk '{print $3}')
wg set wg0 peer "$PUB" remove
# Apaga o bloco [Peer] desse cliente do wg0.conf
awk -v n="# $NOME" 'BEGIN{RS="";ORS="\n\n"} index($0,n)==0' wg0.conf > wg0.tmp && mv wg0.tmp wg0.conf
chmod 600 wg0.conf
rm "clientes/$NOME.conf"
echo "Cliente '$NOME' removido."
