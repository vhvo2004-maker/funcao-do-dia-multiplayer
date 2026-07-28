"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const {
  FAMILY, buildPuzzle, parseExpr, guessMatches
} = require("./shared/gameLogic");

const PORT = process.env.PORT || 8080;
const MAX_ATTEMPTS = 8;
const HINT_AFTER = 3;
const TURN_TIME_MS = Number(process.env.TURN_TIME_MS) || 30000;
const ROOM_TTL_MS = 4 * 60 * 60 * 1000; // clean up abandoned rooms after 4h

const PUBLIC_DIR = path.join(__dirname, "public");
const SHARED_DIR = path.join(__dirname, "shared");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Não encontrado");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const httpServer = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath === "/gameLogic.js") {
    serveFile(res, path.join(SHARED_DIR, "gameLogic.js"));
    return;
  }

  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  serveFile(res, path.join(PUBLIC_DIR, filePath));
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// ---------- room management ----------
const rooms = new Map(); // code -> room

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function newRoomState(code) {
  return {
    code,
    players: [], // { ws, connected }
    puzzle: buildPuzzle(code + ":" + Date.now() + ":" + Math.random()),
    turn: 0,
    history: [],
    guesses: [],
    status: "waiting", // waiting | playing | won | draw | abandoned
    winner: null,
    turnDeadline: null,
    turnTimerHandle: null,
    lastActivity: Date.now()
  };
}

function wrongCount(room) {
  return room.guesses.filter((g) => !g.correct).length;
}

function clearTurnTimer(room) {
  if (room.turnTimerHandle) {
    clearTimeout(room.turnTimerHandle);
    room.turnTimerHandle = null;
  }
  room.turnDeadline = null;
}

function scheduleTurnTimer(room) {
  clearTurnTimer(room);
  if (room.status !== "playing") return;
  room.turnDeadline = Date.now() + TURN_TIME_MS;
  room.turnTimerHandle = setTimeout(() => onTurnTimeout(room), TURN_TIME_MS);
}

function onTurnTimeout(room) {
  if (room.status !== "playing") return;
  room.turn = 1 - room.turn;
  room.lastActivity = Date.now();
  scheduleTurnTimer(room);
  broadcast(room);
}

function publicState(room, yourIndex) {
  const state = {
    type: "state",
    code: room.code,
    yourIndex,
    numPlayers: room.players.filter((p) => p.connected).length,
    status: room.status,
    turn: room.turn,
    winner: room.winner,
    history: room.history,
    guesses: room.guesses,
    maxAttempts: MAX_ATTEMPTS,
    hintAfter: HINT_AFTER,
    hintFamily: null,
    turnDeadline: room.status === "playing" ? room.turnDeadline : null,
    turnTimeMs: TURN_TIME_MS,
    reveal: null
  };
  if (room.status === "playing" && wrongCount(room) >= HINT_AFTER) {
    state.hintFamily = FAMILY[room.puzzle.category.family];
  }
  if (room.status === "won" || room.status === "draw" || room.status === "abandoned") {
    state.reveal = {
      display: room.puzzle.category.display(room.puzzle.params),
      categoryLabel: room.puzzle.category.label,
      categoryIndex: room.puzzle.categoryIndex,
      params: room.puzzle.params
    };
  }
  return state;
}

function broadcast(room) {
  room.players.forEach((p, idx) => {
    if (p.connected && p.ws.readyState === p.ws.OPEN) {
      send(p.ws, publicState(room, idx));
    }
  });
}

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

function resetRoomForRematch(room) {
  room.puzzle = buildPuzzle(room.code + ":" + Date.now() + ":" + Math.random());
  room.history = [];
  room.guesses = [];
  room.status = "playing";
  room.winner = null;
  // loser (or whoever didn't start last time) opens; simplest: alternate starting turn
  room.turn = room.turn === 0 ? 1 : 0;
  room.lastActivity = Date.now();
}

