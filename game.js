(() => {
  'use strict';

  const VW = 480;
  const VH = 800;
  const GAME_DURATION = 15;
  const SCORE_CAP = 50;   // game ends instantly when player reaches this

  // Each entry: weight controls spawn frequency, color tints the catch effects.
  // Sprites loaded from assets/food_<key>.png
  const FOOD_TYPES = {
    chickenburger: { points:  3, weight: 22, good: true,  color: '#ffd84a', label: 'CHICKEN BURGER' },
    drumstick:     { points:  2, weight: 28, good: true,  color: '#ffb347', label: 'DRUMSTICK' },
    cola:          { points:  1, weight: 22, good: true,  color: '#ff8a3d', label: 'COLA' },
    treadmill:     { points: -1, weight: 18, good: false, color: '#ff6b6b', label: 'TREADMILL' },
    bomb:          { points: -3, weight: 10, good: false, color: '#ff3b3b', label: 'BOMB' },
  };

  const FONT_PIXEL = `'Press Start 2P', 'Silkscreen', monospace`;
  const FONT_LABEL = `'Silkscreen', 'Press Start 2P', monospace`;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ===== BUSINESS CONFIG (change these for your store) ====================
  const IG_USERNAME    = 'chimmelier';                                // no @
  const IG_HANDLE      = '@' + IG_USERNAME;
  const IG_URL         = `https://www.instagram.com/${IG_USERNAME}`;  // profile
  const IG_DEEPLINK    = `instagram://user?username=${IG_USERNAME}`;  // app deep link
  const SHARE_HASHTAGS = '#chimmelier #koreanfriedchicken #chimmeliergame';
  const COUPON_DAYS    = 7;                                           // expiry days
  const COUPON_PREFIX  = 'CHM';                                       // code prefix
  // ========================================================================

  const startScreen    = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('gameover-screen');
  const couponScreen   = document.getElementById('coupon-screen');
  const startBtn       = document.getElementById('start-btn');
  const restartBtn     = document.getElementById('restart-btn');
  const shareBtn       = document.getElementById('share-btn');
  const couponDoneBtn  = document.getElementById('coupon-done-btn');
  const shareStatusEl  = document.getElementById('share-status');
  const couponCodeEl   = document.getElementById('coupon-code');
  const couponExpiryEl = document.getElementById('coupon-expiry');
  const igHandleEl     = document.getElementById('ig-handle');
  const finalScoreEl   = document.getElementById('final-score');
  const bestScoreEl    = document.getElementById('best-score');
  const bestLineEl     = document.getElementById('best-line');
  const logoImg        = document.getElementById('logo');
  const gameOverTitle  = document.getElementById('game-over-title');

  if (igHandleEl) igHandleEl.textContent = IG_HANDLE;

  // --- Resize / scaling ---------------------------------------------------
  let scale = 1;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const targetRatio = VW / VH;
    const screenRatio = w / h;
    let cssW, cssH;
    if (screenRatio > targetRatio) {
      cssH = h; cssW = h * targetRatio;
    } else {
      cssW = w; cssH = w / targetRatio;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    scale = (cssW / VW) * dpr;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // --- Asset loading ------------------------------------------------------
  const assets = {};
  function loadImage(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { assets[name] = img; resolve(); };
      img.onerror = () => { assets[name] = null; resolve(); };
      img.src = src;
    });
  }

  // Strip a near-uniform background color from an image and return a canvas.
  function removeBackground(img, sampleX, sampleY, tolerance) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    const imgData = cx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;
    const sIdx = (sampleY * c.width + sampleX) * 4;
    const sr = d[sIdx], sg = d[sIdx+1], sb = d[sIdx+2];
    const soft = 25;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - sr, dg = d[i+1] - sg, db = d[i+2] - sb;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist < tolerance) {
        d[i+3] = 0;
      } else if (dist < tolerance + soft) {
        d[i+3] = Math.round(255 * (dist - tolerance) / soft);
      }
    }
    cx.putImageData(imgData, 0, 0);
    return c;
  }

  // --- Audio --------------------------------------------------------------
  let audioCtx = null;
  let masterGain = null;
  let bgmGain = null;
  let bgmTimer = null;
  let bgmStartTime = 0;

  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioCtx.destination);
        bgmGain = audioCtx.createGain();
        bgmGain.gain.value = 0.18;
        bgmGain.connect(masterGain);
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function envBeep(freq, duration, type = 'square', vol = 0.18, attack = 0.005) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
  function sfxGood()  { envBeep(880, 0.08, 'square', 0.22); setTimeout(() => envBeep(1320, 0.08, 'square', 0.18), 50); }
  function sfxGreat() { envBeep(660, 0.06, 'square', 0.22); setTimeout(() => envBeep(990, 0.06, 'square', 0.22), 40); setTimeout(() => envBeep(1480, 0.12, 'square', 0.22), 80); }
  function sfxBad()   { envBeep(180, 0.18, 'sawtooth', 0.22); }
  function sfxOver()  { envBeep(440, 0.18, 'square', 0.24); setTimeout(() => envBeep(330, 0.18, 'square', 0.24), 150); setTimeout(() => envBeep(220, 0.34, 'square', 0.24), 300); }
  function sfxTick()  { envBeep(880, 0.04, 'square', 0.14); }
  function sfxPrize() { envBeep(523, 0.10, 'square', 0.24); setTimeout(() => envBeep(659, 0.10, 'square', 0.24), 90); setTimeout(() => envBeep(784, 0.10, 'square', 0.24), 180); setTimeout(() => envBeep(1047, 0.20, 'square', 0.24), 270); }

  // --- Background music (8-bit chiptune loop) -----------------------------
  // Notes (Hz). Major key chord progression: C - Am - F - G, 4 beats each.
  // Tempo: 132 BPM => 1 beat = 0.4545s
  const BPM = 132;
  const BEAT = 60 / BPM;
  // Bass pattern: root note per beat, low octave
  // C(C2) Am(A1) F(F1) G(G1)
  const NOTE = { C2:65.41, A1:55.00, F1:43.65, G1:49.00, E2:82.41,
                 C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88, C5:523.25, D5:587.33, E5:659.25, G5:783.99 };
  const BGM_PATTERN = [
    // each entry: [bassFreq, melodyFreqs[8] for 8 eighth notes]
    [NOTE.C2, [NOTE.E4, NOTE.G4, NOTE.C5, NOTE.G4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5]],
    [NOTE.A1, [NOTE.E4, NOTE.A4, NOTE.C5, NOTE.A4, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5]],
    [NOTE.F1, [NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4, NOTE.F4, NOTE.A4, NOTE.D5, NOTE.F4]],
    [NOTE.G1, [NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G5]],
  ];

  function scheduleBgmBar(barIdx, startAt) {
    if (!audioCtx || !bgmGain) return;
    const [bassFreq, melody] = BGM_PATTERN[barIdx % BGM_PATTERN.length];
    const barLen = 4 * BEAT;
    // Bass: one note per beat
    for (let b = 0; b < 4; b++) {
      const t = startAt + b * BEAT;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassFreq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.9);
      osc.connect(g).connect(bgmGain);
      osc.start(t);
      osc.stop(t + BEAT);
    }
    // Melody: 8 eighth notes
    const eighth = BEAT / 2;
    for (let i = 0; i < 8; i++) {
      const t = startAt + i * eighth;
      const f = melody[i];
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + eighth * 0.85);
      osc.connect(g).connect(bgmGain);
      osc.start(t);
      osc.stop(t + eighth);
    }
    // High blip on beat 1 for sparkle
    const tHi = startAt;
    const oscHi = audioCtx.createOscillator();
    const gHi = audioCtx.createGain();
    oscHi.type = 'square';
    oscHi.frequency.setValueAtTime(melody[0] * 2, tHi);
    gHi.gain.setValueAtTime(0, tHi);
    gHi.gain.linearRampToValueAtTime(0.08, tHi + 0.003);
    gHi.gain.exponentialRampToValueAtTime(0.001, tHi + eighth * 0.5);
    oscHi.connect(gHi).connect(bgmGain);
    oscHi.start(tHi);
    oscHi.stop(tHi + eighth);
    return barLen;
  }

  let bgmNextBarTime = 0;
  let bgmBarIdx = 0;
  function startBgm() {
    if (!audioCtx) return;
    stopBgm();
    bgmGain.gain.cancelScheduledValues(audioCtx.currentTime);
    bgmGain.gain.setValueAtTime(0, audioCtx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.3);
    bgmStartTime = audioCtx.currentTime + 0.05;
    bgmNextBarTime = bgmStartTime;
    bgmBarIdx = 0;
    // Schedule a few bars ahead and refresh every second
    function pump() {
      if (!audioCtx || !bgmGain) return;
      while (bgmNextBarTime < audioCtx.currentTime + 1.5) {
        const len = scheduleBgmBar(bgmBarIdx, bgmNextBarTime);
        bgmNextBarTime += len;
        bgmBarIdx++;
      }
    }
    pump();
    bgmTimer = setInterval(pump, 500);
  }
  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (bgmGain && audioCtx) {
      const t = audioCtx.currentTime;
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(0, t + 0.25);
    }
  }

  // --- Food sprite drawing (uses assets/food_<key>.png) -------------------
  function drawFoodSprite(type, size) {
    const sprite = assets['food_' + type];
    if (sprite) {
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      return;
    }
    // fallback: colored square if sprite missing
    ctx.fillStyle = FOOD_TYPES[type] ? FOOD_TYPES[type].color : '#fff';
    ctx.fillRect(-size / 2, -size / 2, size, size);
  }

  // --- Legacy pixel art (kept as fallback if sprites fail to load) -------
  function drawChicken(x, y, s) {
    const px = (cx, cy, cw, ch, color) => { ctx.fillStyle = color; ctx.fillRect(x + cx*s, y + cy*s, cw*s, ch*s); };
    px(6, 0, 4, 2, '#fff5d6');
    px(5, 1, 6, 2, '#fff5d6');
    px(5, 2, 1, 1, '#000'); px(10, 2, 1, 1, '#000');
    px(3, 3, 10, 2, '#d97a1a');
    px(2, 4, 12, 8, '#d97a1a');
    px(3, 12, 10, 2, '#d97a1a');
    px(4, 5, 2, 2, '#ffb347');
    px(8, 6, 2, 2, '#ffb347');
    px(11, 8, 2, 2, '#ffb347');
    px(5, 9, 2, 2, '#ffb347');
    px(9, 11, 2, 2, '#ffb347');
    px(2, 11, 1, 2, '#8b4a0a');
    px(13, 6, 1, 5, '#8b4a0a');
    px(4, 13, 8, 1, '#8b4a0a');
    px(2, 3, 1, 1, '#000'); px(13, 3, 1, 1, '#000');
    px(1, 4, 1, 8, '#000'); px(14, 4, 1, 8, '#000');
    px(2, 12, 1, 1, '#000'); px(13, 12, 1, 1, '#000');
    px(3, 13, 1, 1, '#000'); px(12, 13, 1, 1, '#000');
    px(4, 14, 8, 1, '#000');
  }
  function drawBurger(x, y, s) {
    const px = (cx, cy, cw, ch, color) => { ctx.fillStyle = color; ctx.fillRect(x + cx*s, y + cy*s, cw*s, ch*s); };
    px(2, 0, 12, 1, '#000');
    px(1, 1, 14, 3, '#e8a04a');
    px(3, 1, 1, 1, '#fff5d6'); px(7, 1, 1, 1, '#fff5d6'); px(11, 1, 1, 1, '#fff5d6');
    px(5, 2, 1, 1, '#fff5d6'); px(9, 2, 1, 1, '#fff5d6');
    px(1, 1, 1, 3, '#000'); px(14, 1, 1, 3, '#000');
    px(1, 4, 14, 2, '#5db85d');
    px(2, 5, 1, 1, '#3a8a3a'); px(6, 5, 1, 1, '#3a8a3a'); px(10, 5, 1, 1, '#3a8a3a');
    px(1, 6, 14, 1, '#e74c3c');
    px(1, 7, 14, 3, '#5a3417');
    px(3, 8, 2, 1, '#3a2010'); px(8, 8, 2, 1, '#3a2010'); px(12, 9, 2, 1, '#3a2010');
    px(1, 10, 14, 1, '#ffcb3d');
    px(0, 10, 1, 2, '#ffcb3d'); px(15, 10, 1, 2, '#ffcb3d');
    px(2, 11, 12, 4, '#d4892b');
    px(2, 12, 12, 2, '#b87324');
    px(1, 4, 14, 1, '#000');
    px(0, 5, 1, 6, '#000'); px(15, 5, 1, 6, '#000');
    px(1, 11, 1, 4, '#000'); px(14, 11, 1, 4, '#000');
    px(2, 15, 12, 1, '#000');
  }
  function drawCola(x, y, s) {
    const px = (cx, cy, cw, ch, color) => { ctx.fillStyle = color; ctx.fillRect(x + cx*s, y + cy*s, cw*s, ch*s); };
    px(3, 2, 10, 1, '#000');
    px(2, 3, 12, 12, '#e74c3c');
    px(3, 2, 10, 1, '#e74c3c');
    px(2, 6, 12, 3, '#fff');
    px(4, 7, 1, 1, '#e74c3c'); px(5, 7, 1, 1, '#e74c3c'); px(6, 7, 1, 1, '#e74c3c');
    px(9, 7, 2, 1, '#e74c3c');
    px(12, 3, 1, 12, '#a82c20');
    px(3, 3, 1, 12, '#ff6b5e');
    px(2, 1, 12, 2, '#dadada');
    px(3, 0, 10, 1, '#dadada');
    px(8, -2, 2, 4, '#fff');
    px(1, 1, 1, 1, '#000'); px(14, 1, 1, 1, '#000');
    px(2, 0, 1, 1, '#000'); px(13, 0, 1, 1, '#000');
    px(3, -1, 10, 1, '#000');
    px(7, -2, 1, 4, '#000'); px(10, -2, 1, 4, '#000');
    px(1, 3, 1, 12, '#000'); px(14, 3, 1, 12, '#000');
    px(2, 15, 12, 1, '#000');
    px(2, 6, 12, 1, '#000'); px(2, 9, 12, 1, '#000');
  }
  function drawFries(x, y, s) {
    const px = (cx, cy, cw, ch, color) => { ctx.fillStyle = color; ctx.fillRect(x + cx*s, y + cy*s, cw*s, ch*s); };
    px(3, 0, 2, 8, '#ffcb3d');
    px(6, -1, 2, 9, '#ffd84a');
    px(9, 0, 2, 8, '#ffcb3d');
    px(11, 1, 2, 7, '#ffb347');
    px(3, 0, 2, 1, '#fff5d6'); px(6, -1, 2, 1, '#fff5d6');
    px(9, 0, 2, 1, '#fff5d6'); px(11, 1, 2, 1, '#fff5d6');
    px(2, 0, 1, 8, '#000'); px(5, 0, 1, 8, '#000');
    px(5, -1, 1, 9, '#000'); px(8, -1, 1, 9, '#000');
    px(8, 0, 1, 8, '#000'); px(11, 0, 1, 8, '#000');
    px(10, 1, 1, 7, '#000'); px(13, 1, 1, 7, '#000');
    px(2, 8, 12, 1, '#000');
    px(1, 9, 14, 6, '#e74c3c');
    px(2, 9, 1, 6, '#ff7060'); px(13, 9, 1, 6, '#a82c20');
    px(4, 11, 2, 3, '#fff'); px(8, 10, 2, 4, '#fff'); px(11, 11, 2, 3, '#fff');
    px(0, 9, 1, 6, '#000'); px(15, 9, 1, 6, '#000');
    px(1, 15, 14, 1, '#000');
    px(2, 8, 12, 1, '#000');
  }
  const FOOD_DRAW = { chicken: drawChicken, burger: drawBurger, cola: drawCola, fries: drawFries };

  // --- Game state ---------------------------------------------------------
  const state = {
    running: false,
    won: false,
    timeLeft: GAME_DURATION,
    score: 0,
    combo: 0,
    foods: [],
    particles: [],
    rings: [],
    popups: [],
    sparkles: [],
    spawnTimer: 0,
    elapsed: 0,
    flash: 0,
    flashColor: '#fff',
    comboText: null,
    lastTickAt: GAME_DURATION,
  };

  const player = {
    x: VW / 2,
    y: VH - 110,
    w: 90,
    h: 130,
    targetX: VW / 2,
    bobPhase: 0,
    celebrate: 0,    // 0..1 timer for raised-arms manse pose (good catch)
    sad: 0,          // 0..1 timer for unhappy reaction (bad catch)
    shakeX: 0,
  };

  function resetGame() {
    state.running = true;
    state.won = false;
    state.timeLeft = GAME_DURATION;
    state.score = 0;
    state.combo = 0;
    state.foods.length = 0;
    state.particles.length = 0;
    state.rings.length = 0;
    state.popups.length = 0;
    state.sparkles.length = 0;
    state.spawnTimer = 0.6;
    state.elapsed = 0;
    state.flash = 0;
    state.comboText = null;
    state.lastTickAt = GAME_DURATION;
    player.x = VW / 2;
    player.targetX = VW / 2;
    player.celebrate = 0;
    player.sad = 0;
    player.shakeX = 0;
  }

  function pickFoodType() {
    const total = Object.values(FOOD_TYPES).reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * total;
    for (const [name, def] of Object.entries(FOOD_TYPES)) {
      r -= def.weight;
      if (r <= 0) return name;
    }
    return 'chicken';
  }
  function spawnFood() {
    const type = pickFoodType();
    const margin = 30;
    const x = margin + Math.random() * (VW - margin * 2);
    const progress = Math.min(1, state.elapsed / GAME_DURATION);
    const baseSpeed = 220 + progress * 320;
    const speed = baseSpeed * (0.85 + Math.random() * 0.3);
    state.foods.push({
      type, x, y: -40, vy: speed,
      rot: (Math.random() - 0.5) * 0.4,
      rotV: (Math.random() - 0.5) * 1.5,
      size: 56,
    });
  }

  function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 160;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.7,
        color,
        size: 4 + Math.random() * 3,
      });
    }
  }
  function spawnRing(x, y, color) {
    state.rings.push({ x, y, r: 4, maxR: 80, life: 0.45, maxLife: 0.45, color });
  }
  function spawnPopup(x, y, text, color) {
    state.popups.push({ x, y, text, color, life: 0.9, maxLife: 0.9, vy: -55 });
  }
  function spawnSparkles(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 28;
      state.sparkles.push({
        x: x + Math.cos(a) * r * 0.4,
        y: y + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * 50,
        vy: Math.sin(a) * 50 - 30,
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8,
        size: 3 + Math.random() * 2,
        spin: Math.random() * Math.PI,
      });
    }
  }
  function showComboText(text, color) {
    state.comboText = { text, color, life: 0.9, maxLife: 0.9 };
  }

  // --- Input --------------------------------------------------------------
  let pointerActive = false;
  function pointerToGameX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return ratio * VW;
  }
  function onDown(e) {
    if (!state.running) return;
    pointerActive = true;
    const t = e.touches ? e.touches[0] : e;
    player.targetX = pointerToGameX(t.clientX);
    e.preventDefault();
  }
  function onMove(e) {
    if (!state.running || !pointerActive) return;
    const t = e.touches ? e.touches[0] : e;
    player.targetX = pointerToGameX(t.clientX);
    e.preventDefault();
  }
  function onUp(e) {
    pointerActive = false;
    if (e.cancelable) e.preventDefault();
  }
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp, { passive: false });
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onUp);

  // --- Collision ----------------------------------------------------------
  function playerHitbox() {
    return { x: player.x - player.w * 0.35, y: player.y - 30, w: player.w * 0.7, h: 50 };
  }
  function foodHitbox(f) {
    return { x: f.x - f.size * 0.4, y: f.y - f.size * 0.4, w: f.size * 0.8, h: f.size * 0.8 };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // --- Update -------------------------------------------------------------
  function update(dt) {
    if (!state.running) return;
    state.elapsed += dt;
    state.timeLeft -= dt;

    if (state.timeLeft <= 3 && state.timeLeft > 0) {
      const intSec = Math.ceil(state.timeLeft);
      if (intSec < state.lastTickAt) { state.lastTickAt = intSec; sfxTick(); }
    }
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame();
      return;
    }

    state.spawnTimer -= dt;
    const progress = Math.min(1, state.elapsed / GAME_DURATION);
    const spawnInterval = 0.85 - progress * 0.55;
    if (state.spawnTimer <= 0) {
      spawnFood();
      state.spawnTimer = spawnInterval * (0.7 + Math.random() * 0.6);
    }

    // player smoothing
    player.x += (player.targetX - player.x) * Math.min(1, dt * 18);
    player.x = Math.max(player.w * 0.4, Math.min(VW - player.w * 0.4, player.x));
    player.bobPhase += dt * 6;
    if (player.celebrate > 0) player.celebrate = Math.max(0, player.celebrate - dt / 0.45);
    if (player.sad > 0) player.sad = Math.max(0, player.sad - dt / 0.5);
    player.shakeX *= Math.max(0, 1 - dt * 12);

    // foods + collision
    const ph = playerHitbox();
    for (let i = state.foods.length - 1; i >= 0; i--) {
      const f = state.foods[i];
      f.y += f.vy * dt;
      f.rot += f.rotV * dt;

      if (rectsOverlap(foodHitbox(f), ph)) {
        const def = FOOD_TYPES[f.type];
        state.score = Math.max(0, state.score + def.points);
        if (state.score > SCORE_CAP) state.score = SCORE_CAP;
        if (def.good) {
          state.combo += 1;
          let bonus = 0;
          if (state.combo >= 5 && state.combo % 3 === 0) {
            bonus = 1;
            state.score += bonus;
            showComboText(`COMBO x${state.combo}  +${def.points + bonus}`, '#ffd84a');
            sfxGreat();
            spawnSparkles(player.x, player.y - player.h * 0.7, 10);
          } else if (state.combo >= 5) {
            showComboText(`COMBO x${state.combo}`, '#ffd84a');
            sfxGood();
            spawnSparkles(player.x, player.y - player.h * 0.7, 6);
          } else {
            sfxGood();
            spawnSparkles(player.x, player.y - player.h * 0.7, 4);
          }
          state.flash = 0.18; state.flashColor = '#ffd84a';
          spawnParticles(f.x, f.y, '#ffd84a', 10);
          spawnRing(f.x, f.y, '#ffd84a');
          spawnPopup(f.x, f.y - 10, `+${def.points + bonus}`, '#6fff8a');
          player.celebrate = 1;
          player.sad = 0;
        } else {
          state.combo = 0;
          showComboText(`-1`, '#ff6b6b');
          sfxBad();
          state.flash = 0.18; state.flashColor = '#ff6b6b';
          spawnParticles(f.x, f.y, '#ff6b6b', 10);
          spawnRing(f.x, f.y, '#ff6b6b');
          spawnPopup(f.x, f.y - 10, `-1`, '#ff6b6b');
          player.sad = 1;
          player.celebrate = 0;
          player.shakeX = (Math.random() < 0.5 ? -1 : 1) * 6;
        }
        state.foods.splice(i, 1);
        // Win check — hit the cap, end game right away
        if (state.score >= SCORE_CAP) {
          state.won = true;
          endGame();
          return;
        }
        continue;
      }
      if (f.y - f.size > VH) {
        if (FOOD_TYPES[f.type].good) state.combo = 0;
        state.foods.splice(i, 1);
      }
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // rings
    for (let i = state.rings.length - 1; i >= 0; i--) {
      const r = state.rings[i];
      r.life -= dt;
      if (r.life <= 0) { state.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.maxLife;
      r.r = 4 + (r.maxR - 4) * t;
    }
    // popups
    for (let i = state.popups.length - 1; i >= 0; i--) {
      const p = state.popups[i];
      p.life -= dt;
      if (p.life <= 0) { state.popups.splice(i, 1); continue; }
      p.y += p.vy * dt;
      p.vy *= Math.max(0, 1 - dt * 1.4);
    }
    // sparkles
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      const sp = state.sparkles[i];
      sp.life -= dt;
      if (sp.life <= 0) { state.sparkles.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      sp.vy += 280 * dt;
      sp.spin += dt * 8;
    }

    if (state.flash > 0) state.flash -= dt;
    if (state.comboText) {
      state.comboText.life -= dt;
      if (state.comboText.life <= 0) state.comboText = null;
    }
  }

  // --- Draw ---------------------------------------------------------------
  let logoNeonPhase = 0;
  function drawBackground() {
    if (assets.background) {
      const img = assets.background;
      const aspect = img.width / img.height;
      const targetAspect = VW / VH;
      let sx, sy, sw, sh;
      if (aspect > targetAspect) {
        sh = img.height; sw = img.height * targetAspect;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = img.width / targetAspect;
        sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, VW, VH);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, '#0d0d2a'); g.addColorStop(1, '#3a1a3a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, VW, VH);

    // Chimmelier logo as a neon sign — sits high in the skyline,
    // safely above the HUD bar (HUD ends around y=72 with pad+barH+gap)
    if (assets.logo) {
      logoNeonPhase += 0.04;
      const flicker = 0.85 + 0.15 * Math.sin(logoNeonPhase * 3) * Math.sin(logoNeonPhase);
      const lw = 360;
      const lh = lw * (assets.logo.height / assets.logo.width);
      const lx = (VW - lw) / 2;
      const ly = 90;
      // soft red glow halo
      const glowR = 140;
      const grad = ctx.createRadialGradient(VW/2, ly + lh/2, 10, VW/2, ly + lh/2, glowR);
      grad.addColorStop(0, `rgba(255, 100, 60, ${0.32 * flicker})`);
      grad.addColorStop(1, 'rgba(255, 100, 60, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(VW/2 - glowR, ly + lh/2 - glowR, glowR*2, glowR*2);
      // logo with slight flicker via alpha
      ctx.globalAlpha = flicker;
      ctx.drawImage(assets.logo, lx, ly, lw, lh);
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer() {
    const cel = player.celebrate; // 0..1
    const sad = player.sad;
    const bob = Math.sin(player.bobPhase) * 2;
    // celebrate jump up
    const jump = -22 * Math.sin(Math.PI * cel);
    // sad squat
    const squat = 6 * Math.sin(Math.PI * sad);
    // squash factors
    const sx = 1 - cel * 0.04 + sad * 0.04;
    const sy = 1 + cel * 0.06 - sad * 0.06;
    const w = player.w * sx;
    const h = player.h * sy;
    const drawX = player.x + player.shakeX;
    const px = Math.round(drawX - w / 2);
    const py = Math.round(player.y - h + bob + jump + squat);

    // glow halo when celebrating
    if (cel > 0) {
      const glowR = 60 + 20 * Math.sin(Math.PI * cel);
      const glowA = 0.35 * cel;
      const grad = ctx.createRadialGradient(player.x, player.y - player.h * 0.5, 4, player.x, player.y - player.h * 0.5, glowR);
      grad.addColorStop(0, `rgba(255, 216, 74, ${glowA})`);
      grad.addColorStop(1, `rgba(255, 216, 74, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(player.x - glowR, player.y - player.h * 0.5 - glowR, glowR * 2, glowR * 2);
    }

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const shadowScale = 1 - cel * 0.2;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 4, player.w * 0.4 * shadowScale, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // pick sprite based on celebrate state
    const sprite = (cel > 0 && assets.characterManse) ? assets.characterManse : assets.character;

    if (sprite) {
      ctx.drawImage(sprite, px, py, w, h);
    } else {
      // fallback simple pixel chimmelier
      ctx.fillStyle = '#000';
      ctx.fillRect(px + 14, py + 14, 62, 14);
      ctx.fillRect(px + 28, py, 34, 18);
      ctx.fillStyle = '#f5d8a6';
      ctx.fillRect(px + 30, py + 28, 30, 22);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(px + 18, py + 50, 54, 70);
      ctx.fillStyle = '#000';
      ctx.fillRect(px + 42, py + 50, 6, 70);
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 22, py + 118, 18, 14);
      ctx.fillRect(px + 50, py + 118, 18, 14);
    }
  }

  function drawFood(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    drawFoodSprite(f.type, f.size);
    ctx.restore();
  }

  function drawHUD() {
    const pad = 14;
    const barH = 44;

    const grad = ctx.createLinearGradient(0, 0, 0, barH + 24);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, barH + 24);

    const seconds = Math.max(0, state.timeLeft);
    const tStr = seconds.toFixed(1) + 's';
    const lowTime = state.timeLeft <= 5;
    drawPanel(pad, pad, 150, barH);
    ctx.fillStyle = lowTime ? '#ff6b6b' : '#9090a8';
    ctx.font = `10px ${FONT_PIXEL}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('TIME', pad + 10, pad + 12);
    ctx.fillStyle = lowTime ? '#ff6b6b' : '#fff';
    ctx.font = `bold 18px ${FONT_PIXEL}`;
    ctx.fillText(tStr, pad + 10, pad + 30);

    drawPanel(VW - pad - 150, pad, 150, barH);
    ctx.fillStyle = '#9090a8';
    ctx.font = `10px ${FONT_PIXEL}`;
    ctx.textAlign = 'right';
    ctx.fillText('POINTS', VW - pad - 10, pad + 12);
    ctx.font = `bold 18px ${FONT_PIXEL}`;
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(String(state.score), VW - pad - 10, pad + 30);

    if (state.combo >= 2) {
      ctx.font = `12px ${FONT_PIXEL}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = state.combo >= 5 ? '#ffd84a' : '#fff';
      ctx.fillText(`x${state.combo} COMBO`, VW/2, pad + barH/2);
    }

    if (state.comboText) {
      const c = state.comboText;
      const alpha = Math.min(1, c.life / c.maxLife * 1.5);
      const lift = (1 - c.life / c.maxLife) * 40;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.color;
      ctx.font = `bold 22px ${FONT_PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.text, VW/2, VH * 0.42 - lift);
      ctx.globalAlpha = 1;
    }
  }

  function drawPanel(x, y, w, h) {
    ctx.fillStyle = 'rgba(13, 13, 26, 0.7)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 216, 74, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawSparkle(s) {
    const a = Math.max(0, s.life / s.maxLife);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.spin);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-s.size, -1, s.size * 2, 2);
    ctx.fillRect(-1, -s.size, 2, s.size * 2);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground();

    for (const f of state.foods) drawFood(f);
    drawPlayer();

    // particles
    for (const p of state.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // splat rings
    for (const r of state.rings) {
      const a = Math.max(0, r.life / r.maxLife);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // sparkles
    for (const s of state.sparkles) drawSparkle(s);

    // popups (score floaters)
    for (const p of state.popups) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife * 1.5));
      ctx.globalAlpha = a;
      ctx.font = `bold 22px ${FONT_PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // dark outline
      ctx.fillStyle = '#000';
      ctx.fillText(p.text, p.x + 2, p.y + 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    drawHUD();

    if (state.flash > 0) {
      ctx.globalAlpha = Math.min(0.45, state.flash * 2.5);
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- Loop ---------------------------------------------------------------
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // --- Game over ----------------------------------------------------------
  let lastEndScore = 0;
  let lastEndWon = false;
  let hasShared = false;
  function endGame() {
    state.running = false;
    stopBgm();
    if (state.won) sfxGreat(); else sfxOver();
    lastEndScore = state.score;
    lastEndWon = !!state.won;
    hasShared = false;
    gameOverTitle.textContent = state.won ? 'YOU WIN! 🏆' : "TIME'S UP!";
    finalScoreEl.textContent = String(state.score);
    const prev = getBest();
    const best = Math.max(state.score, prev);
    setBest(best);
    if (state.won) {
      bestLineEl.textContent = `★ MAX SCORE — ${SCORE_CAP} POINTS ★`;
    } else {
      bestLineEl.textContent = state.score > 0 && state.score >= best
        ? `★ NEW HIGH SCORE: ${best} ★`
        : `BEST: ${best}`;
    }
    // Reset share button + coupon for new round
    currentCoupon = null;
    shareBtn.disabled = false;
    shareBtn.textContent = '📸 SHARE SCORE';
    shareStatusEl.textContent = '';
    removeSharedFallbackButton();
    couponScreen.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
  }

  function getBest() {
    try { return parseInt(localStorage.getItem('chimmelier_best') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setBest(v) {
    try { localStorage.setItem('chimmelier_best', String(v)); } catch (e) {}
  }
  function refreshBestOnStart() {
    const b = getBest();
    bestScoreEl.textContent = b > 0 ? `BEST: ${b}` : '';
  }

  // --- Coupon code + expiry ----------------------------------------------
  // Format: CHM-YYMMDD-XXXX
  // - YYMMDD: issue date (helps store staff verify expiry at a glance)
  // - XXXX: 4 chars from a 30-symbol alphabet (no confusing 0/O/1/I/L) → 810,000 combos/day
  // For real anti-fraud you also need server-side issuance (see notes to user).
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function genCouponCode(date) {
    const yy = String(date.getFullYear() % 100).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    let rand = '';
    // Use crypto for stronger uniqueness if available
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint8Array(4);
      window.crypto.getRandomValues(buf);
      for (let i = 0; i < 4; i++) rand += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    } else {
      for (let i = 0; i < 4; i++) rand += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return `${COUPON_PREFIX}-${yy}${mm}${dd}-${rand}`;
  }

  function formatExpiry(date) {
    // e.g. "MAY 03, 2026"
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const m = months[date.getMonth()];
    const d = String(date.getDate()).padStart(2, '0');
    const y = date.getFullYear();
    return `${m} ${d}, ${y}`;
  }

  let currentCoupon = null; // { code, issued, expiry }
  function issueCoupon() {
    const issued = new Date();
    const expiry = new Date(issued.getTime() + COUPON_DAYS * 24 * 60 * 60 * 1000);
    expiry.setHours(23, 59, 59, 999);
    const code = genCouponCode(issued);
    currentCoupon = { code, issued, expiry };
    // Track issued codes per device (best-effort de-dupe + audit log)
    try {
      const log = JSON.parse(localStorage.getItem('chimmelier_coupons') || '[]');
      log.push({ code, issued: issued.toISOString(), expiry: expiry.toISOString(), score: lastEndScore });
      // keep last 50
      while (log.length > 50) log.shift();
      localStorage.setItem('chimmelier_coupons', JSON.stringify(log));
    } catch (e) {}
    return currentCoupon;
  }

  // --- Share card image (1080x1920 IG Story portrait) --------------------
  function buildShareCard(score) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;

    // background — dark night gradient
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0d2a');
    bg.addColorStop(0.55, '#2a1530');
    bg.addColorStop(1, '#0d0d1a');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);

    // background image at top (street scene)
    if (assets.background) {
      const img = assets.background;
      const aspect = img.width / img.height;
      const targetW = W;
      const targetH = targetW / aspect;
      x.globalAlpha = 0.55;
      x.drawImage(img, 0, 0, targetW, targetH);
      x.globalAlpha = 1;
      // gradient fade to dark
      const fade = x.createLinearGradient(0, targetH * 0.5, 0, targetH);
      fade.addColorStop(0, 'rgba(13,13,26,0)');
      fade.addColorStop(1, 'rgba(13,13,26,1)');
      x.fillStyle = fade;
      x.fillRect(0, targetH * 0.5, W, targetH);
    }

    // logo
    if (assets.logo) {
      const lw = W * 0.78;
      const lh = lw * (assets.logo.height / assets.logo.width);
      x.drawImage(assets.logo, (W - lw) / 2, 200, lw, lh);
    }

    // "I SCORED"
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#9090a8';
    x.font = `bold 56px ${FONT_PIXEL}`;
    x.fillText('I SCORED', W / 2, 820);

    // big score number
    x.font = `bold 360px ${FONT_PIXEL}`;
    const scoreStr = String(score);
    // shadow
    x.fillStyle = '#c0392b';
    x.fillText(scoreStr, W / 2 + 12, 1080 + 12);
    x.fillStyle = '#000';
    x.fillText(scoreStr, W / 2 + 24, 1080 + 24);
    // main
    x.fillStyle = '#ffd84a';
    x.fillText(scoreStr, W / 2, 1080);

    x.font = `bold 56px ${FONT_PIXEL}`;
    x.fillStyle = '#9090a8';
    x.fillText('POINTS', W / 2, 1340);

    // chef sprite (manse pose if available)
    const chef = assets.characterManse || assets.character;
    if (chef) {
      const cw = 280;
      const ch = cw * (chef.height / chef.width);
      x.drawImage(chef, W / 2 - cw / 2, 1420, cw, ch);
    }

    // bottom CTA strip
    x.fillStyle = '#c0392b';
    x.fillRect(0, H - 220, W, 220);
    x.fillStyle = '#ffd84a';
    x.font = `bold 50px ${FONT_PIXEL}`;
    x.fillText('CAN YOU BEAT MY SCORE?', W / 2, H - 150);
    x.fillStyle = '#fff';
    x.font = `bold 64px ${FONT_PIXEL}`;
    x.fillText(IG_HANDLE, W / 2, H - 70);

    return c;
  }

  function canvasToBlob(c) {
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }

  // --- Share flow ---------------------------------------------------------
  // The button click MUST synchronously open Instagram so popup blockers
  // don't kill it. We pre-open the IG window, then fill in the rest async.
  function openInstagram() {
    // Try app deep link first (mobile); browser ignores if not installed.
    // Then open the profile page as the visible/persistent destination.
    const win = window.open(IG_URL, '_blank', 'noopener,noreferrer');
    // Best-effort iOS/Android app deep link (silent if not installed)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = IG_DEEPLINK;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 500);
    } catch (e) {}
    return win;
  }

  function downloadImage(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function doShare(e) {
    ensureAudio();
    sfxPrize();
    shareBtn.disabled = true;
    shareBtn.textContent = 'OPENING INSTAGRAM…';
    shareStatusEl.textContent = '';
    // Mark as shared NOW so visibilitychange recovery works even if the
    // user backgrounds the tab during the share sheet.
    hasShared = true;

    // Build the share card image
    let blob, file;
    try {
      const card = buildShareCard(lastEndScore);
      blob = await canvasToBlob(card);
      file = new File([blob], 'chimmelier-score.png', { type: 'image/png' });
    } catch (err) {
      shareStatusEl.textContent = 'Could not build share image.';
      shareBtn.disabled = false;
      shareBtn.textContent = '📸 SHARE SCORE';
      hasShared = false;
      return;
    }

    const shareText = `I scored ${lastEndScore} points at Chimmelier! 🍗 Tag ${IG_HANDLE} ${SHARE_HASHTAGS}`;

    // Path A: Native share sheet with file (HTTPS only, modern mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'My Chimmelier Score',
          text: shareText,
        });
        revealCoupon();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          shareStatusEl.textContent = 'Cancelled — tap again to share';
          shareBtn.disabled = false;
          shareBtn.textContent = '📸 SHARE SCORE';
          hasShared = false;
          return;
        }
        // fall through to Path B
      }
    }

    // Path B: HTTP / desktop / no file-share — open Instagram directly
    // and save the score image so the user can attach it.
    downloadImage(blob, 'chimmelier-score.png');
    openInstagram();
    shareStatusEl.innerHTML =
      `Score saved &amp; Instagram opened!<br/>` +
      `Upload to Stories &amp; tag ${IG_HANDLE}<br/>` +
      `<b>Come back here for your coupon ↓</b>`;
    // Reveal coupon shortly after — the user is now in IG.
    // When they return to this tab, the coupon screen is already up.
    setTimeout(revealCoupon, 1200);
    // Also offer a manual button as ultimate fallback
    showSharedFallbackButton();
  }

  // Manual fallback: if the user thinks the share didn't trigger the coupon,
  // they can tap this to reveal it. We only show it after they've shared once.
  function showSharedFallbackButton() {
    if (document.getElementById('manual-coupon-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'manual-coupon-btn';
    btn.className = 'btn btn-secondary';
    btn.textContent = "I SHARED — SHOW MY COUPON";
    btn.style.marginTop = '14px';
    btn.addEventListener('click', () => {
      ensureAudio();
      revealCoupon();
    });
    // insert after the share status, inside the prize box
    if (shareStatusEl && shareStatusEl.parentNode) {
      shareStatusEl.parentNode.appendChild(btn);
    }
  }
  function removeSharedFallbackButton() {
    const btn = document.getElementById('manual-coupon-btn');
    if (btn) btn.remove();
  }

  function revealCoupon() {
    // Idempotent — if coupon already shown (or already issued for this round), do nothing.
    if (!couponScreen.classList.contains('hidden')) return;
    if (!currentCoupon) {
      const coupon = issueCoupon();
      couponCodeEl.textContent = coupon.code;
      couponExpiryEl.textContent = formatExpiry(coupon.expiry);
    }
    removeSharedFallbackButton();
    gameOverScreen.classList.add('hidden');
    couponScreen.classList.remove('hidden');
  }

  // --- Wiring -------------------------------------------------------------
  shareBtn.addEventListener('click', doShare);
  couponDoneBtn.addEventListener('click', () => {
    ensureAudio();
    startBgm();
    couponScreen.classList.add('hidden');
    resetGame();
  });

  startBtn.addEventListener('click', () => {
    ensureAudio();
    startBgm();
    startScreen.classList.add('hidden');
    resetGame();
  });
  restartBtn.addEventListener('click', () => {
    ensureAudio();
    startBgm();
    gameOverScreen.classList.add('hidden');
    resetGame();
  });

  // Pause BGM when tab hidden + recover the coupon flow when user returns
  // from Instagram. If they shared but coupon screen isn't showing yet,
  // surface it now (handles cases where the share promise never resolved
  // because the user app-switched to Instagram and back).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopBgm();
    } else {
      if (state.running) startBgm();
      const onGameOver = !gameOverScreen.classList.contains('hidden');
      if (hasShared && onGameOver) {
        revealCoupon();
      }
    }
  });
  // Same recovery on focus (some browsers don't fire visibilitychange)
  window.addEventListener('focus', () => {
    const onGameOver = !gameOverScreen.classList.contains('hidden');
    if (hasShared && onGameOver) revealCoupon();
  });

  // --- Boot ---------------------------------------------------------------
  Promise.all([
    loadImage('character', 'assets/character.png'),
    loadImage('characterManse', 'assets/character_manse.png'),
    loadImage('background', 'assets/background.png'),
    loadImage('logo', 'assets/logo.png'),
    loadImage('coupon', 'assets/coupon.png'),
    loadImage('food_chickenburger', 'assets/food_burger.png'),
    loadImage('food_drumstick',     'assets/food_drumstick.png'),
    loadImage('food_cola',          'assets/food_cola.png'),
    loadImage('food_treadmill',     'assets/food_treadmill.png'),
    loadImage('food_bomb',          'assets/food_bomb.png'),
    document.fonts ? document.fonts.ready : Promise.resolve(),
  ]).then(() => {
    if (assets.character) {
      assets.character = removeBackground(assets.character, 4, 4, 60);
    }
    if (assets.characterManse) {
      assets.characterManse = removeBackground(assets.characterManse, 4, 4, 60);
    }
    if (assets.logo && logoImg) {
      const stripped = removeBackground(assets.logo, 4, 4, 30);
      try { logoImg.src = stripped.toDataURL('image/png'); } catch (e) {}
      // also keep the stripped version for in-canvas rendering
      assets.logo = stripped;
    }
    refreshBestOnStart();
    requestAnimationFrame((t) => { lastTime = t; loop(t); });
  });
})();
