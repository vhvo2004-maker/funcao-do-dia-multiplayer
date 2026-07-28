(function () {
  "use strict";

  const connStatus = document.getElementById("connStatus");

  const homePanel = document.getElementById("homePanel");
  const waitingPanel = document.getElementById("waitingPanel");
  const gamePanel = document.getElementById("gamePanel");
  const revealPanel = document.getElementById("revealPanel");
  const soloEndPanel = document.getElementById("soloEndPanel");

  const createBtn = document.getElementById("createBtn");
  const joinForm = document.getElementById("joinForm");
  const joinCodeInput = document.getElementById("joinCodeInput");
  const setupError = document.getElementById("setupError");

  const soloDurationRow = document.getElementById("soloDurationRow");
  const soloStartBtn = document.getElementById("soloStartBtn");
  const soloBestScore = document.getElementById("soloBestScore");

  const waitCodeDisplay = document.getElementById("waitCodeDisplay");
  const waitCopyBtn = document.getElementById("waitCopyBtn");
  const waitCopyMsg = document.getElementById("waitCopyMsg");

  const turnIndicator = document.getElementById("turnIndicator");
  const turnTimer = document.getElementById("turnTimer");
  const soloScore = document.getElementById("soloScore");
  const attemptsRow = document.getElementById("attemptsRow");
  const hintChip = document.getElementById("hintChip");
  const soloFeedback = document.getElementById("soloFeedback");

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

  const soloEndStatus = document.getElementById("soloEndStatus");
  const soloEndStats = document.getElementById("soloEndStats");
  const soloAgainBtn = document.getElementById("soloAgainBtn");
  const soloMenuBtn = document.getElementById("soloMenuBtn");
  const soloCopyBtn = document.getElementById("soloCopyBtn");
  const soloCopyMsg = document.getElementById("soloCopyMsg");
  const soloShareText = document.getElementById("soloShareText");

  const canvas = document.getElementById("plot");
  const ctx = canvas.getContext("2d");

  let ws = null;
  let latestState = null;
  let appMode = null; // null (home) | "duel" | "solo"
  let selectedDuration = 180;
  let solo = null;
  let soloRoundTimeout = null;

  const SOLO_MAX_ATTEMPTS = 5;
  const SOLO_HINT_AFTER = 2;
  const SOLO_ROUND_PAUSE_MS = 1400;

  // ---------- connection (only needed for duel mode) ----------
  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(proto + "://" + location.host + "/ws");
    ws.addEventListener("open", function () { connStatus.textContent = "conectado"; });
    ws.addEventListener("close", function () {
      connStatus.textContent = "conexão com o duelo perdida — recarregue a página para tentar de novo";
      if (appMode === "duel") setDuelFormsDisabled(true);
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

  function setDuelFormsDisabled(disabled) {
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
      appMode = "duel";
      latestState = msg;
      renderDuel(msg);
      return;
    }
  }

  // ---------- home screen ----------
  function updateBestScoreDisplay() {
    const best = getBestScore(selectedDuration);
    soloBestScore.textContent = best > 0
      ? "Seu recorde nessa duração: " + best + (best === 1 ? " função resolvida" : " funções resolvidas")
      : "Ainda sem recorde nessa duração — essa pode ser a primeira.";
  }
  function getBestScore(durationSeconds) {
    try { return Number(localStorage.getItem("funcao-do-dia:best:" + durationSeconds)) || 0; }
    catch (e) { return 0; }
  }
  function saveBestScore(durationSeconds, solved) {
    try {
      const current = getBestScore(durationSeconds);
      if (solved > current) localStorage.setItem("funcao-do-dia:best:" + durationSeconds, String(solved));
    } catch (e) {}
  }

  Array.prototype.forEach.call(soloDurationRow.querySelectorAll(".duration-btn"), function (btn) {
    btn.addEventListener("click", function () {
      Array.prototype.forEach.call(soloDurationRow.querySelectorAll(".duration-btn"), function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      selectedDuration = Number(btn.dataset.seconds);
      updateBestScoreDisplay();
    });
  });

  createBtn.addEventListener("click", function () {
    appMode = "duel";
    sendMsg({ type: "create" });
  });
  joinForm.addEventListener("submit", function (e) {
    e.preventDefault();
    appMode = "duel";
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

  // ---------- shared form handlers (branch on appMode) ----------
  xForm.addEventListener("submit", function (e) {
    e.preventDefault();
    turnError.hidden = true;
    const raw = xInput.value.trim().replace(",", ".");
    if (raw === "" || isNaN(Number(raw))) {
      turnError.textContent = "Digite um número válido.";
      turnError.hidden = false;
      return;
    }
    const x = Number(raw);

    if (appMode === "solo") {
      if (!solo || solo.status !== "playing" || solo.reveal) return;
      if (x < -10 || x > 10) {
        turnError.textContent = "Escolha x entre -10 e 10.";
        turnError.hidden = false;
        return;
      }
      const y = solo.puzzle.category.evaluate(solo.puzzle.params, x);
      if (!isFinite(y)) {
        turnError.textContent = "f(x) não está definida nesse ponto.";
        turnError.hidden = false;
        return;
      }
      if (!solo.history.find(function (p) { return p.x === x; })) solo.history.push({ x, y });
      xInput.value = "";
      renderSolo();
      return;
    }

    sendMsg({ type: "testX", x });
    xInput.value = "";
  });

  guessForm.addEventListener("submit", function (e) {
    e.preventDefault();
    turnError.hidden = true;
    const raw = guessInput.value.trim();
    if (!raw) return;

    if (appMode === "solo") {
      if (!solo || solo.status !== "playing" || solo.reveal) return;
      let tree;
      try { tree = GameLogic.parseExpr(raw); }
      catch (err) {
        turnError.textContent = "Não entendi essa expressão.";
        turnError.hidden = false;
        return;
      }
      const correct = GameLogic.guessMatches(tree, solo.puzzle);
      solo.guesses.push({ by: 0, text: raw, correct });
      guessInput.value = "";
      if (correct) {
        solo.solved++;
        solo.streak++;
        solo.bestStreak = Math.max(solo.bestStreak, solo.streak);
        solo.reveal = {
          display: solo.puzzle.category.display(solo.puzzle.params),
          categoryIndex: solo.puzzle.categoryIndex,
          params: solo.puzzle.params
        };
        soloFeedback.textContent = "✓ Acertou! " + solo.reveal.display + " — próxima função já vem aí.";
        soloFeedback.className = "inline-msg good";
        soloFeedback.hidden = false;
        scheduleNextSoloRound();
      } else if (solo.guesses.length >= SOLO_MAX_ATTEMPTS) {
        solo.streak = 0;
        solo.reveal = {
          display: solo.puzzle.category.display(solo.puzzle.params),
          categoryIndex: solo.puzzle.categoryIndex,
          params: solo.puzzle.params
        };
        soloFeedback.textContent = "Não foi dessa vez — " + solo.reveal.display + " — próxima função já vem aí.";
        soloFeedback.className = "inline-msg";
        soloFeedback.hidden = false;
        scheduleNextSoloRound();
      }
      renderSolo();
      return;
    }

    sendMsg({ type: "guess", formula: raw });
    guessInput.value = "";
  });

  rematchBtn.addEventListener("click", function () { sendMsg({ type: "rematch" }); });

  copyResultBtn.addEventListener("click", function () {
    const text = buildDuelShareText(latestState);
    navigator.clipboard.writeText(text).then(function () {
      copyResultMsg.textContent = "Copiado!"; copyResultMsg.hidden = false;
      shareText.hidden = true;
    }).catch(function () {
      shareText.value = text; shareText.hidden = false;
      copyResultMsg.textContent = "Copie o texto abaixo:"; copyResultMsg.hidden = false;
    });
  });

  function buildDuelShareText(state) {
    const lines = state.guesses.map(function (g) { return g.correct ? "🟩" : "🟥"; }).join("");
    let result;
    if (state.status === "won") result = (state.winner === state.yourIndex ? "vitória" : "derrota");
    else if (state.status === "draw") result = "empate";
    else result = "encerrado";
    return "Duelo " + state.code + " — " + result + " (" + state.guesses.length + "/" + state.maxAttempts + ")\n" +
      lines + "\n" + state.history.length + " pontos testados";
  }

  // ---------- solo mode ----------
  function newSoloState(durationSeconds) {
    return {
      durationSeconds,
      sessionDeadline: Date.now() + durationSeconds * 1000,
      status: "playing",
      solved: 0,
      streak: 0,
      bestStreak: 0,
      puzzle: null,
      history: [],
      guesses: [],
      reveal: null
    };
  }

  function startSoloRound() {
    solo.puzzle = GameLogic.buildPuzzle(Date.now() + ":" + Math.random());
    solo.history = [];
    solo.guesses = [];
    solo.reveal = null;
    soloFeedback.hidden = true;
    turnError.hidden = true;
  }

  function scheduleNextSoloRound() {
    if (soloRoundTimeout) clearTimeout(soloRoundTimeout);
    soloRoundTimeout = setTimeout(function () {
      soloRoundTimeout = null;
      if (!solo || solo.status !== "playing") return;
      if (Date.now() >= solo.sessionDeadline) { endSoloSession(); return; }
      startSoloRound();
      renderSolo();
    }, SOLO_ROUND_PAUSE_MS);
  }

  function endSoloSession() {
    if (!solo) return;
    solo.status = "ended";
    if (soloRoundTimeout) { clearTimeout(soloRoundTimeout); soloRoundTimeout = null; }
    const isNewBest = solo.solved > getBestScore(solo.durationSeconds);
    saveBestScore(solo.durationSeconds, solo.solved);
    showScreen("soloEnd");
    soloEndStatus.textContent = "Tempo esgotado!";
    soloEndStatus.className = "status";
    soloEndStats.textContent = solo.solved + (solo.solved === 1 ? " função resolvida" : " funções resolvidas") +
      " · melhor sequência: " + solo.bestStreak +
      (isNewBest ? " · novo recorde!" : "");
    soloCopyMsg.hidden = true;
    soloShareText.hidden = true;
  }

  soloStartBtn.addEventListener("click", function () {
    appMode = "solo";
    solo = newSoloState(selectedDuration);
    startSoloRound();
    showScreen("game");
    renderSolo();
  });

  soloAgainBtn.addEventListener("click", function () {
    appMode = "solo";
    solo = newSoloState(solo.durationSeconds);
    startSoloRound();
    showScreen("game");
    renderSolo();
  });

  soloMenuBtn.addEventListener("click", function () {
    appMode = null;
    solo = null;
    updateBestScoreDisplay();
    showScreen("home");
  });

  soloCopyBtn.addEventListener("click", function () {
    const text = "Função do Dia (solo, " + Math.round(solo.durationSeconds / 60) + " min) — " +
      solo.solved + " resolvidas, melhor sequência " + solo.bestStreak;
    navigator.clipboard.writeText(text).then(function () {
      soloCopyMsg.textContent = "Copiado!"; soloCopyMsg.hidden = false;
      soloShareText.hidden = true;
    }).catch(function () {
      soloShareText.value = text; soloShareText.hidden = false;
      soloCopyMsg.textContent = "Copie o texto abaixo:"; soloCopyMsg.hidden = false;
    });
  });

  function renderSolo() {
    turnIndicator.hidden = true;
    soloScore.hidden = false;
    soloScore.textContent = "Resolvidas: " + solo.solved + (solo.streak > 1 ? " · sequência: " + solo.streak : "");

    renderAttemptsRow(solo.guesses, SOLO_MAX_ATTEMPTS);
    renderHintChip(solo.guesses, SOLO_HINT_AFTER, solo.puzzle);
    renderHistoryList(solo.history);
    renderGuessLog(solo.guesses, false, null);

    const canAct = solo.status === "playing" && !solo.reveal;
    xInput.disabled = !canAct;
    xForm.querySelector("button").disabled = !canAct;
    guessInput.disabled = !canAct;
    guessForm.querySelector("button").disabled = !canAct;

    drawPlot(solo);
  }

  // ---------- shared rendering helpers ----------
  function renderAttemptsRow(guesses, maxAttempts) {
    attemptsRow.innerHTML = "";
    for (let i = 0; i < maxAttempts; i++) {
      const box = document.createElement("div");
      box.className = "attempt-box";
      const g = guesses[i];
      if (g) {
        box.classList.add(g.correct ? "correct" : ("wrong-p" + g.by));
        box.textContent = g.correct ? "✓" : "✗";
      }
      attemptsRow.appendChild(box);
    }
  }

  function renderHintChip(guesses, hintAfter, puzzle) {
    const wrongCount = guesses.filter(function (g) { return !g.correct; }).length;
    hintChip.innerHTML = (wrongCount >= hintAfter && puzzle)
      ? "<span class=\"hint-chip\">Dica: é uma função " + GameLogic.FAMILY[puzzle.category.family] + "</span>"
      : "";
  }

  function renderHistoryList(history) {
    historyList.innerHTML = "";
    history.forEach(function (p) {
      const li = document.createElement("li");
      const yText = isFinite(p.y) ? GameLogic.fmtNum(Math.round(p.y * 1000) / 1000) : "indefinido";
      li.innerHTML = "x = " + GameLogic.fmtNum(p.x) + " <span class=\"fx\">→ f(x) = " + yText + "</span>";
      historyList.appendChild(li);
    });
    pointsStat.textContent = history.length + (history.length === 1 ? " ponto testado" : " pontos testados");
  }

  function renderGuessLog(guesses, showWho, yourIndex) {
    guessLog.innerHTML = "";
    guesses.forEach(function (g) {
      const li = document.createElement("li");
      li.className = g.correct ? "correct" : "wrong";
      const whoHtml = showWho ? "<span class=\"who\">" + (g.by === yourIndex ? "Você" : "Oponente") + "</span>" : "";
      li.innerHTML = whoHtml + "<span class=\"mark\">" + (g.correct ? "✓" : "✗") +
        "</span><span class=\"txt\">" + g.text + "</span>";
      guessLog.appendChild(li);
    });
  }

  // ---------- duel screens ----------
  function showScreen(screen) {
    homePanel.hidden = true;
    waitingPanel.hidden = true;
    gamePanel.hidden = true;
    revealPanel.hidden = true;
    soloEndPanel.hidden = true;
    turnTimer.hidden = true;
    soloScore.hidden = true;
    turnIndicator.hidden = true;
    soloFeedback.hidden = true;

    if (screen === "home") { homePanel.hidden = false; return; }
    if (screen === "waiting") { waitingPanel.hidden = false; return; }
    if (screen === "game") { gamePanel.hidden = false; return; }
    if (screen === "reveal") { gamePanel.hidden = false; revealPanel.hidden = false; return; }
    if (screen === "soloEnd") { gamePanel.hidden = false; soloEndPanel.hidden = false; return; }
  }

  // ---------- duel render ----------
  function renderDuel(state) {
    if (state.status === "waiting") {
      showScreen("waiting");
      waitCodeDisplay.textContent = state.code;
      return;
    }

    showScreen(state.status === "playing" ? "game" : "reveal");
    turnIndicator.hidden = false;

    if (state.status === "playing") {
      const yourTurn = state.turn === state.yourIndex;
      turnIndicator.textContent = yourTurn ? "Sua vez" : "Vez do oponente";
      turnIndicator.className = "turn-indicator " + (yourTurn ? "yours" : "theirs");
      turnTimer.hidden = false;
    } else {
      turnIndicator.textContent = "Partida encerrada";
      turnIndicator.className = "turn-indicator";
    }

    renderAttemptsRow(state.guesses, state.maxAttempts);
    hintChip.innerHTML = state.hintFamily
      ? "<span class=\"hint-chip\">Dica: é uma função " + state.hintFamily + "</span>"
      : "";
    renderHistoryList(state.history);
    renderGuessLog(state.guesses, true, state.yourIndex);

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

  // ---------- countdown ticker (drives both duel turn timer and solo session timer) ----------
  function formatSeconds(totalSeconds) {
    const s = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function tickCountdown() {
    if (appMode === "duel" && latestState && latestState.status === "playing" && latestState.turnDeadline) {
      const remainingMs = latestState.turnDeadline - Date.now();
      turnTimer.hidden = false;
      turnTimer.textContent = formatSeconds(remainingMs / 1000);
      turnTimer.classList.toggle("low", remainingMs <= 5000);
      return;
    }
    if (appMode === "solo" && solo && solo.status === "playing") {
      const remainingMs = solo.sessionDeadline - Date.now();
      turnTimer.hidden = false;
      turnTimer.textContent = formatSeconds(remainingMs / 1000);
      turnTimer.classList.toggle("low", remainingMs <= 10000);
      if (remainingMs <= 0 && !solo.reveal) {
        endSoloSession();
      } else if (remainingMs <= 0 && solo.reveal) {
        // let the in-flight round-end pause finish, scheduleNextSoloRound will call endSoloSession
      }
      return;
    }
    turnTimer.hidden = true;
  }
  setInterval(tickCountdown, 200);

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

  window.addEventListener("resize", function () {
    if (appMode === "duel" && latestState) drawPlot(latestState);
    else if (appMode === "solo" && solo) drawPlot(solo);
  });

  updateBestScoreDisplay();
  connect();
})();
