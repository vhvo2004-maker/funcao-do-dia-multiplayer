# Função do Dia — Duelo por Turnos

Jogo de adivinhar uma função matemática secreta, no modo duelo: dois jogadores,
em aparelhos diferentes, entram na mesma sala por um código e jogam alternando
turnos em tempo real (WebSocket). Em cada turno, o jogador testa um valor de
`x` **ou** tenta adivinhar a fórmula; assim que ele joga, o servidor já passa a
vez para o outro automaticamente. Quem acertar a fórmula primeiro vence.

## Rodar localmente

Requer Node.js 18+.

```bash
npm install
npm start
```

O servidor sobe em `http://localhost:8080` (ou na porta definida em `PORT`).
Abra essa URL em duas abas/aparelhos diferentes para jogar um duelo — em uma
clique em "Criar sala nova", copie o código e cole na outra em "Entrar".

## Estrutura

```
server.js            servidor HTTP + WebSocket (autoritativo: gera a função
                      secreta, valida jogadas, controla de quem é a vez)
shared/gameLogic.js   banco de funções, parser de expressões e comparador de
                      fórmulas — mesmo código usado no servidor (via require)
                      e no navegador (via <script>)
public/index.html     página do jogo
public/style.css      identidade visual (papel milimetrado / quadro-negro)
public/client.js      cliente WebSocket + renderização do gráfico e da UI
```

O estado de cada sala (função secreta, pontos testados, tentativas, de quem é
a vez) fica em memória no processo do servidor — não há banco de dados. Isso é
suficiente para partidas casuais, mas significa que reiniciar o servidor
encerra os duelos em andamento.

## Publicar para jogar com alguém remotamente

Para os dois jogadores conseguirem se conectar de fora da sua rede local, o
servidor precisa estar hospedado em algum lugar acessível pela internet. Como
é só um processo Node com WebSocket (sem banco de dados), qualquer serviço que
rode `npm install && npm start` funciona. Algumas opções com camada gratuita:

- **Render** (render.com) — "New Web Service", aponte para este diretório,
  build command `npm install`, start command `npm start`.
- **Railway** (railway.app) — importa o projeto e detecta o `package.json`
  automaticamente.
- **Fly.io** — `fly launch` na pasta do projeto (gera um `Dockerfile`/config
  automaticamente para um app Node simples).

Em todos os casos, garanta que a porta usada pelo serviço seja lida de
`process.env.PORT` (já é o caso em `server.js`) e que o WebSocket (`/ws`) não
seja bloqueado — os três serviços acima suportam WebSocket em seus planos
gratuitos.

## Limitações conhecidas (escopo atual)

- Sem reconexão: se a aba de um jogador recarregar ou cair, a partida é
  encerrada para os dois (mostrado como "o outro jogador saiu da sala").
- Sem contas/nome de jogador — cada lado só vê "Você" e "Oponente".
- Estado das salas é só em memória: reiniciar o servidor apaga as partidas em
  andamento.
