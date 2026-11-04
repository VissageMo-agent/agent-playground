# agent-playground

dsh-superagent playground repository

## 小游戏：泡泡禅（Bubble Zen）

`game/index.html` 是一个零依赖的解压小游戏：轻轻按破一片泡泡纸，听一声「啵」。

- **禅模式**：不限时，按完一张自动换纸，页面只累计按破的数量。
- **计时模式**：60 秒，连击越高倍率越高（最高 ×5），星光泡三倍分，最佳成绩保存在本地。
- 每换一张泡泡纸都会换一种天色（晨雾 / 海盐 / 樱雨），页面配色随之过渡。
- 音效由 WebAudio 实时合成，可随时静音；支持鼠标、触屏和按住拖动连续按破。
- 适配桌面和手机，并尊重系统的「减少动态效果」设置。

### 查看游戏

直接用浏览器打开 `game/index.html` 即可（无需安装依赖，可离线运行）。

### 运行验证

```bash
npm test
# 等价于
node --test demo/agent-flow.test.js game/bubble-zen.test.js
```

`game/bubble-zen.test.js` 覆盖泡泡纸生成、连击倍率、星光泡、计时结算、换纸阈值和最佳成绩存储等逻辑。

### 目录结构

```
game/
├── index.html          # 游戏页面（内联样式）
├── game.js             # Canvas 绘制、指针交互与音效
├── bubble-zen.js       # 与页面共用的零依赖状态机与计分逻辑
├── bubble-zen.test.js  # node:test 单元测试
└── evidence/           # 改动前后的截图证据
```

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
node --test demo/agent-flow.test.js game/bubble-zen.test.js
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
