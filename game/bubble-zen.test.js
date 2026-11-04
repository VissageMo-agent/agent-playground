'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const zen = require('./bubble-zen.js');

/** 验证用的小号泡泡纸。 */
function sheet(seed) {
  return zen.createSheet(seed, 6, 4, 0);
}

function session(overrides) {
  return zen.createSession(Object.assign({
    mode: 'timed',
    now: 1000,
    seed: 7,
    cols: 6,
    rows: 4
  }, overrides));
}

test('泡泡纸尺寸与泡泡数量匹配，坐标都落在纸内', () => {
  const board = sheet(1);
  assert.equal(board.cols, 6);
  assert.equal(board.rows, 4);
  assert.equal(board.bubbles.length, 24);
  assert.equal(board.bubbles[0].id, 0);
  assert.equal(board.bubbles[23].id, 23);
  assert.equal(new Set(board.bubbles.map((bubble) => bubble.id)).size, 24);
  board.bubbles.forEach((bubble) => {
    assert.ok(bubble.x > 0 && bubble.x < 1, 'x 应在 0..1 之间');
    assert.ok(bubble.y > 0 && bubble.y < 1, 'y 应在 0..1 之间');
    assert.ok(bubble.scale >= 0.88 && bubble.scale <= 1.04);
    assert.ok(bubble.hue >= 0 && bubble.hue < 360);
  });
});

test('相同种子生成完全相同的泡泡纸', () => {
  assert.deepEqual(sheet(42), sheet(42));
  assert.notDeepEqual(sheet(42), sheet(43));
});

test('主题按序号循环，并带有自己的主色', () => {
  const dawn = zen.createSheet(3, 6, 4, 0);
  const tide = zen.createSheet(3, 6, 4, 1);
  const sakura = zen.createSheet(3, 6, 4, 2);
  assert.equal(dawn.themeIndex, 0);
  assert.equal(tide.themeIndex, 1);
  assert.equal(sakura.themeIndex, 2);
  assert.equal(zen.createSheet(3, 6, 4, 3).themeIndex, 0);
  assert.equal(zen.THEMES[1].id, 'tide');
});

test('非法尺寸与未知模式会被拒绝', () => {
  assert.throws(() => zen.createSheet(1, 0, 4, 0), /cols/);
  assert.throws(() => zen.createSheet(1, 6, -1, 0), /rows/);
  assert.throws(() => zen.createSession({ mode: 'nope', now: 0 }), /未知模式/);
  assert.throws(() => zen.createSession({ mode: 'zen' }), /now/);
});

test('计时模式在 60 秒后结束，禅模式没有终局时间', () => {
  assert.equal(session().endsAt, 61000);
  assert.equal(zen.createSession({ mode: 'zen', now: 500 }).endsAt, null);
});

test('按破普通泡泡得 10 分，连击从 1 开始', () => {
  const first = session();
  const result = zen.pop(first, 0, 1000);
  assert.equal(result.event.points, 10);
  assert.equal(result.event.chain, 1);
  assert.equal(result.event.multiplier, 1);
  assert.equal(result.session.score, 10);
  assert.equal(result.session.popped, 1);
  assert.equal(result.session.bestCombo, 1);
  assert.equal(result.session.combo, 1);
  assert.equal(result.session.sheet.bubbles[0].popped, true);
  assert.equal(zen.remainingBubbles(result.session), 23);
  // 原对象保持不可变
  assert.equal(first.sheet.bubbles[0].popped, false);
  assert.equal(first.score, 0);
});

test('重复按破同一颗泡泡不会重复得分', () => {
  const once = zen.pop(session(), 0, 1000).session;
  const twice = zen.pop(once, 0, 1100);
  assert.equal(twice.event, null);
  assert.equal(twice.session, once);
});

test('越界或非整数序号被忽略', () => {
  const current = session();
  [-1, 24, 1.5, '0', null].forEach((index) => {
    assert.equal(zen.pop(current, index, 1000).event, null);
  });
});

test('700ms 内连续按破累积连击，按三颗升一级倍率', () => {
  let current = session();
  const chains = [];
  for (let i = 0; i < 6; i += 1) {
    const result = zen.pop(current, i, 1000 + i * 500);
    current = result.session;
    chains.push(result.event.chain);
  }
  assert.deepEqual(chains, [1, 2, 3, 4, 5, 6]);
  assert.equal(zen.comboMultiplier(1), 1);
  assert.equal(zen.comboMultiplier(3), 2);
  assert.equal(zen.comboMultiplier(6), 3);
  assert.equal(zen.comboMultiplier(9), 4);
  assert.equal(zen.comboMultiplier(12), 5);
  assert.equal(zen.comboMultiplier(99), 5);
});

