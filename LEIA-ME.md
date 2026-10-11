# Minha VPN

VPN própria no estilo NordVPN: você roda os servidores (um VPS por país/cidade) e usa um app desktop para escolher o servidor e conectar com um clique. Usa o protocolo WireGuard, o mesmo do NordLynx.

```
minha-vpn/
├── servidor/   scripts para o VPS (Ubuntu)
└── app/        app desktop (Electron) para Windows e macOS
```

## 1. Montar o servidor

Contrate um VPS com Ubuntu 22.04 ou 24.04 (DigitalOcean, Vultr, Hetzner, Oracle Free Tier, etc.). Cada VPS em um país diferente vira uma "localização" no app.

No painel do provedor, libere a porta **51820 UDP** no firewall da nuvem. Depois:

```bash
scp servidor/*.sh root@IP_DO_VPS:~
ssh root@IP_DO_VPS
sudo bash setup-servidor.sh
sudo bash add-cliente.sh meu-pc
```

Baixe o arquivo do cliente para o seu computador:

```bash
scp root@IP_DO_VPS:/etc/wireguard/clientes/meu-pc.conf .
```

Para tirar o acesso de alguém: `sudo bash remover-cliente.sh NOME`.

## 2. Instalar o WireGuard no computador

O app usa o WireGuard oficial para criar o túnel.

- **Windows:** instale em https://www.wireguard.com/install
- **macOS:** `brew install wireguard-tools` (precisa do Homebrew)

## 3. Rodar o app

Precisa do Node.js 18 ou mais novo.

```bash
cd app
npm install
npm start
```

No app, clique em **Adicionar**, escolha o `meu-pc.conf`, dê um nome (ex.: "São Paulo") e clique em **Conectar**. O sistema pede permissão de administrador (UAC no Windows, senha no Mac), porque criar uma interface de rede exige isso.

Quando conectar, o IP mostrado embaixo do botão passa a ser o do VPS.

## 4. Gerar o instalador

```bash
npm run dist:win   # gera .exe em app/dist (rode no Windows)
npm run dist:mac   # gera .dmg em app/dist (rode no Mac)
```

## Como funciona

- O servidor encaminha todo o tráfego do túnel para a internet (NAT) e usa chave pré-compartilhada além das chaves pública/privada.
- O cliente manda todo o tráfego IPv4 e IPv6 pelo túnel (`AllowedIPs = 0.0.0.0/0, ::/0`) e usa DNS 1.1.1.1 / 9.9.9.9, evitando vazamento de DNS e de IPv6.
- No Windows o app instala o túnel como serviço do WireGuard; no Mac usa `wg-quick`.
- Fechando o app com a VPN ligada, ele pergunta se você quer desconectar ou manter ligada.

## Ideias para evoluir

- Kill switch (bloquear a internet se o túnel cair).
- Ícone na bandeja do sistema.
- API no servidor para criar clientes automaticamente, com login, em vez de copiar o `.conf` na mão.
- Medir o ping de cada servidor e escolher o mais rápido.
