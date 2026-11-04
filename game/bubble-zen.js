/**
 * 「泡泡禅」的核心状态与计分逻辑。
 *
 * 和 demo 一样刻意保持零依赖：浏览器里通过 <script> 暴露 window.BubbleZen，
 * Node.js 里 require 后用 node:test 验证。所有状态都是不可变对象，
 * 视图层只需要保存最近一次返回的 session。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BubbleZen = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 计时模式的时长：60 秒。 */
  var TIMED_DURATION_MS = 60000;
  /** 两次按破间隔不超过该值时，连击继续累积。 */
  var COMBO_WINDOW_MS = 700;
  /** 一颗普通泡泡的基础分。 */
  var BASE_SCORE = 10;
  /** 星光泡的分值倍数。 */
  var SPECIAL_SCORE_FACTOR = 3;
  /** 每颗泡泡成为星光泡的概率。 */
  var SPECIAL_CHANCE = 0.05;
  /** 连击倍率上限。 */
  var MAX_MULTIPLIER = 5;
  /** 本地存储里计时模式最佳成绩的键名。 */
  var BEST_KEY = 'bubble-zen:best:timed';

  var MODES = Object.freeze({
    zen: Object.freeze({ id: 'zen', label: '禅模式', durationMs: null }),
    timed: Object.freeze({ id: 'timed', label: '计时模式', durationMs: TIMED_DURATION_MS })
  });

  /**
   * 每张泡泡纸随机挑一个主色，页面配色也跟着换一种「天色」。
   * hues 是可抽取的主色相，渲染层会在此基础上做轻微偏移。
   */
  var THEMES = Object.freeze([
    Object.freeze({ id: 'dawn', label: '晨雾', hues: Object.freeze([22, 346, 8, 38]) }),
    Object.freeze({ id: 'tide', label: '海盐', hues: Object.freeze([192, 208, 166, 250]) }),
    Object.freeze({ id: 'sakura', label: '樱雨', hues: Object.freeze([342, 356, 12, 300]) })
  ]);

  /** 可复现的伪随机数生成器（mulberry32）。 */
  function mulberry32(seed) {
    var state = seed >>> 0;
    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toSeed(seed) {
    var value = Number(seed);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return value >>> 0;
  }

  /** 由当前种子得到下一张纸的种子。 */
  function nextSeed(seed) {
    return (Math.imul(toSeed(seed), 1664525) + 1013904223) >>> 0;
  }

  function toPositiveInt(value, name) {
    var number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(name + ' 必须是正整数');
    }
    return number;
  }

  function normalizeThemeIndex(index) {
    var number = Number(index);
    if (!Number.isFinite(number)) {
      return 0;
    }
    var integer = Math.floor(number) % THEMES.length;
    return integer < 0 ? integer + THEMES.length : integer;
  }

  function normalizeHue(hue) {
    var value = Number(hue) || 0;
    var wrapped = value % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
  }

  /**
   * 生成一张泡泡纸。每颗泡泡的位置是归一化坐标（0..1），
   * 视图按画布尺寸放大，因此窗口缩放不会打乱布局。
   */
  function createSheet(seed, cols, rows, themeIndex) {
    var safeSeed = toSeed(seed);
    var safeCols = toPositiveInt(cols, 'cols');
    var safeRows = toPositiveInt(rows, 'rows');
    var safeTheme = normalizeThemeIndex(themeIndex);
    var theme = THEMES[safeTheme];
    var random = mulberry32(safeSeed);
    var primaryHue = theme.hues[Math.floor(random() * theme.hues.length)];
    var secondaryHue = theme.hues[Math.floor(random() * theme.hues.length)];
    if (secondaryHue === primaryHue && theme.hues.length > 1) {
      secondaryHue = theme.hues[(theme.hues.indexOf(primaryHue) + 1) % theme.hues.length];
    }
    var bubbles = [];

    for (var row = 0; row < safeRows; row += 1) {
      for (var col = 0; col < safeCols; col += 1) {
        // 每个格子内做一点随机偏移，让泡泡看起来是手贴上去的。
        var jitterX = (random() - 0.5) * 0.16;
        var jitterY = (random() - 0.5) * 0.16;
        // 大部分泡泡用主色，少量换成同主题的第二种颜色，避免整张纸太单调。
        var bubbleHue = random() < 0.24 ? secondaryHue : primaryHue;
        bubbles.push(Object.freeze({
          id: row * safeCols + col,
          col: col,
          row: row,
          x: (col + 0.5 + jitterX) / safeCols,
          y: (row + 0.5 + jitterY) / safeRows,
          hue: normalizeHue(bubbleHue + (random() - 0.5) * 24),
          scale: 0.88 + random() * 0.16,
          phase: random() * Math.PI * 2,
          special: random() < SPECIAL_CHANCE,
          popped: false
        }));
      }
    }

    return Object.freeze({
      seed: safeSeed,
      cols: safeCols,
      rows: safeRows,
      themeIndex: safeTheme,
      accentHue: normalizeHue(primaryHue),
      bubbles: Object.freeze(bubbles)
    });
  }

  function normalizeBest(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }
    return Math.floor(number);
  }

  /**
   * 创建一局游戏。
   * options: { mode, now, seed?, cols?, rows?, themeIndex?, best? }
   */
  function createSession(options) {
    var config = options || {};
    var mode = config.mode || 'zen';
    if (!MODES[mode]) {
      throw new Error('未知模式: ' + mode);
    }
    var now = Number(config.now);
    if (!Number.isFinite(now)) {
      throw new Error('createSession 需要 now');
    }
    var cols = config.cols === undefined ? 12 : config.cols;
    var rows = config.rows === undefined ? 8 : config.rows;
    var themeIndex = normalizeThemeIndex(config.themeIndex || 0);
    var seed = config.seed === undefined ? 1 : config.seed;
    var best = normalizeBest(config.best);
    var duration = MODES[mode].durationMs;

    return Object.freeze({
      mode: mode,
      status: 'playing',
      startedAt: now,
      endsAt: duration === null ? null : now + duration,
      score: 0,
      popped: 0,
      combo: 0,
      bestCombo: 0,
      lastPopAt: null,
      sheetIndex: 1,
      sheet: createSheet(seed, cols, rows, themeIndex),
      sheetEnteredAt: now,
      best: best,
      bestAtStart: best,
      newRecord: false
    });
  }

  /** 连击链长对应的分数倍率：每 3 连升一级，最高 x5。 */
  function comboMultiplier(chain) {
    var length = Math.floor(Number(chain) || 0);
    if (length <= 0) {
      return 1;
    }
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(length / 3));
  }

  /**
   * 按破第 index 颗泡泡，返回新的 session 和事件信息。
   * 无效序号、已按破的泡泡、已结束的局都会原样返回。
   */
  function pop(session, index, now) {
    if (!session || session.status !== 'playing') {
      return { session: session, event: null };
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.sheet.bubbles.length) {
      return { session: session, event: null };
    }
    var timestamp = Number(now);
    if (!Number.isFinite(timestamp)) {
      return { session: session, event: null };
    }
    if (session.mode === 'timed' && timestamp >= session.endsAt) {
      return { session: finalize(session), event: null };
    }

    var bubble = session.sheet.bubbles[index];
    if (bubble.popped) {
      return { session: session, event: null };
    }

    var inWindow = session.lastPopAt !== null
      && timestamp - session.lastPopAt <= COMBO_WINDOW_MS;
    var chain = inWindow ? session.combo + 1 : 1;
    var multiplier = comboMultiplier(chain);
    var points = BASE_SCORE * multiplier * (bubble.special ? SPECIAL_SCORE_FACTOR : 1);

    var bubbles = session.sheet.bubbles.slice();
    bubbles[index] = Object.freeze(Object.assign({}, bubble, { popped: true }));
    var sheet = Object.freeze(Object.assign({}, session.sheet, {
      bubbles: Object.freeze(bubbles)
    }));

    var next = Object.freeze(Object.assign({}, session, {
      score: session.score + points,
      popped: session.popped + 1,
      combo: chain,
      bestCombo: Math.max(session.bestCombo, chain),
      lastPopAt: timestamp,
      sheet: sheet
    }));

    return {
      session: next,
      event: Object.freeze({
        index: index,
        points: points,
        chain: chain,
        multiplier: multiplier,
        special: bubble.special
      })
    };
  }

  /** 结束一局并结算最佳成绩。 */
  function finalize(session) {
    if (!session || session.status !== 'playing') {
      return session;
    }
    var best = Math.max(session.best, session.score);
    return Object.freeze(Object.assign({}, session, {
      status: 'ended',
      endedAt: session.endsAt,
      best: best,
      newRecord: session.score > 0 && session.score > session.bestAtStart
    }));
  }

  /** 推进时间：计时模式到点自动结束。 */
  function tick(session, now) {
    if (!session || session.status !== 'playing' || session.mode !== 'timed') {
      return session;
    }
    var timestamp = Number(now);
    if (!Number.isFinite(timestamp)) {
      return session;
    }
    return timestamp >= session.endsAt ? finalize(session) : session;
  }

  function remainingBubbles(session) {
    var bubbles = session.sheet.bubbles;
    var count = 0;
    for (var i = 0; i < bubbles.length; i += 1) {
      if (!bubbles[i].popped) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * 是否该换一张泡泡纸。
   * 禅模式按到一颗不剩才换；计时模式剩两成时提前补纸，保持节奏。
   */
  function needsRefill(session) {
    if (!session || session.status !== 'playing') {
      return false;
    }
    var ratio = session.mode === 'timed' ? 0.2 : 0;
    var threshold = Math.floor(session.sheet.bubbles.length * ratio);
    return remainingBubbles(session) <= threshold;
  }

  /** 换一张新泡泡纸，桌面主题顺延到下一种。 */
  function refill(session, now) {
    if (!session || session.status !== 'playing') {
      return session;
    }
    var timestamp = Number(now);
    if (!Number.isFinite(timestamp)) {
      return session;
    }
    var themeIndex = normalizeThemeIndex(session.sheet.themeIndex + 1);
    return Object.freeze(Object.assign({}, session, {
      sheetIndex: session.sheetIndex + 1,
      sheet: createSheet(
        nextSeed(session.sheet.seed),
        session.sheet.cols,
        session.sheet.rows,
        themeIndex
      ),
      sheetEnteredAt: timestamp
    }));
  }

  /** 距离结束还剩多少毫秒；禅模式返回 null。 */
  function remainingMs(session, now) {
    if (!session || session.endsAt === null) {
      return null;
    }
    var timestamp = Number(now);
    if (!Number.isFinite(timestamp)) {
      return 0;
    }
    return Math.max(0, session.endsAt - timestamp);
  }

  /** 读取计时模式的历史最佳成绩。 */
  function loadBest(storage) {
    try {
      var raw = storage && storage.getItem(BEST_KEY);
      var value = parseInt(raw, 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  /** 仅在刷新纪录时写入；返回当前最佳成绩。存储不可用时静默降级。 */
  function saveBest(storage, score) {
    var previous = loadBest(storage);
    var best = Math.max(previous, normalizeBest(score));
    if (best > previous) {
      try {
        if (storage) {
          storage.setItem(BEST_KEY, String(best));
        }
      } catch (error) {
        // 隐私模式或存储已满：不影响游戏本身。
      }
    }
    return best;
  }

  return Object.freeze({
    TIMED_DURATION_MS: TIMED_DURATION_MS,
    COMBO_WINDOW_MS: COMBO_WINDOW_MS,
    BASE_SCORE: BASE_SCORE,
    SPECIAL_SCORE_FACTOR: SPECIAL_SCORE_FACTOR,
    SPECIAL_CHANCE: SPECIAL_CHANCE,
    MAX_MULTIPLIER: MAX_MULTIPLIER,
    BEST_KEY: BEST_KEY,
    MODES: MODES,
    THEMES: THEMES,
    createSheet: createSheet,
    createSession: createSession,
    pop: pop,
    finalize: finalize,
    tick: tick,
    refill: refill,
    needsRefill: needsRefill,
    remainingBubbles: remainingBubbles,
    remainingMs: remainingMs,
    comboMultiplier: comboMultiplier,
    loadBest: loadBest,
    saveBest: saveBest,
    nextSeed: nextSeed
  });
});
