/**
 * Agent 工作流演示用的状态机。
 *
 * 这个示例刻意保持零依赖：既可以在浏览器里通过 <script> 直接加载，
 * 也可以在 Node.js 里 require 后用 node:test 验证。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgentFlow = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Agent 处理一个 Issue 的完整流水线。 */
  var STAGES = Object.freeze([
    Object.freeze({ id: 'issue', label: '读取 Issue', detail: '解析需求与约束条件' }),
    Object.freeze({ id: 'plan', label: '设计方案', detail: '确认改动范围与验证方式' }),
    Object.freeze({ id: 'code', label: '实现代码', detail: '在独立分支上完成示例' }),
    Object.freeze({ id: 'test', label: '自动验证', detail: '运行单元测试并检查页面' }),
    Object.freeze({ id: 'pr', label: '提交 PR', detail: '附上改动说明与视觉证据' }),
    Object.freeze({ id: 'review', label: '响应评审', detail: '处理反馈并保持检查通过' }),
    Object.freeze({ id: 'merge', label: '交付合并', detail: '由人确认后合并 PR' })
  ]);

  var STAGE_COUNT = STAGES.length;

  function createDemoState() {
    return Object.freeze({
      status: 'idle',
      current: -1,
      entries: Object.freeze([])
    });
  }

  function appendEntry(state, message) {
    return Object.freeze(state.entries.concat([
      Object.freeze({ step: state.entries.length + 1, message: message })
    ]));
  }

  /** 开始演示，进入第一个阶段；只有空闲状态可以开始。 */
  function start(state) {
    if (state.status !== 'idle') {
      return state;
    }
    var stage = STAGES[0];
    return Object.freeze({
      status: 'running',
      current: 0,
      entries: appendEntry(state, stage.label + ' — ' + stage.detail)
    });
  }

  /** 推进一步：推进到下一阶段，或在最后一个阶段结束后标记完成。 */
  function advance(state) {
    if (state.status !== 'running') {
      return state;
    }

    if (state.current >= STAGE_COUNT - 1) {
      return Object.freeze({
        status: 'done',
        current: state.current,
        entries: appendEntry(state, '完成：' + STAGE_COUNT + ' 个阶段全部通过，等待人工审查')
      });
    }

    var next = state.current + 1;
    var stage = STAGES[next];
    return Object.freeze({
      status: 'running',
      current: next,
      entries: appendEntry(state, stage.label + ' — ' + stage.detail)
    });
  }

  /** 回到初始状态。 */
  function reset() {
    return createDemoState();
  }

  /** 0-100 的演示进度：已完成阶段数 / 总阶段数。 */
  function progress(state) {
    if (state.status === 'done') {
      return 100;
    }
    if (state.status === 'idle') {
      return 0;
    }
    return Math.round((state.current / STAGE_COUNT) * 100);
  }

  /** 返回某个阶段在给定状态下的展示状态：done / active / pending。 */
  function stageState(state, index) {
    if (!Number.isInteger(index) || index < 0 || index >= STAGE_COUNT) {
      throw new RangeError('stage index out of range: ' + index);
    }
    if (state.status === 'done') {
      return 'done';
    }
    if (state.status === 'idle') {
      return 'pending';
    }
    if (index < state.current) {
      return 'done';
    }
    if (index === state.current) {
      return 'active';
    }
    return 'pending';
  }

  /** 当前阶段的一句话摘要，供页面标题使用。 */
  function summary(state) {
    if (state.status === 'done') {
      return { title: '演示完成', detail: '所有阶段均已完成，等待人工确认' };
    }
    if (state.status === 'idle') {
      return { title: '准备就绪', detail: '点击「开始演示」，查看 Agent 如何处理一个 Issue' };
    }
    return { title: STAGES[state.current].label, detail: STAGES[state.current].detail };
  }

  return Object.freeze({
    STAGES: STAGES,
    STAGE_COUNT: STAGE_COUNT,
    createDemoState: createDemoState,
    start: start,
    advance: advance,
    reset: reset,
    progress: progress,
    stageState: stageState,
    summary: summary
  });
});
