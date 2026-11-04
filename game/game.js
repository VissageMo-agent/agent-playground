/**
 * 「泡泡禅」的视图层：Canvas 绘制、指针交互、音效与界面状态。
 * 核心计分逻辑在 bubble-zen.js，这里只负责把状态画出来。
 */
(function () {
  'use strict';

  var Zen = window.BubbleZen;
  if (!Zen) {
    return;
  }

  var TAU = Math.PI * 2;
  var canvas = document.getElementById('board');
  var stage = document.getElementById('stage');
  var ctx = canvas.getContext('2d');

  var startScreen = document.getElementById('startScreen');
  var endScreen = document.getElementById('endScreen');
  var startBest = document.getElementById('startBest');
  var modeChip = document.getElementById('modeChip');
  var hint = document.getElementById('hint');
  var soundBtn = document.getElementById('soundBtn');
  var newSheetBtn = document.getElementById('newSheetBtn');
  var exitBtn = document.getElementById('exitBtn');
  var replayBtn = document.getElementById('replayBtn');
  var homeBtn = document.getElementById('homeBtn');
  var combo = document.getElementById('combo');
  var comboChain = document.getElementById('comboChain');
  var comboMult = document.getElementById('comboMult');
  var primaryLabel = document.getElementById('primaryLabel');
  var primaryValue = document.getElementById('primaryValue');
  var bestStat = document.getElementById('bestStat');
  var bestValue = document.getElementById('bestValue');
  var sheetStat = document.getElementById('sheetStat');
  var sheetValue = document.getElementById('sheetValue');
  var timeStat = document.getElementById('timeStat');
  var timeValue = document.getElementById('timeValue');
  var timerFill = document.getElementById('timerFill');
  var endScore = document.getElementById('endScore');
  var endPopped = document.getElementById('endPopped');
  var endCombo = document.getElementById('endCombo');
  var endBest = document.getElementById('endBest');
  var endCopy = document.getElementById('endCopy');
  var recordBadge = document.getElementById('recordBadge');
  var liveRegion = document.getElementById('liveRegion');

  var storage = safeStorage();
  var muted = loadMuted();

  var state = {
    session: null,
    previewSheet: null,
    previewEnteredAt: 0,
    previewSeed: randomSeed(),
    width: 0,
    height: 0,
    dpr: 1,
    hovered: -1,
    pointerDown: false,
    activePointer: null,
    lastPoint: null,
    particles: [],
    petals: [],
    floaters: [],
    pendingRefillAt: null,
    reducedMotion: false,
    lastTimestamp: 0,
    lastComboChain: 0,
    lastSoundAt: -1,
    spriteCache: new Map()
  };

  /* ---------------------------------------------------------------- 工具 */

  function safeStorage() {
    try {
      var candidate = window.localStorage;
      var probe = '__bubble_zen__';
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      return candidate;
    } catch (error) {
      return null;
    }
  }

  function randomSeed() {
    return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  }

  function now() {
    return window.performance && window.performance.now
      ? window.performance.now()
      : Date.now();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatNumber(value) {
    return String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatTime(ms) {
    var seconds = Math.max(0, Math.ceil(ms / 1000));
    var minutes = Math.floor(seconds / 60);
    return minutes + ':' + String(seconds % 60).padStart(2, '0');
  }

  function setText(element, text) {
    if (!element) {
      return;
    }
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  function loadMuted() {
    try {
      return window.localStorage.getItem('bubble-zen:muted') === '1';
    } catch (error) {
      return false;
    }
  }

  function saveMuted(value) {
    try {
      window.localStorage.setItem('bubble-zen:muted', value ? '1' : '0');
    } catch (error) {
      // 存不了就算了，不影响当前静音状态。
    }
  }

  /* ------------------------------------------------------------ 尺寸与布局 */

  function gridForSize() {
    var cols = clamp(Math.round(state.width / 92), 8, 24);
    // 让每格尽量接近正方形：竖屏手机上会增加行数，而不是留下大片竖向空隙。
    var cell = state.width / cols;
    var rows = clamp(Math.round(state.height / cell), 6, 18);
    return { cols: cols, rows: rows };
  }

  function resizeCanvas() {
    var rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return;
    }
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    initPetals();
    if (!state.session) {
      ensurePreview();
    }
  }

  function ensurePreview() {
    var grid = gridForSize();
    var current = state.previewSheet;
    if (current && current.cols === grid.cols && current.rows === grid.rows) {
      return;
    }
    state.previewSheet = Zen.createSheet(state.previewSeed, grid.cols, grid.rows, 0);
    state.previewEnteredAt = now();
  }

  function activeSheet() {
    if (state.session) {
      return state.session.sheet;
    }
    return state.previewSheet;
  }

  function activeEnteredAt() {
    if (state.session) {
      return state.session.sheetEnteredAt;
    }
    return state.previewEnteredAt;
  }

  function isPlaying() {
    return !!state.session && state.session.status === 'playing';
  }

  /** 泡泡在画布上的圆心与半径（CSS 像素）。 */
  function bubbleGeometry(bubble, sheet) {
    var cell = Math.min(state.width / sheet.cols, state.height / sheet.rows);
    return {
      x: bubble.x * state.width,
      y: bubble.y * state.height,
      r: cell * 0.38 * bubble.scale
    };
  }

  function hitTest(point) {
    var sheet = activeSheet();
    if (!sheet || !isPlaying()) {
      return -1;
    }
    var bestIndex = -1;
    var bestScore = 1;
    for (var i = 0; i < sheet.bubbles.length; i += 1) {
      var bubble = sheet.bubbles[i];
      if (bubble.popped) {
        continue;
      }
      var geo = bubbleGeometry(bubble, sheet);
      var dx = point.x - geo.x;
      var dy = point.y - geo.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var ratio = distance / geo.r;
      if (ratio <= 1 && ratio < bestScore) {
        bestScore = ratio;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  /* ---------------------------------------------------------------- 音效 */

  var audio = null;
  var master = null;

  function ensureAudio() {
    if (muted) {
      return;
    }
    if (!audio) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      try {
        audio = new AudioCtor();
        master = audio.createGain();
        master.gain.value = 0.55;
        master.connect(audio.destination);
      } catch (error) {
        audio = null;
      }
    }
    if (audio && audio.state === 'suspended') {
      audio.resume().catch(function () {});
    }
  }

  function tone(frequency, start, duration, volume, type) {
    if (!audio || muted) {
      return;
    }
    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playPop(special, chain) {
    if (muted) {
      return;
    }
    var startedAt = now();
    if (!special && startedAt - state.lastSoundAt < 24) {
      return;
    }
    state.lastSoundAt = startedAt;
    ensureAudio();
    if (!audio) {
      return;
    }
    var start = audio.currentTime;
    var base = special ? 660 : 380 + Math.random() * 220 + Math.min(chain, 16) * 7;
    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(base, start);
    oscillator.frequency.exponentialRampToValueAtTime(base * 0.52, start + 0.085);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(special ? 0.15 : 0.1, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + 0.13);

    if (special) {
      tone(base * 1.5, start + 0.03, 0.32, 0.06, 'triangle');
      tone(base * 2, start + 0.08, 0.36, 0.045, 'sine');
    } else if (chain >= 12 && chain % 12 === 0) {
      tone(880, start + 0.02, 0.26, 0.035, 'sine');
      tone(1320, start + 0.09, 0.32, 0.028, 'sine');
    }
  }

  function playChime() {
    ensureAudio();
    if (!audio || muted) {
      return;
    }
    var start = audio.currentTime + 0.02;
    tone(660, start, 0.5, 0.05, 'sine');
    tone(990, start + 0.1, 0.6, 0.04, 'sine');
  }

  /* ---------------------------------------------------------------- 主题 */

  function applyTheme(themeIndex) {
    var theme = Zen.THEMES[themeIndex] || Zen.THEMES[0];
    document.body.dataset.theme = theme.id;
  }

  /* ---------------------------------------------------------------- 绘制 */

  function hsla(hue, saturation, lightness, alpha) {
    return 'hsla(' + hue + ',' + saturation + '%,' + lightness + '%,' + alpha + ')';
  }

  function makeBubbleSprite(hue, special) {
    var size = 256;
    var sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    var c = sprite.getContext('2d');
    var center = size / 2;
    var radius = 102;

    c.save();
    c.shadowColor = hsla(hue, 62, 48, 0.2);
    c.shadowBlur = 22;
    c.shadowOffsetY = 9;

    var fill = c.createRadialGradient(
      center - radius * 0.34,
      center - radius * 0.4,
      radius * 0.08,
      center,
      center,
      radius
    );
    fill.addColorStop(0, 'rgba(255,255,255,0.98)');
    fill.addColorStop(0.34, hsla(hue, 72, 91, 0.92));
    fill.addColorStop(0.72, hsla(hue, 60, 82, 0.86));
    fill.addColorStop(0.94, hsla(hue, 58, 74, 0.92));
    fill.addColorStop(1, hsla(hue, 52, 68, 0.9));

    c.beginPath();
    c.arc(center, center, radius, 0, TAU);
    c.fillStyle = fill;
    c.fill();
    c.restore();

    // 顶部高光
    var highlight = c.createRadialGradient(
      center - radius * 0.36,
      center - radius * 0.4,
      0,
      center - radius * 0.36,
      center - radius * 0.4,
      radius * 0.42
    );
    highlight.addColorStop(0, 'rgba(255,255,255,0.95)');
    highlight.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath();
    c.arc(center - radius * 0.36, center - radius * 0.4, radius * 0.42, 0, TAU);
    c.fillStyle = highlight;
    c.fill();

    // 内圈反光
    c.beginPath();
    c.arc(center, center, radius - 3, Math.PI * 0.14, Math.PI * 0.86);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 4;
    c.stroke();

    // 外缘
    c.beginPath();
    c.arc(center, center, radius - 1.4, 0, TAU);
    c.strokeStyle = hsla(hue, 70, 96, 0.62);
    c.lineWidth = 2.6;
    c.stroke();

    if (special) {
      c.fillStyle = 'rgba(255,246,214,0.95)';
      drawSparkle(c, center + radius * 0.38, center - radius * 0.42, radius * 0.24);
      c.beginPath();
      c.arc(center, center, radius - 6, 0, TAU);
      c.strokeStyle = 'rgba(214,166,84,0.35)';
      c.lineWidth = 2;
      c.stroke();
    }

    return sprite;
  }

  function bubbleSprite(hue, special) {
    var bucket = Math.round(hue / 4) * 4;
    var key = bucket + (special ? 's' : '');
    var sprite = state.spriteCache.get(key);
    if (!sprite) {
      sprite = makeBubbleSprite(bucket, special);
      state.spriteCache.set(key, sprite);
    }
    return sprite;
  }

  function drawSparkle(c, x, y, size) {
    c.beginPath();
    c.moveTo(x, y - size);
    c.quadraticCurveTo(x + size * 0.12, y - size * 0.12, x + size, y);
    c.quadraticCurveTo(x + size * 0.12, y + size * 0.12, x, y + size);
    c.quadraticCurveTo(x - size * 0.12, y + size * 0.12, x - size, y);
    c.quadraticCurveTo(x - size * 0.12, y - size * 0.12, x, y - size);
    c.closePath();
    c.fill();
  }

  function drawPopped(bubble, geo, alpha) {
    var r = geo.r;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(geo.x, geo.y, r * 0.83, 0, TAU);
    ctx.fillStyle = hsla(bubble.hue, 42, 72, 0.05);
    ctx.fill();
    ctx.strokeStyle = hsla(bubble.hue, 44, 52, 0.1);
    ctx.lineWidth = Math.max(1, r * 0.032);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(geo.x + r * 0.04, geo.y + r * 0.05, r * 0.56, Math.PI * 0.18, Math.PI * 1.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.028);
    ctx.stroke();
    ctx.restore();
  }

  function drawBubble(bubble, sheet, timestamp) {
    var geo = bubbleGeometry(bubble, sheet);
    var enteredAt = activeEnteredAt();
    var delay = (bubble.col + bubble.row) * 16;
    var progress = state.reducedMotion
      ? 1
      : clamp((timestamp - enteredAt - delay) / 360, 0, 1);
    if (progress <= 0) {
      return;
    }
    var eased = 1 - Math.pow(1 - progress, 3);
    var alpha = Math.min(1, progress * 1.7);
    var breathing = state.reducedMotion ? 1 : 1 + Math.sin(timestamp / 1500 + bubble.phase) * 0.012;
    var baseScale = (0.58 + 0.42 * eased) * breathing;
    if (state.hovered === bubble.id && isPlaying() && !bubble.popped) {
      baseScale *= 1.06;
    }
    var radius = geo.r * baseScale;

    if (bubble.popped) {
      drawPopped(bubble, { x: geo.x, y: geo.y, r: geo.r }, alpha);
      return;
    }

    if (bubble.special) {
      var glow = ctx.createRadialGradient(geo.x, geo.y, 0, geo.x, geo.y, geo.r * 1.7);
      glow.addColorStop(0, 'rgba(241,199,113,0.26)');
      glow.addColorStop(0.55, 'rgba(241,199,113,0.08)');
      glow.addColorStop(1, 'rgba(241,199,113,0)');
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(geo.x, geo.y, geo.r * 1.7, 0, TAU);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var sprite = bubbleSprite(bubble.hue, bubble.special);
    var drawSize = radius * 2.46;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, geo.x - drawSize / 2, geo.y - drawSize / 2, drawSize, drawSize);
    ctx.globalAlpha = 1;

    if (bubble.special) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.translate(geo.x + radius * 0.4, geo.y - radius * 0.46);
      ctx.rotate(timestamp / 1800 + bubble.phase);
      ctx.fillStyle = 'rgba(255,250,230,0.95)';
      drawSparkle(ctx, 0, 0, radius * 0.3);
      ctx.restore();
    }
  }

  function drawSheet(timestamp) {
    var sheet = activeSheet();
    if (!sheet) {
      return;
    }
    for (var i = 0; i < sheet.bubbles.length; i += 1) {
      drawBubble(sheet.bubbles[i], sheet, timestamp);
    }
  }

  /* ---------------------------------------------------------------- 花瓣 */

  function initPetals() {
    state.petals = [];
    if (state.reducedMotion) {
      return;
    }
    var count = state.width < 640 ? 6 : 12;
    for (var i = 0; i < count; i += 1) {
      state.petals.push({
        x: Math.random() * state.width,
        y: Math.random() * state.height,
        size: 3.5 + Math.random() * 4.5,
        rotation: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 0.4,
        vx: -5 + Math.random() * 10,
        vy: 6 + Math.random() * 12,
        sway: Math.random() * TAU
      });
    }
  }

  function updatePetals(delta, timestamp) {
    if (!state.petals.length) {
      return;
    }
    for (var i = 0; i < state.petals.length; i += 1) {
      var petal = state.petals[i];
      petal.x += (petal.vx + Math.sin(timestamp / 2600 + petal.sway) * 7) * delta / 1000;
      petal.y += petal.vy * delta / 1000;
      petal.rotation += petal.spin * delta / 1000;
      if (petal.y > state.height + 20) {
        petal.y = -20;
        petal.x = Math.random() * state.width;
      }
      if (petal.x < -20) {
        petal.x = state.width + 20;
      }
      if (petal.x > state.width + 20) {
        petal.x = -20;
      }
    }
  }

  function drawPetals() {
    if (!state.petals.length) {
      return;
    }
    var sheet = activeSheet();
    var hue = sheet ? sheet.accentHue : 20;
    for (var i = 0; i < state.petals.length; i += 1) {
      var petal = state.petals[i];
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -petal.size);
      ctx.bezierCurveTo(
        petal.size * 0.9, -petal.size * 0.4,
        petal.size * 0.75, petal.size * 0.5,
        0, petal.size
      );
      ctx.bezierCurveTo(
        -petal.size * 0.75, petal.size * 0.5,
        -petal.size * 0.9, -petal.size * 0.4,
        0, -petal.size
      );
      ctx.fillStyle = hsla(hue, 52, 88, 0.35);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- 粒子 */

  function spawnPop(bubble, geo) {
    var hue = bubble.hue;
    state.particles.push({
      type: 'ring',
      x: geo.x,
      y: geo.y,
      startRadius: geo.r * 0.55,
      endRadius: geo.r * 1.75,
      life: 0,
      ttl: 430,
      hue: hue
    });

    var drops = bubble.special ? 10 : 7;
    for (var i = 0; i < drops; i += 1) {
      var angle = (TAU / drops) * i + Math.random() * 0.5;
      var speed = 36 + Math.random() * 110;
      state.particles.push({
        type: 'drop',
        x: geo.x,
        y: geo.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 26,
        gravity: 210,
        radius: 1.4 + Math.random() * 2.6,
        life: 0,
        ttl: 380 + Math.random() * 260,
        hue: hue
      });
    }

    if (bubble.special) {
      for (var s = 0; s < 8; s += 1) {
        var sparkAngle = Math.random() * TAU;
        var sparkSpeed = 20 + Math.random() * 70;
        state.particles.push({
          type: 'spark',
          x: geo.x,
          y: geo.y,
          vx: Math.cos(sparkAngle) * sparkSpeed,
          vy: Math.sin(sparkAngle) * sparkSpeed - 30,
          gravity: 40,
          radius: 2 + Math.random() * 3,
          rotation: Math.random() * TAU,
          life: 0,
          ttl: 520 + Math.random() * 300,
          hue: hue,
          gold: true
        });
      }
    }
  }

  function spawnFloater(x, y, text, special) {
    state.floaters.push({
      x: x,
      y: y,
      text: text,
      life: 0,
      ttl: 760,
      special: special
    });
  }

  function updateParticles(delta) {
    for (var i = state.particles.length - 1; i >= 0; i -= 1) {
      var particle = state.particles[i];
      particle.life += delta;
      if (particle.life >= particle.ttl) {
        state.particles.splice(i, 1);
        continue;
      }
      if (particle.type !== 'ring') {
        particle.x += particle.vx * delta / 1000;
        particle.y += particle.vy * delta / 1000;
        particle.vy += particle.gravity * delta / 1000;
        if (particle.rotation !== undefined) {
          particle.rotation += delta / 700;
        }
      }
    }
    for (var f = state.floaters.length - 1; f >= 0; f -= 1) {
      var floater = state.floaters[f];
      floater.life += delta;
      if (floater.life >= floater.ttl) {
        state.floaters.splice(f, 1);
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < state.particles.length; i += 1) {
      var particle = state.particles[i];
      var progress = particle.life / particle.ttl;
      var alpha = 1 - progress;
      ctx.save();
      if (particle.type === 'ring') {
        var radius = particle.startRadius + (particle.endRadius - particle.startRadius) * progress;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, TAU);
        ctx.strokeStyle = hsla(particle.hue, 76, 70, alpha * 0.6);
        ctx.lineWidth = (1 - progress) * 2.4 + 0.4;
        ctx.stroke();
      } else if (particle.type === 'drop') {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius * (1 - progress * 0.5), 0, TAU);
        ctx.fillStyle = hsla(particle.hue, 80, 76, alpha * 0.85);
        ctx.fill();
      } else {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.gold
          ? 'rgba(226,178,92,' + alpha * 0.95 + ')'
          : hsla(particle.hue, 80, 85, alpha * 0.9);
        drawSparkle(ctx, 0, 0, particle.radius * (1 - progress * 0.4));
      }
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (var i = 0; i < state.floaters.length; i += 1) {
      var floater = state.floaters[i];
      var progress = floater.life / floater.ttl;
      var alpha = progress < 0.15
        ? progress / 0.15
        : 1 - Math.max(0, (progress - 0.45) / 0.55);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = floater.special ? 'rgba(158,108,34,0.95)' : 'rgba(44,51,46,0.82)';
      ctx.fillText(floater.text, floater.x, floater.y - progress * 42);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- 主循环 */

  function frame(timestamp) {
    var delta = state.lastTimestamp ? clamp(timestamp - state.lastTimestamp, 0, 50) : 16;
    state.lastTimestamp = timestamp;

    if (isPlaying()) {
      var currentNow = now();
      var ticked = Zen.tick(state.session, currentNow);
      if (ticked.status === 'ended') {
        endGame(ticked);
      } else {
        state.session = ticked;
        if (state.pendingRefillAt !== null && currentNow >= state.pendingRefillAt) {
          if (Zen.needsRefill(state.session)) {
            doRefill();
          } else {
            state.pendingRefillAt = null;
          }
        }
      }
      if (isPlaying()) {
        updateHud(currentNow);
      }
    }

    updatePetals(delta, timestamp);
    updateParticles(delta);

    ctx.clearRect(0, 0, state.width, state.height);
    drawPetals();
    drawSheet(timestamp);
    drawParticles();
    drawFloaters();

    window.requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- 交互 */

  function localPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function popIndex(index) {
    if (!isPlaying()) {
      return;
    }
    var current = state.session;
    var result = Zen.pop(current, index, now());
    if (!result.event) {
      return;
    }
    state.session = result.session;
    var bubble = current.sheet.bubbles[index];
    var geo = bubbleGeometry(bubble, current.sheet);
    spawnPop(bubble, geo);
    spawnFloater(
      geo.x,
      geo.y - geo.r * 0.6,
      '+' + result.event.points,
      result.event.special
    );
    playPop(result.event.special, result.event.chain);
    if (result.session.popped === 1) {
      window.clearTimeout(state.hintTimer);
      hint.classList.add('is-faded');
    }
    updateHud(now());

    if (Zen.needsRefill(result.session) && state.pendingRefillAt === null) {
      state.pendingRefillAt = now() + (result.session.mode === 'zen' ? 480 : 320);
    }
  }

  function popAtPoint(point) {
    var index = hitTest(point);
    if (index >= 0) {
      popIndex(index);
    }
  }

  function popAlong(from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var step = Math.max(10, Math.min(state.width, state.height) / 42);
    var steps = clamp(Math.ceil(distance / step), 1, 40);
    for (var i = 1; i <= steps; i += 1) {
      var ratio = i / steps;
      popAtPoint({ x: from.x + dx * ratio, y: from.y + dy * ratio });
    }
  }

  function onPointerDown(event) {
    if (!isPlaying() || event.isPrimary === false) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    ensureAudio();
    event.preventDefault();
    state.pointerDown = true;
    state.activePointer = event.pointerId;
    state.lastPoint = localPoint(event);
    state.hovered = -1;
    canvas.style.cursor = 'default';
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // 忽略不支持捕获的浏览器。
    }
    popAtPoint(state.lastPoint);
  }

  function onPointerMove(event) {
    if (!isPlaying()) {
      return;
    }
    var point = localPoint(event);
    if (state.pointerDown && event.pointerId === state.activePointer) {
      if (state.lastPoint) {
        popAlong(state.lastPoint, point);
      }
      state.lastPoint = point;
      return;
    }
    state.hovered = hitTest(point);
    canvas.style.cursor = state.hovered >= 0 ? 'pointer' : 'default';
  }

  function endPointer(event) {
    if (state.activePointer !== null && event.pointerId !== state.activePointer) {
      return;
    }
    state.pointerDown = false;
    state.activePointer = null;
    state.lastPoint = null;
    if (isPlaying()) {
      state.hovered = hitTest(localPoint(event));
      canvas.style.cursor = state.hovered >= 0 ? 'pointer' : 'default';
    }
  }

  /* ---------------------------------------------------------------- 界面 */

  function updateHud(timestamp) {
    var session = state.session;
    if (!session) {
      return;
    }
    var timed = session.mode === 'timed';
    setText(primaryLabel, timed ? '得分' : '已按破');
    setText(primaryValue, formatNumber(timed ? session.score : session.popped));
    setText(sheetValue, '第 ' + session.sheetIndex + ' 张');
    setText(bestValue, formatNumber(session.best));

    var remaining = Zen.remainingMs(session, timestamp);
    if (remaining !== null) {
      setText(timeValue, formatTime(remaining));
      var percent = clamp(remaining / Zen.TIMED_DURATION_MS, 0, 1) * 100;
      timerFill.style.width = percent.toFixed(2) + '%';
      timeStat.classList.toggle('is-urgent', remaining <= 10000);
    }

    var comboVisible = session.combo >= 2
      && session.lastPopAt !== null
      && timestamp - session.lastPopAt < 1200;
    combo.classList.toggle('is-visible', comboVisible);
    if (comboVisible) {
      setText(comboChain, String(session.combo));
      setText(comboMult, '×' + Zen.comboMultiplier(session.combo));
      if (state.lastComboChain !== session.combo) {
        state.lastComboChain = session.combo;
        if (combo.animate) {
          combo.animate(
            [
              { transform: 'translateX(-50%) translateY(0) scale(0.92)' },
              { transform: 'translateX(-50%) translateY(0) scale(1)' }
            ],
            { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' }
          );
        }
      }
    } else {
      state.lastComboChain = 0;
    }
  }

  function showStart() {
    state.session = null;
    state.pendingRefillAt = null;
    state.hovered = -1;
    state.pointerDown = false;
    state.activePointer = null;
    state.lastPoint = null;
    state.particles = [];
    state.floaters = [];
    document.body.dataset.view = 'start';
    applyTheme(0);
    startScreen.hidden = false;
    endScreen.hidden = true;
    newSheetBtn.hidden = true;
    exitBtn.hidden = true;
    updateStartBest();
    ensurePreview();
    window.setTimeout(function () {
      var firstCard = startScreen.querySelector('.mode-card');
      if (firstCard) {
        firstCard.focus({ preventScroll: true });
      }
    }, 40);
  }

  function startGame(mode) {
    ensureAudio();
    var grid = gridForSize();
    var session = Zen.createSession({
      mode: mode,
      now: now(),
      seed: randomSeed(),
      cols: grid.cols,
      rows: grid.rows,
      themeIndex: 0,
      best: Zen.loadBest(storage)
    });
    state.session = session;
    state.hovered = -1;
    state.pendingRefillAt = null;
    state.particles = [];
    state.floaters = [];
    state.lastComboChain = 0;
    hint.classList.remove('is-faded');
    window.clearTimeout(state.hintTimer);
    state.hintTimer = window.setTimeout(function () {
      hint.classList.add('is-faded');
    }, 9000);
    document.body.dataset.view = 'game';
    document.body.dataset.mode = mode;
    startScreen.hidden = true;
    endScreen.hidden = true;
    bestStat.hidden = mode !== 'timed';
    sheetStat.hidden = mode === 'timed';
    timeStat.hidden = mode !== 'timed';
    newSheetBtn.hidden = mode !== 'zen';
    exitBtn.hidden = false;
    setText(modeChip, mode === 'timed' ? '计时模式' : '禅模式');
    setText(hint, mode === 'timed'
      ? '按住并拖动 · 连击越高，分数越高'
      : '按住并拖动，一路按破 · 按完自动换纸');
    applyTheme(0);
    updateHud(now());
    canvas.focus({ preventScroll: true });
  }

  function doRefill() {
    if (!isPlaying()) {
      return;
    }
    state.session = Zen.refill(state.session, now());
    state.pendingRefillAt = null;
    state.hovered = -1;
    applyTheme(state.session.sheet.themeIndex);
    updateHud(now());
  }

  function endCopyFor(score) {
    if (score >= 8000) {
      return '今天的手感，很温柔。';
    }
    if (score >= 3000) {
      return '手指轻快，心情也轻了。';
    }
    if (score > 0) {
      return '慢一点，也很好。';
    }
    return '一颗也没按破，也没关系。';
  }

  function endGame(session) {
    state.session = session;
    state.pendingRefillAt = null;
    state.pointerDown = false;
    state.hovered = -1;
    var best = Zen.saveBest(storage, session.score);
    document.body.dataset.view = 'end';
    endScore.textContent = formatNumber(session.score);
    endPopped.textContent = formatNumber(session.popped) + ' 颗';
    endCombo.textContent = formatNumber(session.bestCombo);
    endBest.textContent = formatNumber(Math.max(best, session.best));
    endCopy.textContent = endCopyFor(session.score);
    recordBadge.hidden = !session.newRecord;
    endScreen.hidden = false;
    updateStartBest();
    combo.classList.remove('is-visible');
    playChime();
    window.setTimeout(function () {
      replayBtn.focus({ preventScroll: true });
    }, 40);
    setText(liveRegion, '时间到，本局得分 ' + formatNumber(session.score) + ' 分');
  }

  function updateStartBest() {
    setText(startBest, formatNumber(Zen.loadBest(storage)));
  }

  function updateSoundButton() {
    soundBtn.classList.toggle('is-muted', muted);
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.setAttribute('aria-label', muted ? '打开声音' : '关闭声音');
    soundBtn.title = muted ? '打开声音' : '关闭声音';
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', function () {
      if (!state.pointerDown) {
        state.hovered = -1;
        canvas.style.cursor = 'default';
      }
    });

    startScreen.querySelectorAll('.mode-card').forEach(function (card) {
      card.addEventListener('click', function () {
        startGame(card.getAttribute('data-mode'));
      });
    });

    soundBtn.addEventListener('click', function () {
      muted = !muted;
      saveMuted(muted);
      updateSoundButton();
      if (!muted) {
        ensureAudio();
        playChime();
      }
    });

    newSheetBtn.addEventListener('click', doRefill);
    exitBtn.addEventListener('click', showStart);
    replayBtn.addEventListener('click', function () {
      startGame('timed');
    });
    homeBtn.addEventListener('click', showStart);

    canvas.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        showStart();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.dataset.view === 'end') {
        showStart();
      }
    });

    var resizeObserver = window.ResizeObserver
      ? new ResizeObserver(function () {
        resizeCanvas();
      })
      : null;
    if (resizeObserver) {
      resizeObserver.observe(stage);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = motionQuery.matches;
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', function (event) {
        state.reducedMotion = event.matches;
        initPetals();
      });
    }
  }

  /* ---------------------------------------------------------------- 启动 */

  updateSoundButton();
  bindEvents();
  resizeCanvas();
  updateStartBest();
  ensurePreview();
  applyTheme(0);
  document.body.dataset.view = 'start';
  document.body.dataset.mode = 'zen';
  window.requestAnimationFrame(frame);
})();
