(function () {
  "use strict";

  const connStatus = document.getElementById("connStatus");

  const setupPanel = document.getElementById("setupPanel");
  const waitingPanel = document.getElementById("waitingPanel");
  const gamePanel = document.getElementById("gamePanel");
  const revealPanel = document.getElementById("revealPanel");

  const createBtn = document.getElementById("createBtn");
  const joinForm = document.getElementById("joinForm");
  const joinCodeInput = document.getElementById("joinCodeInput");
  const setupError = document.getElementById("setupError");

  const waitCodeDisplay = document.getElementById("waitCodeDisplay");
  const waitCopyBtn = document.getElementById("waitCopyBtn");
  const waitCopyMsg = document.getElementById("waitCopyMsg");

  const turnIndicator = document.getElementById("turnIndicator");
  const attemptsRow = document.getElementById("attemptsRow");
  const hintChip = document.getElementById("hintChip");

  const xForm = document.getElementById("xForm");
  const xInput = document.getElementById("xInput");
  const pointsStat = document.getElementById("pointsStat");
  const historyList = document.getElementById("historyList");

  const guessForm = document.getElementById("guessForm");
  const guessInput = document.getElementById("guessInput");
  const guessLog = document.getElementById("guessLog");
  const turnError = document.getElementById("turnError");

  const revealStatus = document.getElementById("revealStatus");
  const revealFormula = document.getElementById("revealFormula");
  const revealStats = document.getElementById("revealStats");
  const rematchBtn = document.getElementById("rematchBtn");
  const copyResultBtn = document.getElementById("copyResultBtn");
  const copyResultMsg = document.getElementById("copyResultMsg");
  const shareText = document.getElementById("shareText");

  const canvas = document.getElementById("plot");
  const ctx = canvas.getContext("2d");

  let ws = null;
  let latestState = null;

  // ---------- connection ----------
  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(proto + "://" + location.host + "/ws");
    ws.addEventListener("open", function () { connStatus.textContent = "conectado"; });
    ws.addEventListener("close", function () {
      connStatus.textContent = "conexão perdida — recarregue a página para tentar de novo";
      setAllDisabled(true);
    });
    ws.addEventListener("error", function () { connStatus.textContent = "erro de conexão"; });
    ws.addEventListener("message", function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handleMessage(msg);
    });
  }

  function sendMsg(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function setAllDisabled(disabled) {
    createBtn.disabled = disabled;
    joinForm.querySelector("button").disabled = disabled;
    xInput.disabled = disabled;
    xForm.querySelector("button").disabled = disabled;
    guessInput.disabled = disabled;
    guessForm.querySelector("button").disabled = disabled;
  }

  function handleMessage(msg) {
    if (msg.type === "created" || msg.type === "joined") {
      setupError.hidden = true;
      return;
    }
    if (msg.type === "error") {
      setupError.textContent = msg.message;
      setupError.hidden = false;
      return;
    }
    if (msg.type === "guessError") {
      turnError.textContent = msg.message;
      turnError.hidden = false;
      return;
    }
    if (msg.type === "state") {
      latestState = msg;
      render(msg);
      return;
    }
  }

  createBtn.addEventListener("click", function () { sendMsg({ type: "create" }); });
  joinForm.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMsg({ type: "join", code: joinCodeInput.value });
  });
  waitCopyBtn.addEventListener("click", function () {
    const code = waitCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(function () {
      waitCopyMsg.textContent = "Copiado!"; waitCopyMsg.hidden = false;
    }).catch(function () {
      waitCopyMsg.textContent = "Código: " + code; waitCopyMsg.hidden = false;
    });
  });

  xForm.addEventListener("submit", function (e) {
    e.preventDefault();
    turnError.hidden = true;
    const raw = xInput.value.trim().replace(",", ".");
    if (raw === "" || isNaN(Number(raw))) {
      turnError.textContent = "Digite um número válido.";
      turnError.hidden = false;
      return;
    }
    sendMsg({ type: "testX", x: Number(raw) });
    xInput.value = "";
  });

  guessForm.addEventListener("submit", function (e) {
    e.preventDefault();
    turnError.hidden = true;
    const raw = guessInput.value.trim();
    if (!raw) return;
    sendMsg({ type: "guess", formula: raw });
    guessInput.value = "";
  });

  rematchBtn.addEventListener("click", function () { sendMsg({ type: "rematch" }); });

  copyResultBtn.addEventListener("click", function () {
    const text = buildShareText(latestState);
    navigator.clipboard.writeText(text).then(function () {
      copyResultMsg.textContent = "Copiado!"; copyResultMsg.hidden = false;
      shareText.hidden = true;
    }).catch(function () {
      shareText.value = text; shareText.hidden = false;
      copyResultMsg.textContent = "Copie o texto abaixo:"; copyResultMsg.hidden = false;
    });
  });

  function buildShareText(state) {
    const lines = state.guesses.map(function (g) { return g.correct ? "🟩" : "🟥"; }).join("");
    let result;
    if (state.status === "won") result = (state.winner === state.yourIndex ? "vitória" : "derrota");
    else if (state.status === "draw") result = "empate";
    else result = "encerrado";
    return "Duelo " + state.code + " — " + result + " (" + state.guesses.length + "/" + state.maxAttempts + ")\n" +
      lines + "\n" + state.history.length + " pontos testados";
  }

  // ---------- screens ----------
  function showScreen(status) {
    setupPanel.hidden = true;
    waitingPanel.hidden = true;
    gamePanel.hidden = true;
    revealPanel.hidden = true;
    if (!status) { setupPanel.hidden = false; return; }
    if (status === "waiting") { waitingPanel.hidden = false; return; }
    gamePanel.hidden = false;
    if (status !== "playing") revealPanel.hidden = false;
  }

  // ---------- render ----------
  function render(state) {
    showScreen(state.status);

    if (state.status === "waiting") {
      waitCodeDisplay.textContent = state.code;
      return;
    }

    if (state.status === "playing") {
      const yourTurn = state.turn === state.yourIndex;
      turnIndicator.textContent = yourTurn ? "Sua vez" : "Vez do oponente";
      turnIndicator.className = "turn-indicator " + (yourTurn ? "yours" : "theirs");
    } else {
      turnIndicator.textContent = "Partida encerrada";
      turnIndicator.className = "turn-indicator";
    }

    attemptsRow.innerHTML = "";
    for (let i = 0; i < state.maxAttempts; i++) {
      const box = document.createElement("div");
      box.className = "attempt-box";
      const g = state.guesses[i];
      if (g) {
        box.classList.add(g.correct ? "correct" : ("wrong-p" + g.by));
        box.textContent = g.correct ? "✓" : "✗";
      }
      attemptsRow.appendChild(box);
    }

    hintChip.innerHTML = state.hintFamily
      ? "<span class=\"hint-chip\">Dica: é uma função " + state.hintFamily + "</span>"
      : "";

    historyList.innerHTML = "";
    state.history.forEach(function (p) {
      const li = document.createElement("li");
      const yText = isFinite(p.y) ? GameLogic.fmtNum(Math.round(p.y * 1000) / 1000) : "indefinido";
      li.innerHTML = "x = " + GameLogic.fmtNum(p.x) + " <span class=\"fx\">→ f(x) = " + yText + "</span>";
      historyList.appendChild(li);
    });
    pointsStat.textContent = state.history.length + (state.history.length === 1 ? " ponto testado" : " pontos testados");

    guessLog.innerHTML = "";
    state.guesses.forEach(function (g) {
      const li = document.createElement("li");
      li.className = g.correct ? "correct" : "wrong";
      const who = g.by === state.yourIndex ? "Você" : "Oponente";
      li.innerHTML = "<span class=\"who\">" + who + "</span><span class=\"mark\">" + (g.correct ? "✓" : "✗") +
        "</span><span class=\"txt\">" + g.text + "</span>";
      guessLog.appendChild(li);
    });

    const yourTurnNow = state.status === "playing" && state.turn === state.yourIndex;
    xInput.disabled = !yourTurnNow;
    xForm.querySelector("button").disabled = !yourTurnNow;
    guessInput.disabled = !yourTurnNow;
    guessForm.querySelector("button").disabled = !yourTurnNow;

    if (state.status !== "playing" && state.reveal) {
      let statusText, cls;
      if (state.status === "won") {
        const iWon = state.winner === state.yourIndex;
        statusText = iWon ? "Você venceu!" : "O oponente venceu.";
        cls = iWon ? "won" : "lost";
      } else if (state.status === "draw") {
        statusText = "Ninguém acertou — empate.";
        cls = "draw";
      } else {
        statusText = "O outro jogador saiu da sala.";
        cls = "draw";
      }
      revealStatus.textContent = statusText;
      revealStatus.className = "status " + cls;
      revealFormula.textContent = state.reveal.display;
      revealStats.textContent = state.guesses.length + " de " + state.maxAttempts + " tentativas · " +
        state.history.length + " pontos testados";
      const canRematch = state.status !== "abandoned" && state.numPlayers >= 2;
      rematchBtn.disabled = !canRematch;
      rematchBtn.textContent = canRematch ? "Jogar de novo" : "Aguardando o outro jogador";
      copyResultMsg.hidden = true;
      shareText.hidden = true;
    }

    drawPlot(state);
  }

  // ---------- plot ----------
  function niceStep(range, targetTicks) {
    const rough = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }

  function computeYRange(state) {
    let vals = [0];
    state.history.forEach(function (p) { if (isFinite(p.y)) vals.push(p.y); });
    if (state.reveal) {
      const rp = GameLogic.puzzleFromCategoryIndex(state.reveal.categoryIndex, state.reveal.params, []);
      for (let i = 0; i <= 200; i++) {
        const x = -10 + (i / 200) * 20;
        const y = rp.category.evaluate(rp.params, x);
        if (isFinite(y)) vals.push(y);
      }
    }
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 5; max += 5; }
    const pad = (max - min) * 0.15;
    min -= pad; max += pad;
    if (max - min < 4) { const c = (max + min) / 2; min = c - 2; max = c + 2; }
    return [min, max];
  }

  function drawPlot(state) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const style = getComputedStyle(document.documentElement);
    const gridLine = style.getPropertyValue("--grid-line").trim();
    const gridStrong = style.getPropertyValue("--grid-line-strong").trim();
    const inkFaint = style.getPropertyValue("--ink-faint").trim();
    const pointColor = style.getPropertyValue("--point-color").trim();
    const accent = style.getPropertyValue("--accent").trim();

    const padL = 42, padR = 14, padT = 14, padB = 26;
    const plotW = cssW - padL - padR, plotH = cssH - padT - padB;
    const xMin = -10, xMax = 10;
    const [yMin, yMax] = computeYRange(state);

    const sx = function (x) { return padL + ((x - xMin) / (xMax - xMin)) * plotW; };
    const sy = function (y) { return padT + (1 - (y - yMin) / (yMax - yMin)) * plotH; };

    ctx.font = "10px " + style.getPropertyValue("--font-mono").trim();
    ctx.fillStyle = inkFaint;
    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 1;

    const xStep = niceStep(xMax - xMin, 8);
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) {
      const px = Math.round(sx(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + plotH); ctx.stroke();
      if (Math.abs(v) > 1e-9) {
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(GameLogic.fmtNum(v), px, padT + plotH + 4);
      }
    }
    const yStep = niceStep(yMax - yMin, 6);
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
      const py = Math.round(sy(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + plotW, py); ctx.stroke();
      if (Math.abs(v) > 1e-9) {
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(GameLogic.fmtNum(v), padL - 6, py);
      }
    }

    ctx.strokeStyle = gridStrong;
    ctx.lineWidth = 1.4;
    if (yMin <= 0 && yMax >= 0) {
      const py = Math.round(sy(0)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + plotW, py); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const px = Math.round(sx(0)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + plotH); ctx.stroke();
    }

    if (state.reveal) {
      const rp = GameLogic.puzzleFromCategoryIndex(state.reveal.categoryIndex, state.reveal.params, []);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      let started = false;
      const steps = 400;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (i / steps) * (xMax - xMin);
        let y;
        try { y = rp.category.evaluate(rp.params, x); } catch (e) { y = NaN; }
        if (!isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) { started = false; continue; }
        const px = sx(x), py = sy(y);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    state.history.forEach(function (p) {
      if (!isFinite(p.y)) return;
      const px = sx(p.x), py = sy(Math.min(Math.max(p.y, yMin), yMax));
      ctx.beginPath();
      ctx.fillStyle = style.getPropertyValue("--surface").trim();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = pointColor;
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  window.addEventListener("resize", function () { if (latestState) drawPlot(latestState); });

  connect();
})();
