# Plano do SoundBoard

Soundboard para tocar memes, música e efeitos de voz **dentro do microfone**: no Discord, no Wardogs, em qualquer app
que escute um microfone. A ideia é o estilo "DJ Wagner": tocar música e falar por cima.

Esboço visual: [canvas no Claude Design](https://claude.ai/artifact/QJwyUgQu6hTm43c9eVRTFH).

## Como o áudio chega no microfone

O Windows não deixa um programa comum escrever direto num microfone. Usamos um **cabo de áudio virtual**
([VB-Audio Virtual Cable](https://vb-audio.com/Cable/), gratuito):

```
 Mic real ──► [efeitos de voz] ──┐
 Pads (memes) ───────────────────┼──► MIXER ──► "CABLE Input"  (alto-falante virtual)
 Música / navegador ─────────────┘                     │  (o driver liga um no outro)
                                                       ▼
 Discord / Wardogs usam como microfone ◄── "CABLE Output" (microfone virtual)

 Em paralelo: MIXER ──► seu fone (monitor)
```

O app faz toda a mixagem; o cabo é só o "tubo". Escrever um driver próprio exigiria assinatura EV e atestação da
Microsoft, o que é inviável.

## Stack

**Electron + TypeScript + React (electron-vite)**, com o motor de áudio em **Web Audio API**.

- `AudioContext.setSinkId()` escolhe o dispositivo de saída: um contexto para o CABLE e outro para o fone.
- O `<webview>` embutido (fase 4) roda no mesmo Chromium, então o áudio do YouTube entra no mesmo grafo.
- `globalShortcut` dá atalhos que funcionam com o jogo em foco.
- Onde o JS não alcança, um addon nativo em Rust via **napi-rs**: captura de áudio de outro processo (WASAPI process
  loopback) e hook de teclado de baixo nível, se necessário.

Tauri/Rust teria menos latência e RAM, mas o Discord já soma 100–200 ms de rede, e a integração com o navegador
embutido é bem mais simples no Electron.

## Arquitetura

```
src/
  main/       processo principal: janela, settings.json, biblioteca de sons, atalhos globais
  preload/    ponte segura (contextBridge) → window.api
  renderer/   UI React + motor de áudio (src/audio/engine.ts)
  shared/     tipos e padrões usados pelos dois lados
```

Grafo do motor (`engine.ts`):

```
mic ─► micGate ─► voiceFx ─► voice ─┬──────────► master ─► limiter ─► CABLE Input
pads ─────────────────────► sfx ────┼──────────►
                                     └► monitor ─► [MediaStream] ─► seu fone
voice ─► monitorVoice (liga/desliga) ─► monitor
```

- O processamento de voz do navegador (eco, ruído, AGC) fica desligado, porque ele corta música e efeitos.
- Um limitador no master evita estourar do outro lado.
- Enquanto nenhuma saída foi escolhida, o master vai para `{ type: 'none' }`, para sua voz nunca vazar nas caixas.
- Os sons ficam copiados em `%APPDATA%/soundboard/sounds`, e as configurações em `%APPDATA%/soundboard/settings.json`.

## Fases

| Fase | Entrega | Status |
|---|---|---|
| 0. Validação | VB-Cable instalado, Discord/Wardogs com CABLE Output como microfone | ✅ driver instalado |
| 1. MVP | Mic → CABLE, grade de pads, categorias, importar/arrastar sons, editor de pad, dispositivos, monitor, mixer, atalhos globais, parar tudo | ✅ |
| 2. Efeitos de voz | Presets (grave, fina, robô, rádio, megafone, caverna, eco), tom/eco/reverb em tempo real, "segurar para robô" | |
| 3. Deck de música | Fila de arquivos locais, play/pause/próxima, crossfade, **ducking** (música abaixa quando você fala) | |
| 4. Navegador | Webview com YouTube/MyInstants roteado para o canal Música, recortar trecho → pad, adicionar à fila | |
| 5. Extras | Capturar áudio do Chrome/Spotify externo (addon nativo), perfis, modo mini sempre no topo, bandeja, instalador | |

## Cuidados práticos

- **Discord:** desligar a supressão de ruído (Krisp), o cancelamento de eco e o ganho automático. Preferir detecção
  de voz com sensibilidade baixa; com push-to-talk, os sons só saem com a tecla pressionada.
- **Saída padrão do Windows:** o instalador do VB-Cable costuma virar a saída padrão. Volte para o fone, senão o som
  do PC inteiro vai para o microfone (o app avisa na tela Dispositivos).
- **Bluetooth:** usar o microfone de um fone BT ativa o modo Hands-Free (qualidade de telefone). Prefira dongle USB
  ou o mic da placa-mãe.
- **Latência do cabo:** o VB-Cable vem com um buffer grande (~150 ms). Dá para reduzir em
  `VBCABLE_ControlPanel.exe` → *Options* → *Max Latency*.
- **Tecla Pause:** o Electron não consegue registrar Pause como atalho global, por isso "Parar tudo" usa F11.
- **Atalhos globais consomem a tecla:** com F1 ligado a um pad, o jogo não recebe o F1.
