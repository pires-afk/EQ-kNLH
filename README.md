# EQ KNLH — protótipo web 0.1

Primeiro protótipo de um visualizador remoto pelo navegador. A pessoa que compartilha abre o link de compartilhamento e precisa tocar em **PERMITIR E COMPARTILHAR** e aceitar a solicitação nativa do navegador. A outra pessoa abre o link de visualização.

## O que já está implementado
- Interface escura EQ KNLH.
- Criação de sessão e links separados para compartilhar/visualizar.
- Sinalização WebSocket.
- Tentativa de transmissão WebRTC de vídeo usando `getDisplayMedia()`.
- Encerramento da sessão pelo compartilhador.

## Limitações importantes
- Este é um protótipo de código-fonte, não um site já publicado.
- A captura de tela depende do suporte do navegador/plataforma a `navigator.mediaDevices.getDisplayMedia()`. Muitos navegadores móveis Android não oferecem captura da tela inteira; o botão informa quando a API não está disponível.
- Não há controle remoto nem acesso oculto. O usuário precisa autorizar a captura pelo diálogo do sistema.
- O servidor usa memória local para sessões: reiniciar o servidor encerra todas as sessões.
- O STUN público é apenas para testes. Para conexões confiáveis em redes móveis/NATs, será necessário configurar TURN.
- Antes de uso real, adicionar HTTPS, WSS, limites de criação, expiração/limpeza de sessões, proteção contra abuso, logs mínimos e revisão de segurança.

## Executar para desenvolvimento
Requer Node.js 18+.

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para testar a captura de tela em outro dispositivo, publique atrás de HTTPS. `getDisplayMedia()` exige contexto seguro (HTTPS, exceto localhost).

## Arquitetura
- `server.js`: Express + WebSocket para criar salas e encaminhar mensagens WebRTC.
- `public/index.html`: página inicial e geração de links.
- `public/session.html` / `public/session.js`: compartilhamento e visualização.
- `public/style.css`: identidade visual preta.