wss.on("connection", (ws) => {
  let room = null;
  let myIndex = -1;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === "create") {
      const code = genCode();
      room = newRoomState(code);
      rooms.set(code, room);
      myIndex = 0;
      room.players.push({ ws, connected: true });
      send(ws, { type: "created", code, yourIndex: myIndex });
      broadcast(room);
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      const target = rooms.get(code);
      if (!target) { send(ws, { type: "error", message: "Sala não encontrada." }); return; }
      if (target.players.filter((p) => p.connected).length >= 2) {
        send(ws, { type: "error", message: "Essa sala já está cheia." });
        return;
      }
      room = target;
      const freeSlot = room.players.findIndex((p) => !p.connected);
      if (freeSlot >= 0) {
        room.players[freeSlot] = { ws, connected: true };
        myIndex = freeSlot;
      } else {
        myIndex = room.players.length;
        room.players.push({ ws, connected: true });
      }
      if (room.players.filter((p) => p.connected).length === 2 && room.status === "waiting") {
        room.status = "playing";
        scheduleTurnTimer(room);
      }
      room.lastActivity = Date.now();
      send(ws, { type: "joined", code: room.code, yourIndex: myIndex });
      broadcast(room);
      return;
    }

    if (!room) return;

    if (msg.type === "testX") {
      if (room.status !== "playing" || room.turn !== myIndex) return;
      const x = Number(msg.x);
      if (!isFinite(x) || x < -10 || x > 10) {
        send(ws, { type: "guessError", kind: "x", message: "Escolha x entre -10 e 10." });
        return;
      }
      const y = room.puzzle.category.evaluate(room.puzzle.params, x);
      if (!isFinite(y)) {
        send(ws, { type: "guessError", kind: "x", message: "f(x) não está definida nesse ponto. Sua vez continua." });
        return;
      }
      if (!room.history.find((p) => p.x === x)) room.history.push({ x, y });
      room.turn = 1 - room.turn;
      room.lastActivity = Date.now();
      scheduleTurnTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === "guess") {
      if (room.status !== "playing" || room.turn !== myIndex) return;
      const raw = String(msg.formula || "").trim();
      if (!raw) return;
      let tree;
      try { tree = parseExpr(raw); }
      catch (e) {
        send(ws, { type: "guessError", kind: "guess", message: "Não entendi essa expressão. Sua vez continua." });
        return;
      }
      const correct = guessMatches(tree, room.puzzle);
      room.guesses.push({ by: myIndex, text: raw, correct });
      if (correct) {
        room.status = "won";
        room.winner = myIndex;
        clearTurnTimer(room);
      } else if (room.guesses.length >= MAX_ATTEMPTS) {
        room.status = "draw";
        clearTurnTimer(room);
      } else {
        room.turn = 1 - room.turn;
        scheduleTurnTimer(room);
      }
      room.lastActivity = Date.now();
      broadcast(room);
      return;
    }

    if (msg.type === "rematch") {
      if (!room || room.status === "waiting" || room.status === "playing") return;
      if (room.players.filter((p) => p.connected).length < 2) {
        send(ws, { type: "guessError", message: "Aguardando o outro jogador reconectar." });
        return;
      }
      resetRoomForRematch(room);
      scheduleTurnTimer(room);
      broadcast(room);
      return;
    }
  });

  ws.on("close", () => {
    if (!room || myIndex < 0) return;
    if (room.players[myIndex]) room.players[myIndex].connected = false;
    if (room.status === "playing" || room.status === "waiting") {
      room.status = "abandoned";
      clearTurnTimer(room);
    }
    room.lastActivity = Date.now();
    broadcast(room);
  });
});

// periodic cleanup of stale rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const allDisconnected = room.players.every((p) => !p.connected);
    if (allDisconnected && now - room.lastActivity > ROOM_TTL_MS) {
      clearTurnTimer(room);
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log("Função do Dia — Duelo por turnos rodando em http://localhost:" + PORT);
});
