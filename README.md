# agent-playground

dsh-superagent playground repository

## 示例：Agent 工作流演示

`demo/index.html` 是一个零依赖的单页示例，用可交互的方式展示 Agent 处理一个 Issue 的完整流水线：

读取 Issue → 设计方案 → 实现代码 → 自动验证 → 提交 PR → 响应评审 → 交付合并。

### 查看示例

直接用浏览器打开 `demo/index.html` 即可（无需安装依赖，可离线运行）。页面支持：

- 手动逐步推进（开始 / 下一步 / 重置）
- 自动播放整条流水线
- `?step=N` 参数快速跳转，例如 `demo/index.html?step=7` 直接展示完成状态

### 运行验证

```bash
npm test
# 等价于
node --test demo/agent-flow.test.js
```

测试使用 Node.js 内置的 `node:test`，覆盖状态转换、阶段状态、进度计算、日志记录和输入边界。

### 目录结构

```
demo/
├── index.html          # 演示页面（内联样式与交互脚本）
├── agent-flow.js       # 与页面共用的零依赖状态机
├── agent-flow.test.js  # node:test 单元测试
└── evidence/           # 示例改动前后的截图证据
```
