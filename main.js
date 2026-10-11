const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const TUNEL = 'minhavpn0';
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const WG_WIN = 'C:\\Program Files\\WireGuard\\wireguard.exe';
const WG_MAC = ['/opt/homebrew/bin/wg-quick', '/usr/local/bin/wg-quick'];

let janela;
let conexao = null;   // { id, desde }
let pendente = null;  // arquivo escolhido aguardando nome

const pasta = () => path.join(app.getPath('userData'), 'servidores');
const listaPath = () => path.join(pasta(), 'servidores.json');
const tunelPath = () => path.join(app.getPath('userData'), `${TUNEL}.conf`);
const ultimoPath = () => path.join(app.getPath('userData'), 'ultimo.json');

function lerLista() {
  try { return JSON.parse(fs.readFileSync(listaPath(), 'utf8')); } catch { return []; }
}
function salvarLista(lista) {
  fs.mkdirSync(pasta(), { recursive: true });
  fs.writeFileSync(listaPath(), JSON.stringify(lista, null, 2));
}

function executar(cmd, args) {
  return new Promise((ok, falha) => {
    execFile(cmd, args, { windowsHide: true }, (err, out, errOut) => {
      if (err) falha(new Error(String(errOut || err.message).trim()));
      else ok(String(out));
    });
  });
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function wireguardInstalado() {
  if (isWin) return fs.existsSync(WG_WIN);
  if (isMac) return WG_MAC.some((p) => fs.existsSync(p));
  return false;
}

function validarConf(texto) {
  const ok = /\[Interface\]/i.test(texto) && /\[Peer\]/i.test(texto) &&
             /PrivateKey\s*=/.test(texto) && /Endpoint\s*=/.test(texto);
  if (!ok) throw new Error('Esse arquivo não é uma configuração WireGuard válida (faltam [Interface], [Peer], PrivateKey ou Endpoint).');
}

function enderecoTunel() {
  try {
    const m = fs.readFileSync(tunelPath(), 'utf8').match(/Address\s*=\s*([0-9.]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

/* ---------- macOS: wg-quick com senha de administrador ---------- */
const shAspas = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
async function macComoAdmin(cmd) {
  const comPath = `export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; ${cmd}`;
  const script = `do shell script "${comPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with administrator privileges`;
  try { await executar('osascript', ['-e', script]); }
  catch (e) {
    if (/cancel/i.test(e.message)) throw new Error('Você cancelou o pedido de senha.');
    throw e;
  }
}
async function macTunelAtivo() {
  const ip = enderecoTunel();
  if (!ip) return false;
  const out = await executar('ifconfig', []).catch(() => '');
  return out.includes(`inet ${ip} `);
}

/* ---------- Windows: serviço de túnel do WireGuard (UAC) ---------- */
const psAspas = (s) => `'${s.replace(/'/g, "''")}'`;
async function winComoAdmin(scriptInterno) {
  const b64 = Buffer.from(scriptInterno, 'utf16le').toString('base64');
  const externo = `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden ` +
    `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${b64}'`;
  try { await executar('powershell.exe', ['-NoProfile', '-Command', externo]); }
  catch (e) {
    if (/cancel/i.test(e.message)) throw new Error('Você recusou o pedido de administrador.');
    throw e;
  }
}
async function winTunelAtivo() {
  const out = await executar('sc.exe', ['query', `WireGuardTunnel$${TUNEL}`]).catch(() => '');
  return out.includes('RUNNING');
}

/* ---------- Conectar / desconectar ---------- */
const tunelAtivo = () => (isWin ? winTunelAtivo() : macTunelAtivo());

async function esperarAtivo(segundos) {
  for (let i = 0; i < segundos * 2; i++) {
    if (await tunelAtivo()) return true;
    await pausa(500);
  }
  return false;
}

async function subirTunel() {
  if (isWin) {
    const wg = psAspas(WG_WIN);
    const conf = psAspas(`"${tunelPath()}"`);
    await winComoAdmin(
      `Start-Process -FilePath ${wg} -ArgumentList '/uninstalltunnelservice','${TUNEL}' -Wait -ErrorAction SilentlyContinue; ` +
      `Start-Sleep -Seconds 1; ` +
      `Start-Process -FilePath ${wg} -ArgumentList '/installtunnelservice',${conf} -Wait`
    );
  } else {
    const c = shAspas(tunelPath());
    await macComoAdmin(`wg-quick down ${c} >/dev/null 2>&1; wg-quick up ${c}`);
  }
}

async function derrubarTunel() {
  if (isWin) {
    await winComoAdmin(`Start-Process -FilePath ${psAspas(WG_WIN)} -ArgumentList '/uninstalltunnelservice','${TUNEL}' -Wait`);
  } else {
    await macComoAdmin(`wg-quick down ${shAspas(tunelPath())}`);
  }
}

ipcMain.handle('info', async () => ({
  plataforma: process.platform,
  wireguard: wireguardInstalado(),
  conexao,
}));

ipcMain.handle('listar', () => lerLista());

ipcMain.handle('escolher-arquivo', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha o arquivo .conf do servidor',
    filters: [{ name: 'Configuração WireGuard', extensions: ['conf'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return null;
  const texto = fs.readFileSync(r.filePaths[0], 'utf8');
  validarConf(texto);
  pendente = texto;
  const endpoint = (texto.match(/Endpoint\s*=\s*(.+)/) || [])[1];
  return { sugestao: path.basename(r.filePaths[0], '.conf'), endpoint: endpoint ? endpoint.trim() : '' };
});

ipcMain.handle('salvar-servidor', (_e, { nome, local }) => {
  if (!pendente) throw new Error('Escolha um arquivo primeiro.');
  if (!nome || !nome.trim()) throw new Error('Dê um nome ao servidor.');
  const id = Date.now().toString(36);
  fs.mkdirSync(pasta(), { recursive: true });
  fs.writeFileSync(path.join(pasta(), `${id}.conf`), pendente, { mode: 0o600 });
  pendente = null;
  const lista = lerLista();
  lista.push({ id, nome: nome.trim(), local: (local || '').trim() });
  salvarLista(lista);
  return lista;
});

ipcMain.handle('remover-servidor', (_e, id) => {
  if (conexao && conexao.id === id) throw new Error('Desconecte antes de remover este servidor.');
  fs.rmSync(path.join(pasta(), `${id}.conf`), { force: true });
  const lista = lerLista().filter((s) => s.id !== id);
  salvarLista(lista);
  return lista;
});

ipcMain.handle('conectar', async (_e, id) => {
  if (!wireguardInstalado()) throw new Error('WireGuard não encontrado neste computador.');
  const s = lerLista().find((x) => x.id === id);
  if (!s) throw new Error('Servidor não encontrado.');
  fs.copyFileSync(path.join(pasta(), `${id}.conf`), tunelPath());
  fs.chmodSync(tunelPath(), 0o600);
  await subirTunel();
  if (!(await esperarAtivo(10))) throw new Error('O túnel não subiu. Confira se a porta UDP do servidor está liberada.');
  conexao = { id, desde: Date.now() };
  fs.writeFileSync(ultimoPath(), JSON.stringify(conexao));
  return conexao;
});

ipcMain.handle('desconectar', async () => {
  await derrubarTunel();
  conexao = null;
  fs.rmSync(ultimoPath(), { force: true });
  return null;
});

ipcMain.handle('meu-ip', async () => {
  try {
    const r = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.success === false) throw new Error();
    return { ip: j.ip, cidade: j.city, pais: j.country };
  } catch {
    try {
      const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(6000) });
      return { ip: (await r.json()).ip };
    } catch { return null; }
  }
});

/* ---------- Janela ---------- */
function criarJanela() {
  janela = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 380,
    minHeight: 600,
    title: 'Minha VPN',
    backgroundColor: '#0E2433',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.loadFile(path.join(__dirname, 'ui', 'index.html'));

  janela.on('close', (e) => {
    if (!conexao) return;
    const r = dialog.showMessageBoxSync(janela, {
      type: 'question',
      buttons: ['Desconectar e sair', 'Sair e manter a VPN ligada', 'Cancelar'],
      defaultId: 0, cancelId: 2,
      message: 'A VPN ainda está ligada.',
    });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) {
      e.preventDefault();
      derrubarTunel().catch(() => {}).finally(() => { conexao = null; janela.destroy(); });
    }
  });
}

app.whenReady().then(async () => {
  // Recupera uma conexão que ficou ligada de uma sessão anterior
  try {
    const ultimo = JSON.parse(fs.readFileSync(ultimoPath(), 'utf8'));
    if (await tunelAtivo()) conexao = ultimo;
  } catch {}
  criarJanela();
});
app.on('window-all-closed', () => app.quit());
