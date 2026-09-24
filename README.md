# SoundBoard

Toca memes, música e efeitos de voz **no seu microfone**, para o Discord, Wardogs ou qualquer app que escute um
microfone. Você continua falando normalmente por cima.

Plano completo e roadmap: [docs/PLAN.md](docs/PLAN.md).

## Pré-requisitos

- Windows 10/11
- [Node.js](https://nodejs.org) 22.12+
- [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) (instale e reinicie o PC)

## Instalador

```bash
npm run dist
```

Isso gera `dist/installer/SoundBoardSetup.exe`, um instalador no estilo do Discord (Squirrel.Windows):
- mostra só uma animação enquanto instala, sem assistente e sem pedir administrador;
- instala em `%LocalAppData%\SoundBoard`, cria atalhos na área de trabalho e no menu Iniciar e abre o app no fim;
- aparece em "Apps instalados" para desinstalar. As configurações e os sons em `%APPDATA%\soundboard` são mantidos.

O **VB-Cable** não vai dentro do instalador, porque redistribuí-lo exige licença da VB-Audio. Quando ele falta, a tela
Dispositivos mostra **Instalar VB-Cable**: o app baixa o pacote oficial de vb-audio.com, confere a assinatura digital
(Vincent Burel) e instala com uma permissão do Windows. O VB-Cable é doação: considere apoiar a VB-Audio.

O ícone e a animação do instalador saem do logo, via `npm run assets` (geram `build/`).

## Rodando

```bash
npm install
npm run dev
```

Na primeira vez, o Electron baixa o próprio binário.

## Configuração

1. Abra a aba **Dispositivos** e confira:
   - **Entrada:** seu microfone real
   - **Enviar para:** `CABLE Input`
   - **Monitor:** seu fone
2. No Discord, em Configurações de voz, use `CABLE Output` como dispositivo de entrada e desligue Krisp, cancelamento de
   eco e ganho automático.
3. No Wardogs, escolha `CABLE Output` como microfone. Se o jogo não tiver essa opção, defina o `CABLE Output` como
   microfone padrão do Windows.

## Uso

- **Importar sons:** arraste arquivos de áudio para a grade ou use **Importar** (mp3, wav, ogg, flac, m4a…).
- **Clique** num pad para tocar; **clique direito** para editar nome, atalho global, volume, cor e categoria.
- **Efeitos de voz:** no painel "Sua voz", escolha um preset (Grave, Fina, Robô, Rádio, Megafone, Caverna, Eco longo) e
  ajuste tom, eco e reverb. Marque "Me ouvir no fone" para ouvir o resultado.
- **Música:** a aba Música tem **playlists**: crie, renomeie (clique duplo), arraste arquivos para adicionar, arraste
  faixas para reordenar, embaralhe e ligue o "repetir". Os arquivos tocam do lugar original, sem cópia. A barra acima
  do mixer é um mini player que aparece em todas as telas. O **crossfade** mistura o fim de uma faixa com o começo da
  próxima, e o **ducking** abaixa a música enquanto você fala. Calibre a sensibilidade em Dispositivos → Ducking da
  música.
- **MyInstants:** na aba Navegador, cada som das listas do MyInstants ganha um botão **"+ Pad"**, que já cria o pad com
  o nome do som na categoria atual. Na página de um som, o "Baixar MP3" faz o mesmo.
- **Navegador:** a aba Navegador abre YouTube, MyInstants e qualquer site. O som da página entra no mixer, no canal
  Música (com ducking), no canal Efeitos ou só no seu fone. Ele continua tocando quando você volta para os pads.
  - **Recortar:** o app guarda sempre os últimos 30 s do navegador. Em "Recortar últimos 30 s", arraste sobre a onda
    para escolher o trecho, ouça no fone e salve como pad.
  - **Downloads:** arquivos de áudio baixados no navegador (o botão de download do MyInstants, por exemplo) viram pad
    na categoria atual.
- **Controle pelo celular:** clique em **Celular** no topo, ative e aponte a câmera para o QR code. O celular precisa
  estar no mesmo Wi-Fi. A página mostra os pads por categoria, com Parar tudo, mic, efeito de voz e música, e acende
  o pad que está tocando. O link tem uma chave secreta: sem ela o servidor nem responde. "Gerar novo link" desconecta
  quem tiver o antigo. Na primeira vez, permita o SoundBoard em redes privadas no aviso do Firewall do Windows.
- **Atalhos padrão:** `F7` toca/pausa a música, `F8` pula para a próxima, `F9` liga/desliga o efeito de voz, `F10`
  muta/desmuta o mic e `F11` para tudo (sons e música). Todos podem ser trocados em Dispositivos.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | App em modo desenvolvimento, com hot reload |
| `npm run build` | Compila para `out/` |
| `npm start` | Roda a build compilada |
| `npm run typecheck` | Checagem de tipos |
