'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('./agent-flow.js');

test('阶段定义包含 7 个唯一阶段', () => {
  assert.equal(flow.STAGE_COUNT, 7);
  assert.equal(flow.STAGES.length, flow.STAGE_COUNT);
  assert.equal(new Set(flow.STAGES.map((stage) => stage.id)).size, flow.STAGE_COUNT);
  flow.STAGES.forEach((stage) => {
    assert.ok(stage.label.length > 0);
    assert.ok(stage.detail.length > 0);
  });
});

test('初始状态为空闲，进度为 0', () => {
  const state = flow.createDemoState();
  assert.equal(state.status, 'idle');
  assert.equal(state.current, -1);
  assert.deepEqual(state.entries, []);
  assert.equal(flow.progress(state), 0);
  assert.equal(flow.summary(state).title, '准备就绪');
});

test('开始演示后进入第一个阶段', () => {
  const state = flow.start(flow.createDemoState());
  assert.equal(state.status, 'running');
  assert.equal(state.current, 0);
  assert.equal(state.entries.length, 1);
  assert.match(state.entries[0].message, /读取 Issue/);
  assert.equal(flow.progress(state), 0);
  assert.equal(flow.stageState(state, 0), 'active');
  assert.equal(flow.stageState(state, 1), 'pending');
  assert.equal(flow.summary(state).title, '读取 Issue');
});

test('重复开始是幂等的', () => {
  const running = flow.start(flow.createDemoState());
  assert.equal(flow.start(running), running);
});

test('逐阶段推进直到完成', () => {
  let state = flow.start(flow.createDemoState());

  for (let index = 1; index < flow.STAGE_COUNT; index += 1) {
    state = flow.advance(state);
    assert.equal(state.status, 'running');
    assert.equal(state.current, index);
  }

  assert.equal(flow.progress(state), 86);
  for (let index = 0; index < flow.STAGE_COUNT; index += 1) {
    assert.equal(
      flow.stageState(state, index),
      index === flow.STAGE_COUNT - 1 ? 'active' : 'done'
    );
  }

  state = flow.advance(state);
  assert.equal(state.status, 'done');
  assert.equal(state.current, flow.STAGE_COUNT - 1);
  assert.equal(flow.progress(state), 100);
  assert.equal(flow.summary(state).title, '演示完成');
  for (let index = 0; index < flow.STAGE_COUNT; index += 1) {
    assert.equal(flow.stageState(state, index), 'done');
  }
});

test('空闲状态下推进不改变状态', () => {
  const idle = flow.createDemoState();
  assert.equal(flow.advance(idle), idle);
});

test('完成后继续推进不改变状态', () => {
  let state = flow.start(flow.createDemoState());
  while (state.status === 'running') {
    state = flow.advance(state);
  }
  assert.equal(flow.advance(state), state);
});

test('重置回到初始状态', () => {
  let state = flow.start(flow.createDemoState());
  state = flow.advance(state);
  assert.equal(state.status, 'running');

  const reset = flow.reset();
  assert.equal(reset.status, 'idle');
  assert.equal(reset.current, -1);
  assert.deepEqual(reset.entries, []);
  assert.equal(flow.progress(reset), 0);
});

test('进度单调递增，完成后为 100', () => {
  let state = flow.start(flow.createDemoState());
  let last = flow.progress(state);

  while (state.status === 'running') {
    state = flow.advance(state);
    const current = flow.progress(state);
    assert.ok(current >= last, `进度不应回退：${last} -> ${current}`);
    last = current;
  }

  assert.equal(last, 100);
});

test('日志记录开始、每个阶段和完成动作', () => {
  let state = flow.start(flow.createDemoState());
  while (state.status === 'running') {
    state = flow.advance(state);
  }

  assert.equal(state.entries.length, flow.STAGE_COUNT + 1);
  assert.match(state.entries[0].message, /读取 Issue/);
  assert.match(state.entries.at(-1).message, /完成/);
  state.entries.forEach((entry, index) => {
    assert.equal(entry.step, index + 1);
  });
});

test('状态转换不修改旧状态', () => {
  const idle = flow.createDemoState();
  const running = flow.start(idle);
  assert.equal(idle.status, 'idle');
  assert.equal(idle.current, -1);
  assert.equal(running.status, 'running');
  assert.equal(running.current, 0);
  assert.notEqual(running, idle);
});

test('非法阶段下标会抛出 RangeError', () => {
  const state = flow.createDemoState();
  assert.throws(() => flow.stageState(state, -1), RangeError);
  assert.throws(() => flow.stageState(state, flow.STAGE_COUNT), RangeError);
  assert.throws(() => flow.stageState(state, 1.5), RangeError);
});
