const $ = (id) => document.getElementById(id);
const limparErro = (e) => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

let servidores = [];
let selecionado = null;
let conexao = null;
let relogio = null;

function definirEstado(estado) {
  document.body.dataset.estado = estado;
  const botao = $('botao');
  botao.disabled = estado === 'ligando';
  $('botaoTexto').textContent = { off: 'Conectar', ligando: 'Conectando…', on: 'Desconectar' }[estado];
  $('status').textContent = { off: 'Desprotegido', ligando: 'Conectando', on: 'Protegido' }[estado];
}

function aviso(texto) {
  $('aviso').textContent = texto || '';
  $('aviso').hidden = !texto;
}

async function atualizarIp() {
  $('detalhe').textContent = 'Buscando seu IP…';
  const info = await window.vpn.meuIp();
  if (!info) { $('detalhe').textContent = 'Sem conexão com a internet'; return; }
  const lugar = [info.cidade, info.pais].filter(Boolean).join(', ');
  $('detalhe').textContent = lugar ? `IP ${info.ip} · ${lugar}` : `IP ${info.ip}`;
}

function iniciarRelogio() {
  clearInterval(relogio);
  $('tempo').hidden = !conexao;
  if (!conexao) return;
  const tick = () => {
    const s = Math.floor((Date.now() - conexao.desde) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('tempo').textContent = `Conectado há ${hh}:${mm}:${ss}`;
  };
  tick();
  relogio = setInterval(tick, 1000);
}

function desenharLista() {
  const ul = $('lista');
  ul.replaceChildren();
  $('vazio').hidden = servidores.length > 0;
  for (const s of servidores) {
    const li = document.createElement('li');

    const b = document.createElement('button');
    b.className = 'servidor';
    b.setAttribute('aria-pressed', String(s.id === selecionado));
    const ponto = document.createElement('span'); ponto.className = 'ponto';
    const nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = s.nome;
    const local = document.createElement('span'); local.className = 'local';
    local.textContent = conexao && conexao.id === s.id ? 'Em uso agora' : (s.local || ' ');
    b.append(ponto, nome, local);
    b.onclick = () => trocarServidor(s.id);

    const x = document.createElement('button');
    x.className = 'remover';
    x.title = `Remover ${s.nome}`;
    x.setAttribute('aria-label', `Remover ${s.nome}`);
    x.textContent = '×';
    x.onclick = async () => {
      if (!confirm(`Remover o servidor "${s.nome}"?`)) return;
      try {
        servidores = await window.vpn.removerServidor(s.id);
        if (selecionado === s.id) selecionado = servidores[0] ? servidores[0].id : null;
        desenharLista();
      } catch (e) { aviso(limparErro(e)); }
    };

    li.append(b, x);
    ul.append(li);
  }
}

async function conectar() {
  if (!selecionado) { aviso('Adicione um servidor primeiro.'); return; }
  aviso('');
  definirEstado('ligando');
  try {
    conexao = await window.vpn.conectar(selecionado);
    definirEstado('on');
  } catch (e) {
    conexao = null;
    definirEstado('off');
    aviso(limparErro(e));
  }
  iniciarRelogio();
  desenharLista();
  atualizarIp();
}

async function desconectar() {
  aviso('');
  definirEstado('ligando');
  try {
    await window.vpn.desconectar();
    conexao = null;
    definirEstado('off');
  } catch (e) {
    definirEstado('on');
    aviso(limparErro(e));
  }
  iniciarRelogio();
  desenharLista();
  atualizarIp();
}

async function trocarServidor(id) {
  selecionado = id;
  desenharLista();
  if (conexao && conexao.id !== id) await conectar();
}

$('botao').onclick = () => (conexao ? desconectar() : conectar());

$('adicionar').onclick = async () => {
  aviso('');
  try {
    const r = await window.vpn.escolherArquivo();
    if (!r) return;
    $('endpoint').textContent = r.endpoint ? `Servidor ${r.endpoint}` : '';
    $('campoNome').value = r.sugestao;
    $('campoLocal').value = '';
    $('erroModal').hidden = true;
    $('modal').showModal();
    $('campoNome').select();
  } catch (e) { aviso(limparErro(e)); }
};

$('form').addEventListener('submit', async (ev) => {
  if (ev.submitter && ev.submitter.value !== 'salvar') return;
  ev.preventDefault();
  try {
    servidores = await window.vpn.salvarServidor({ nome: $('campoNome').value, local: $('campoLocal').value });
    selecionado = servidores[servidores.length - 1].id;
    $('modal').close();
    desenharLista();
  } catch (e) {
    $('erroModal').textContent = limparErro(e);
    $('erroModal').hidden = false;
  }
});

(async function iniciar() {
  const info = await window.vpn.info();
  if (!info.wireguard) {
    aviso(info.plataforma === 'darwin'
      ? 'Instale o WireGuard antes de conectar: no Terminal, rode "brew install wireguard-tools".'
      : 'Instale o WireGuard antes de conectar: baixe em wireguard.com/install.');
  }
  servidores = await window.vpn.listar();
  conexao = info.conexao;
  selecionado = conexao ? conexao.id : (servidores[0] ? servidores[0].id : null);
  definirEstado(conexao ? 'on' : 'off');
  iniciarRelogio();
  desenharLista();
  atualizarIp();
})();