test('间隔超过连击窗口后重新从 1 开始', () => {
  let current = zen.pop(session(), 0, 1000).session;
  current = zen.pop(current, 1, 1700).session;
  assert.equal(current.combo, 2);
  const third = zen.pop(current, 2, 2500);
  assert.equal(third.event.chain, 1);
  assert.equal(third.session.bestCombo, 2);
});

test('连击有分数加成', () => {
  let current = session();
  current = zen.pop(current, 0, 1000).session;
  current = zen.pop(current, 1, 1200).session;
  const third = zen.pop(current, 2, 1400);
  assert.equal(third.event.multiplier, 2);
  assert.equal(third.event.points, 20);
  assert.equal(third.session.score, 40);
});

test('星光泡得三倍分', () => {
  const current = session({ seed: 1 });
  const special = current.sheet.bubbles.find((bubble) => bubble.special);
  assert.ok(special, '测试种子应至少有一颗星光泡');
  const result = zen.pop(current, special.id, 1000);
  assert.equal(result.event.special, true);
  assert.equal(result.event.points, 30);
});

test('倒计时结束后不能再按', () => {
  const current = session();
  const late = zen.pop(current, 0, 61000);
  assert.equal(late.event, null);
  assert.equal(late.session.status, 'ended');
  assert.equal(zen.tick(current, 60999).status, 'playing');
  assert.equal(zen.tick(current, 61000).status, 'ended');
});

test('结算更新最佳成绩并标记新纪录', () => {
  let current = session({ best: 100 });
  current = zen.pop(current, 0, 1000).session;
  const ended = zen.tick(current, 61000);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.best, 100);
  assert.equal(ended.newRecord, false);

  let better = session({ best: 0 });
  better = zen.pop(better, 0, 1000).session;
  const record = zen.tick(better, 61000);
  assert.equal(record.best, 10);
  assert.equal(record.newRecord, true);
});

test('禅模式不会自己结束', () => {
  const current = zen.createSession({ mode: 'zen', now: 0, cols: 6, rows: 4 });
  assert.equal(zen.tick(current, 9999999).status, 'playing');
  assert.equal(zen.remainingMs(current, 9999999), null);
});

test('换纸后分数与连击保留，张数加一，主题顺延', () => {
  let current = session();
  current = zen.pop(current, 0, 1000).session;
  const previousSeed = current.sheet.seed;
  current = zen.refill(current, 2000);
  assert.equal(current.sheetIndex, 2);
  assert.equal(current.score, 10);
  assert.equal(current.popped, 1);
  assert.equal(current.sheet.themeIndex, 1);
  assert.equal(current.sheetEnteredAt, 2000);
  assert.equal(zen.remainingBubbles(current), 24);
  // 新纸的种子是确定的下一张
  assert.equal(current.sheet.seed, zen.nextSeed(previousSeed));
});

test('换纸阈值：禅模式按完才换，计时模式剩两成提前换', () => {
  let zenSession = zen.createSession({ mode: 'zen', now: 0, cols: 6, rows: 4 });
  for (let i = 0; i < 23; i += 1) {
    zenSession = zen.pop(zenSession, i, 1000 + i).session;
  }
  assert.equal(zen.needsRefill(zenSession), false);
  zenSession = zen.pop(zenSession, 23, 2000).session;
  assert.equal(zen.needsRefill(zenSession), true);

  let timed = session();
  for (let i = 0; i < 19; i += 1) {
    timed = zen.pop(timed, i, 1000 + i).session;
    assert.equal(zen.needsRefill(timed), false);
  }
  timed = zen.pop(timed, 19, 3000).session;
  assert.equal(zen.needsRefill(timed), true);
});

test('剩余时间不会小于零', () => {
  const current = session();
  assert.equal(zen.remainingMs(current, 1000), 60000);
  assert.equal(zen.remainingMs(current, 31000), 30000);
  assert.equal(zen.remainingMs(current, 99999), 0);
});

test('最佳成绩写入与读取会处理空值、损坏值和异常存储', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value)
  };
  assert.equal(zen.loadBest(storage), 0);
  assert.equal(zen.saveBest(storage, 320), 320);
  assert.equal(store.get(zen.BEST_KEY), '320');
  assert.equal(zen.saveBest(storage, 120), 320);
  assert.equal(store.get(zen.BEST_KEY), '320');

  store.set(zen.BEST_KEY, 'not-a-number');
  assert.equal(zen.loadBest(storage), 0);

  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); }
  };
  assert.equal(zen.loadBest(broken), 0);
  assert.equal(zen.saveBest(broken, 50), 50);
  assert.equal(zen.loadBest(null), 0);
  assert.equal(zen.saveBest(null, 50), 50);
});

test('每次换纸的种子序列可复现且不重复', () => {
  const seen = new Set();
  let seed = 1;
  for (let i = 0; i < 50; i += 1) {
    assert.ok(!seen.has(seed));
    seen.add(seed);
    seed = zen.nextSeed(seed);
  }
});
