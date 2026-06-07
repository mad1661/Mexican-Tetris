/* =====================================================================
   PASAJEROS DEL FUTURO — Transport Simulator
   A truck-loading take on Tetris.
   - Each tetromino is a cluster of passengers.
   - Clearing a row "loads" that row of passengers into the rig.
   - Fill the rig to its capacity quota -> it drives off, a fresh rig
     pulls up (board clears, speed + quota increase).
   - Let the stack reach the roof and LA MIGRA busts you (game over).
   ===================================================================== */

(() => {
  "use strict";

  // ---------- board geometry ----------
  const COLS = 8;
  const ROWS = 16;
  const CELL = 40; // px, matches canvas 320x640

  // ---------- tetromino definitions ----------
  // Each shape is a list of rotation states; each state is a 4x? matrix.
  // type -> passenger sprite index (cut from passengers.png)
  const SPRITE_FOR = { I: 8, O: 0, T: 5, S: 1, Z: 3, J: 6, L: 4 };

  const SHAPES = {
    I: [
      [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
      [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    ],
    O: [
      [[1, 1], [1, 1]],
    ],
    T: [
      [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 1, 0], [0, 1, 0]],
    ],
    S: [
      [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
      [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ],
    Z: [
      [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
      [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 0, 0]],
    ],
    J: [
      [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
      [[0, 1, 0], [0, 1, 0], [1, 1, 0]],
    ],
    L: [
      [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
      [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
      [[1, 1, 0], [0, 1, 0], [0, 1, 0]],
    ],
  };

  const TYPES = Object.keys(SHAPES);

  // ---------- asset loading ----------
  const sprites = {};
  function loadSprites() {
    const jobs = [];
    for (const t of TYPES) {
      const img = new Image();
      const idx = SPRITE_FOR[t];
      img.src = `assets/sprites/cell${idx}.png`;
      sprites[t] = img;
      jobs.push(
        new Promise((res) => {
          img.onload = res;
          img.onerror = res;
        })
      );
    }
    return Promise.all(jobs);
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const boardCanvas = $("board");
  const ctx = boardCanvas.getContext("2d");
  const nextCanvas = $("next");
  const nctx = nextCanvas.getContext("2d");
  const holdCanvas = $("hold");
  const hctx = holdCanvas.getContext("2d");

  const ui = {
    score: $("score"), rigs: $("rigs"), level: $("level"), lines: $("lines"),
    loaded: $("loaded"), quota: $("quota"), capacityFill: $("capacityFill"),
    truckNo: $("truckNo"),
    overlay: $("overlay"), overlayTitle: $("overlayTitle"),
    overlayText: $("overlayText"), overlayArt: $("overlayArt"), startBtn: $("startBtn"),
    driveTruck: $("driveTruck"), musicBtn: $("musicBtn"), bgm: $("bgm"),
    pauseBtn: $("pauseBtn"),
  };

  // ---------- game state ----------
  let grid; // ROWS x COLS, null or type-string
  let bag = [];
  let queue = [];
  let active = null; // {type, rot, x, y}
  let holdType = null;
  let canHold = true;

  let score = 0, totalLines = 0, level = 1, rigs = 0;
  let truckNo = 1, loaded = 0, quota = 0;

  let dropTimer = 0, dropInterval = 1000;
  let lastTime = 0, rafId = null;
  let state = "idle"; // idle | playing | paused | rolling | busted

  // ---------- helpers ----------
  const emptyGrid = () =>
    Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  function quotaForTruck(n) {
    // people needed; each cleared line loads COLS passengers
    return (4 + n) * COLS; // rig1=40, rig2=48, ...
  }

  function refillBag() {
    const b = [...TYPES];
    for (let i = b.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [b[i], b[j]] = [b[j], b[i]];
    }
    bag.push(...b);
  }

  function nextType() {
    if (bag.length === 0) refillBag();
    return bag.shift();
  }

  function spawn() {
    while (queue.length < 4) queue.push(nextType());
    const type = queue.shift();
    queue.push(nextType());
    const matrix = SHAPES[type][0];
    const piece = {
      type,
      rot: 0,
      x: ((COLS - matrix[0].length) / 2) | 0,
      y: type === "I" ? -1 : 0,
    };
    if (collides(piece, piece.rot, piece.x, piece.y)) {
      busted();
      return;
    }
    active = piece;
    canHold = true;
    drawSide();
  }

  function cellsOf(piece, rot = piece.rot, px = piece.x, py = piece.y) {
    const m = SHAPES[piece.type][rot % SHAPES[piece.type].length];
    const out = [];
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++)
        if (m[r][c]) out.push([px + c, py + r]);
    return out;
  }

  function collides(piece, rot, px, py) {
    for (const [x, y] of cellsOf(piece, rot, px, py)) {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && grid[y][x]) return true;
    }
    return false;
  }

  function move(dx, dy) {
    if (!active) return false;
    if (!collides(active, active.rot, active.x + dx, active.y + dy)) {
      active.x += dx;
      active.y += dy;
      return true;
    }
    return false;
  }

  function rotate(dir) {
    if (!active) return;
    const states = SHAPES[active.type].length;
    const nr = (active.rot + dir + states) % states;
    // basic wall-kick attempts
    for (const k of [0, -1, 1, -2, 2]) {
      if (!collides(active, nr, active.x + k, active.y)) {
        active.rot = nr;
        active.x += k;
        return;
      }
    }
  }

  function hardDrop() {
    if (!active) return;
    let d = 0;
    while (!collides(active, active.rot, active.x, active.y + 1)) {
      active.y++;
      d++;
    }
    score += d * 2;
    lockPiece();
  }

  function softDrop() {
    if (move(0, 1)) score += 1;
    else lockPiece();
    dropTimer = 0;
  }

  function lockPiece() {
    for (const [x, y] of cellsOf(active)) {
      if (y < 0) { // locked above the roof -> busted
        active = null;
        busted();
        return;
      }
      grid[y][x] = active.type;
    }
    active = null;
    const cleared = clearLines();
    if (cleared > 0) loadPassengers(cleared);
    if (state === "playing") spawn();
    updateUI();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every((c) => c)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++; // recheck same row index
      }
    }
    return cleared;
  }

  function loadPassengers(cleared) {
    const lineScore = [0, 100, 300, 500, 800][cleared] * level;
    score += lineScore;
    totalLines += cleared;
    level = 1 + Math.floor(totalLines / 10);
    dropInterval = Math.max(110, 1000 - (level - 1) * 80);

    loaded += cleared * COLS;
    if (loaded >= quota) driveOff();
  }

  // ---------- truck lifecycle ----------
  function driveOff() {
    state = "rolling";
    active = null;
    rigs++;
    // roll animation
    const t = ui.driveTruck;
    t.classList.remove("rolling");
    void t.offsetWidth; // restart animation
    t.classList.add("rolling");

    setTimeout(() => {
      // fresh rig
      grid = emptyGrid();
      truckNo++;
      loaded = 0;
      quota = quotaForTruck(truckNo);
      t.classList.remove("rolling");
      t.style.opacity = 0;
      if (state === "rolling") {
        state = "playing";
        spawn();
        updateUI();
      }
    }, 2100);
    updateUI();
  }

  function busted() {
    state = "busted";
    cancelAnimationFrame(rafId);
    rafId = null;
    showOverlay(
      "¡BUSTED!",
      `LA MIGRA caught you with a half-empty rig.<br/>You loaded <b>${score}</b> pts across <b>${rigs}</b> rigs.<br/>Better luck next run, pollero.`,
      true
    );
  }

  // ---------- rendering ----------
  function drawCell(c, x, y, type, alpha = 1) {
    const px = x * CELL, py = y * CELL;
    c.save();
    c.globalAlpha = alpha;
    const img = sprites[type];
    if (img && img.complete && img.naturalWidth) {
      c.drawImage(img, px, py, CELL, CELL);
    } else {
      c.fillStyle = "#888";
      c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    // subtle cell frame so packed passengers read as a grid
    c.globalAlpha = alpha * 0.5;
    c.strokeStyle = "rgba(0,0,0,.45)";
    c.lineWidth = 1;
    c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
    c.restore();
  }

  function drawBoard() {
    // truck-bed background
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    const g = ctx.createLinearGradient(0, 0, 0, boardCanvas.height);
    g.addColorStop(0, "#16263d");
    g.addColorStop(1, "#0c1320");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // faint grid lines (steel ribs)
    ctx.strokeStyle = "rgba(120,150,190,.10)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
      ctx.stroke();
    }

    // settled passengers
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c]) drawCell(ctx, c, r, grid[r][c]);

    // ghost + active
    if (active && state === "playing") {
      let gy = active.y;
      while (!collides(active, active.rot, active.x, gy + 1)) gy++;
      for (const [x, y] of cellsOf(active, active.rot, active.x, gy))
        if (y >= 0) {
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#bcd6ff";
          ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
          ctx.restore();
        }
      for (const [x, y] of cellsOf(active))
        if (y >= 0) drawCell(ctx, x, y, active.type);
    }
  }

  function drawPreview(c, canvas, type, ox, oy, scale) {
    if (!type) return;
    const m = SHAPES[type][0];
    const w = m[0].length, h = m.length;
    const px = ox - (w * scale) / 2;
    const py = oy - (h * scale) / 2;
    for (let r = 0; r < h; r++)
      for (let col = 0; col < w; col++)
        if (m[r][col]) {
          const img = sprites[type];
          const dx = px + col * scale, dy = py + r * scale;
          if (img && img.complete && img.naturalWidth)
            c.drawImage(img, dx, dy, scale, scale);
          c.strokeStyle = "rgba(0,0,0,.4)";
          c.strokeRect(dx + 0.5, dy + 0.5, scale - 1, scale - 1);
        }
  }

  function drawSide() {
    // NEXT (show 3)
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const sc = 26;
    for (let i = 0; i < 3; i++)
      drawPreview(nctx, nextCanvas, queue[i], nextCanvas.width / 2, 55 + i * 100, sc);

    // HOLD
    hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    drawPreview(hctx, holdCanvas, holdType, holdCanvas.width / 2, holdCanvas.height / 2, sc);
  }

  // ---------- hold ----------
  function doHold() {
    if (!canHold || !active || state !== "playing") return;
    const cur = active.type;
    if (holdType) {
      const swap = holdType;
      holdType = cur;
      const m = SHAPES[swap][0];
      active = { type: swap, rot: 0, x: ((COLS - m[0].length) / 2) | 0, y: 0 };
    } else {
      holdType = cur;
      active = null;
      spawn();
    }
    canHold = false;
    drawSide();
  }

  // ---------- UI ----------
  function updateUI() {
    ui.score.textContent = score;
    ui.rigs.textContent = rigs;
    ui.level.textContent = level;
    ui.lines.textContent = totalLines;
    ui.truckNo.textContent = truckNo;
    ui.loaded.textContent = Math.min(loaded, quota);
    ui.quota.textContent = quota;
    ui.capacityFill.style.width =
      Math.min(100, (loaded / quota) * 100) + "%";
  }

  function showOverlay(title, html, busted = false) {
    ui.overlay.classList.remove("hidden");
    ui.overlayTitle.textContent = title;
    ui.overlayTitle.classList.toggle("busted", busted);
    ui.overlayText.innerHTML = html;
    ui.overlayArt.hidden = !busted;
    ui.startBtn.textContent = busted ? "RUN AGAIN" : "START SHIFT";
    ui.pauseBtn.hidden = true;
  }
  function hideOverlay() {
    ui.overlay.classList.add("hidden");
    ui.pauseBtn.hidden = false;
  }

  // ---------- loop ----------
  function tick(time) {
    const dt = time - lastTime;
    lastTime = time;
    if (state === "playing") {
      dropTimer += dt;
      if (dropTimer >= dropInterval) {
        dropTimer = 0;
        if (!move(0, 1)) lockPiece();
      }
    }
    if (state === "playing" || state === "rolling") drawBoard();
    rafId = requestAnimationFrame(tick);
  }

  // ---------- start / reset ----------
  function startGame() {
    grid = emptyGrid();
    bag = []; queue = []; holdType = null; active = null;
    score = 0; totalLines = 0; level = 1; rigs = 0;
    truckNo = 1; loaded = 0; quota = quotaForTruck(truckNo);
    dropInterval = 1000; dropTimer = 0; lastTime = performance.now();
    state = "playing";
    hideOverlay();
    spawn();
    updateUI();
    if (!rafId) rafId = requestAnimationFrame(tick);
    tryStartMusic();
  }

  // ---------- input ----------
  const keymap = {
    ArrowLeft: () => move(-1, 0),
    ArrowRight: () => move(1, 0),
    ArrowDown: () => softDrop(),
    ArrowUp: () => rotate(1),
    KeyZ: () => rotate(-1),
    KeyX: () => rotate(1),
    Space: () => hardDrop(),
    KeyC: () => doHold(),
    KeyP: () => togglePause(),
  };

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      showOverlay("PAUSED", "Catch your breath.<br/>The rig's still waiting.");
      ui.startBtn.textContent = "RESUME";
    } else if (state === "paused") {
      hideOverlay();
      state = "playing";
      lastTime = performance.now();
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.code in keymap) {
      if (state === "playing" || (e.code === "KeyP" && state === "paused")) {
        e.preventDefault();
        keymap[e.code]();
      }
    }
  });

  ui.startBtn.addEventListener("click", () => {
    if (state === "paused") togglePause();
    else startGame();
  });

  ui.pauseBtn.addEventListener("click", () => {
    if (state === "playing" || state === "paused") togglePause();
  });

  // ---------- touch controls ----------
  (function setupTouch() {
    const pad = document.getElementById("touch");
    if (!pad) return;
    const actions = {
      left: () => move(-1, 0),
      right: () => move(1, 0),
      soft: () => softDrop(),
      rotate: () => rotate(1),
      hard: () => hardDrop(),
      hold: () => doHold(),
    };
    const repeatable = { left: true, right: true, soft: true };

    pad.querySelectorAll(".tbtn").forEach((btn) => {
      const act = btn.dataset.act;
      let holdTimer = null, repTimer = null;
      const fire = () => { if (state === "playing") actions[act](); };
      const start = (e) => {
        e.preventDefault();
        if (typeof btn.setPointerCapture === "function" && e.pointerId != null) {
          try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        }
        btn.classList.add("is-down");
        fire();
        if (repeatable[act]) {
          holdTimer = setTimeout(() => {
            repTimer = setInterval(fire, act === "soft" ? 55 : 105);
          }, 220);
        }
      };
      const end = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove("is-down");
        clearTimeout(holdTimer); clearInterval(repTimer);
        holdTimer = repTimer = null;
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", end);
      btn.addEventListener("pointercancel", end);
      btn.addEventListener("lostpointercapture", end);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });
  })();

  // ---------- music loop hook ----------
  function tryStartMusic() {
    if (ui.musicBtn.getAttribute("aria-pressed") === "true") {
      ui.bgm.play().catch(() => {});
    }
  }
  ui.musicBtn.addEventListener("click", () => {
    const on = ui.musicBtn.getAttribute("aria-pressed") === "true";
    if (on) {
      ui.bgm.pause();
      ui.musicBtn.setAttribute("aria-pressed", "false");
      ui.musicBtn.textContent = "♪ MUSIC: OFF";
    } else {
      ui.musicBtn.setAttribute("aria-pressed", "true");
      ui.musicBtn.textContent = "♪ MUSIC: ON";
      ui.bgm.play().catch(() => {
        // No track supplied yet — see assets/audio/ + README "Music".
        ui.musicBtn.textContent = "♪ ADD music.mp3";
      });
    }
  });

  // ---------- boot ----------
  loadSprites().then(() => {
    grid = emptyGrid();
    quota = quotaForTruck(truckNo);
    updateUI();
    drawBoard();
    drawSide();
  });
})();
