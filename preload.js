const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vpn', {
  info: () => ipcRenderer.invoke('info'),
  listar: () => ipcRenderer.invoke('listar'),
  escolherArquivo: () => ipcRenderer.invoke('escolher-arquivo'),
  salvarServidor: (dados) => ipcRenderer.invoke('salvar-servidor', dados),
  removerServidor: (id) => ipcRenderer.invoke('remover-servidor', id),
  conectar: (id) => ipcRenderer.invoke('conectar', id),
  desconectar: () => ipcRenderer.invoke('desconectar'),
  meuIp: () => ipcRenderer.invoke('meu-ip'),
});
