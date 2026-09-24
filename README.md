# SoundBoard

Toca memes, música e efeitos de voz **no seu microfone**, para o Discord, Wardogs ou qualquer app que escute um
microfone. Você continua falando normalmente por cima.

Plano completo e roadmap: [docs/PLAN.md](docs/PLAN.md).

## Pré-requisitos

- Windows 10/11
- [Node.js](https://nodejs.org) 22.12+
- [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) (instale e reinicie o PC)

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
- **Atalhos padrão:** `F9` liga/desliga o efeito de voz, `F10` muta/desmuta o mic e `F11` para tudo. Todos podem ser
  trocados em Dispositivos.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | App em modo desenvolvimento, com hot reload |
| `npm run build` | Compila para `out/` |
| `npm start` | Roda a build compilada |
| `npm run typecheck` | Checagem de tipos |
