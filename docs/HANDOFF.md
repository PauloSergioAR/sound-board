# Handoff — SoundBoard

Estado em **24/09/2026**, versão `0.5.0`, último commit `9605f52` em `main` (sincronizado com
[origin](https://github.com/PauloSergioAR/sound-board)). Para o *porquê* das decisões de arquitetura, veja
[PLAN.md](PLAN.md); este arquivo é o "onde paramos e como continuar".

## O que o app é
Soundboard para Windows que toca **sons, música e efeitos de voz dentro do microfone**. Tudo é mixado no app e
entregue no **VB-Cable** (`CABLE Input`); o Discord e o Wardogs usam `CABLE Output` como microfone. É uso pessoal:
o dono é Paulo, que usa com amigos no Discord e no Wardogs.

## O que já existe
| Área | Funcionalidades |
|---|---|
| **Pads** | categorias, busca, importar/arrastar, editor (nome, atalho global, volume, cor, categoria), modos sobrepor/reiniciar/um por vez, botão "Parar" no pad tocando |
| **Voz** | mic com mute (F10), 7 presets (grave, fina, robô, rádio, megafone, caverna, eco longo), tom/eco/reverb, F9 liga/desliga, "Me ouvir" no topo |
| **Música** | aba com playlists (criar, renomear, reordenar arrastando, embaralhar, repetir), crossfade, **ducking** (música abaixa quando você fala) com calibração, F7/F8 |
| **Navegador** | webview (YouTube, MyInstants…) com áudio capturado e roteado para Música/Efeitos/só fone; replay de 30 s → recorte vira pad; botão "+ Pad" em cada som do MyInstants; downloads de áudio viram pad; login do Google via disfarce (ver Pendências) |
| **Barra inferior** | só aparece quando algo toca: deck ou navegador (miniatura/título/canal do YouTube, play/pause, posição, volume) |
| **Mixer** | Voz, Efeitos, Música, Master (com limitador), Monitor; PARAR TUDO (F11) para pads, música e mídia do navegador |
| **Dispositivos** | escolha de mic/saída/monitor, avisos (CABLE como padrão do Windows, Bluetooth Hands-Free, loop), checklist do Discord, atalhos editáveis, **instalar VB-Cable** com um clique |
| **Celular** | servidor local opcional + QR code com token; página com abas Pads/Voz, Parar tudo, mic, efeito, música; estado ao vivo |
| **Instalador** | `npm run dist` → `dist/installer/SoundBoardSetup.exe` (Squirrel, estilo Discord, animação, atalhos, desinstalação) |

## Rodar e gerar
```bash
npm install
npm run dev          # desenvolvimento com hot reload
npm run typecheck    # tsc --noEmit
npm run dist         # instalador em dist/installer/
npm run assets       # regenera build/icon.ico e build/install-spinner.gif a partir do logo
```
Dados do usuário: `%APPDATA%\soundboard\settings.json` e `%APPDATA%\soundboard\sounds\`.

## Mapa do código
```
src/main/                processo principal (Node)
  index.ts               janela, IPC, permissões, instância única, eventos do Squirrel
  settings.ts            settings.json (escrita atômica)
  library.ts             pasta de sons (importar, salvar, ler, apagar, nomes únicos)
  media.ts               protocolo sb-media:// (streaming de músicas com Range + CORS)
  hotkeys.ts             atalhos globais
  browser.ts             webview: partição, segurança, downloads→pad, "+ Pad" do MyInstants,
                         captura de áudio (getDisplayMedia), info/controle da mídia, pausar mídia
  disguise.ts            faz o webview parecer um Chrome comum (login Google) — ver Pendências
  vbcable.ts             baixa o pacote oficial, confere assinatura, instala elevado
  squirrel.ts            atalhos na instalação/desinstalação
  remote/server.ts       servidor HTTP+SSE do controle pelo celular (token, ações permitidas)
  remote/page.html       página do celular (importada com ?raw; CSP com nonce)
src/preload/index.ts     window.api (única ponte renderer ↔ main)
src/shared/              tipos (Settings etc.) e defaults/migrações (withDefaults)
src/renderer/src/
  App.tsx                estado global, efeitos que aplicam settings no engine, atalhos/ações
  audio/engine.ts        grafo Web Audio inteiro (ver diagrama no topo do arquivo)
  audio/voiceFx.ts       cadeia de efeitos de voz; presets.ts = presets
  audio/*.worklet.ts     pitch (WSOLA), ducker (sidechain), replay (buffer de 30 s)
  audio/deck.ts          player de playlists (dois <audio>, crossfade)
  audio/browserMedia.ts  store do "tocando agora" do navegador (polling 1 s)
  components/            telas e peças de UI
```
Toda ação vinda de atalho global **ou do celular** passa pelo mesmo handler, `window.api.onHotkey` em `App.tsx`.
Para uma ação nova no celular, ela também precisa entrar no regex `ACTION` de `remote/server.ts`.

## Como testar (técnicas que funcionaram)
Os testes foram feitos dirigindo o app pelo **DevTools Protocol**, sem framework de testes no repositório:
- **Instância isolada:** `electron.exe . --remote-debugging-port=9333 --user-data-dir=<pasta temporária>`, sem
  mexer nos dados reais do usuário.
- **Script Node:** um script conecta no WebSocket de `http://127.0.0.1:9333/json` e roda `Runtime.evaluate` e
  `Page.captureScreenshot`. O alvo `type: 'webview'` é o navegador embutido.
- **Medir o que o Discord recebe:** uma segunda instância mínima do Electron grava o `CABLE Output` com
  `getUserMedia` e acha o pico com um `AnalyserNode` (tons de teste de 220/330/440/550 Hz).
- **Microfone falso:** `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=tom.wav`. Esse modo
  também troca as **saídas** por falsas, então nele meça pelo `window.__engine` (exposto só em `npm run dev`).
- **Celular sem aviso do firewall:** `SOUNDBOARD_REMOTE_HOST=127.0.0.1` liga o servidor só no loopback. A página
  pode ser vista no navegador lateral do Claude em modo mobile.
- **Pitch sem o app:** o worklet foi testado em Node com esbuild e um shim de `registerProcessor`.

## Armadilhas conhecidas
- **PowerShell corrompe UTF-8:** `Get-Content`/`Set-Content` estraga acentos e os `──` dos comentários. Edite
  arquivos com ferramentas de edição ou com Node.
- **Tecla Pause:** o Electron não aceita Pause como atalho global (por isso F11), e `globalShortcut` não avisa
  quando a tecla é solta (não dá para "segurar para efeito").
- **Webview:** não pode ficar `display:none` nem `visibility:hidden`, senão a captura de áudio trava; fora da aba
  ele fica atrás das outras telas. A captura por `chromeMediaSource: 'tab'` é negada no Electron 44, por isso
  `getDisplayMedia` + `setDisplayMediaRequestHandler`.
- **MyInstants:**
  - o site recria seus elementos depois de carregar, então o "+ Pad" usa delegação de evento;
  - o link "Baixar MP3" tem `target=_blank`, então links de áudio não abrem janela e há deduplicação de downloads;
  - os anúncios em vídeo tocam mudos; mídia muda é ignorada no "tocando agora".
- **Bluetooth:** usar o microfone do fone BT força o modo Hands-Free e piora tudo o que se ouve. A recomendação
  é usar outro microfone e deixar o fone só para ouvir.
- **Latência do VB-Cable:** ~150 ms por padrão; dá para reduzir no `VBCABLE_ControlPanel`.
- **Instalador sem assinatura de código:** o SmartScreen avisa ("Mais informações → Executar assim mesmo").
- **Commits pelo Claude Code:** o classificador de segurança já bloqueou um commit e um build (o do disfarce).
  O email de commit **deste repositório** é `paulo.sergio.ar@gmail.com` (config local; o global é o do trabalho).

## Pendências e ideias
**Antes de tornar público** (também registrado na memória do Claude):
- **Login do Google no webview:** trocar o disfarce (`disguise.ts`) por um caminho oficial. As opções são OAuth +
  YouTube Data API + player IFrame, um Chrome dedicado capturado por WASAPI process loopback, ou a API de
  metadata de UA do Electron (PR electron/electron#53519).
- **VB-Cable:** só é baixado do site oficial; empacotar exigiria licença da VB-Audio.

**Ideias levantadas e ainda não feitas:**
- **Chrome dedicado com captura por processo:** addon/helper nativo em Rust (`wasapi` crate,
  `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`). Precisa instalar Rust e as VS Build Tools.
- **"Segurar tecla" para efeito de voz:** hook de teclado nativo.
- **Bloqueador de anúncios no navegador embutido.**
- **Modo mini sempre no topo, bandeja do sistema, auto-update** (Squirrel já suporta; publicar em GitHub Releases).
- **Alerta automático quando a entrada for um microfone Bluetooth** (o usuário dispensou por ora).
- **Testar com hardware real:** fala humana nos efeitos e no ducking, celular de verdade no controle remoto,
  instalação do VB-Cable num PC sem ele.
- **`docs/PLAN.md`:** a tabela de fases está um pouco atrás das últimas funcionalidades (aba Música, celular,
  barra); vale atualizar junto com a próxima mudança.
