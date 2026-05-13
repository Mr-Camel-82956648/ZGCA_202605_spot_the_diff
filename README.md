# Urban Echoes - Spot the Difference MVP

ZGCA 校园主题找不同 H5 小游戏前端项目。当前版本已经是可玩的单机版 polished MVP，核心流程集中在本地静态资源与浏览器本地存储：首页选关、双图找不同、通关结果页、基础 debug 入口，以及可用的差异点录入 editor。

当前这版的定位不是“已接后端的完整线上版本”，而是“单机版原型完善阶段”。它适合继续做内容补充、首页和玩法打磨、关卡制作，以及为后续身份接入或服务端同步预留落点。

## 当前已实现

- 首页 / 选关页，支持左右切换关卡与直接进入当前关卡
- 双圆窗主玩法，支持拖拽平移、滚轮或双指缩放
- 找到足够差异点后自动进入结果页
- 关卡完成状态保存在浏览器 `localStorage`
- 单关直达、`?debug=1`、`?reset=1` 等开发入口
- 差异点 editor，可用于录点、调半径、导出关卡片段
- 背景音乐目录与主 BGM 文件名约定已预留

## 当前状态与边界

- 当前版本是单机版，没有接入正式后端。
- 当前完成状态与进度记录以浏览器本地存储为主。
- 当前尚未正式接入导航页身份透传，也没有服务端同步“小游戏整体通关状态”。
- 如果后续要接身份或服务端同步，需要单独设计和实施；不属于当前已实现功能。

## 本地运行与测试

建议在项目根目录启动本地静态服务，不要直接双击 HTML 文件运行。

```powershell
cd d:\projects\ZGCA_202605_spot_the_diff
python -m http.server 8080
```

启动后打开：`http://127.0.0.1:8080/`

如果本机没有 Python，也可以使用任意等价的静态服务器工具，例如 `npx serve .`。这个项目当前不依赖构建步骤。

### 常用入口

- 首页入口：`/index.html`
- 单关直达：`/index.html?level=1`
- 单关直达：`/index.html?level=level-01`
- Debug 入口：`/index.html?debug=1`
- 重置本地进度：`/index.html?reset=1`
- Debug + 单关组合：`/index.html?debug=1&level=1`
- Editor 入口：`/tools/level-editor.html`

说明：

- 首页不再暴露 editor / debug / reset 的快捷按钮，开发时请直接使用 URL。
- `?debug=1`、`?level=...`、`?reset=1` 可以组合使用。
- 当前没有自动化测试脚本，建议以本地静态服务 + 手动验收为主。

### 建议手动检查项

- 首页是否能正常显示并切换关卡
- 单关直达是否能正确进入指定关卡
- `?debug=1` 是否显示热区与点击读数
- `?reset=1` 是否能清空本地通关记录
- Editor 是否能加载已有关卡、录点并导出

## 目录结构与关键文件

```text
ZGCA_202605_spot_the_diff/
|- index.html
|- README.md
|- data/
|  \- levels.js
|- assets/
|  |- audio/
|  |  \- bgm/
|  |- css/
|  |  |- styles.css
|  |  \- editor.css
|  |- img/
|  \- js/
|     |- app.js
|     |- editor.js
|     \- shared.js
\- tools/
   \- level-editor.html
```

### 关键文件职责

- `index.html`
  主游戏唯一页面入口，承载首页、游戏页、结果页三套 DOM 结构，并引入 `data/levels.js`、`assets/js/shared.js`、`assets/js/app.js`。

- `data/levels.js`
  关卡数据源。每关的 `levelId`、标题、图片路径、差异点数组、`requiredDifferences`、`titleEn` 等都在这里维护。

- `assets/js/app.js`
  主玩法控制器。负责：
  首页选关与直达入口解析；
  本地进度读写；
  关卡加载；
  缩放 / 拖拽 / 点击命中；
  过关判断；
  结果页文案与流程；
  `?debug=1`、`?reset=1` 等开发入口；
  主 BGM 的尝试播放。

- `assets/js/shared.js`
  首页与 editor 共用的基础工具集，例如 query 参数读取、坐标换算、图片加载、数值格式化、复制文本等。

- `assets/css/styles.css`
  主游戏样式文件。负责首页、双圆窗游戏界面、debug 面板、结果页，以及移动端适配与整体视觉表现。

- `tools/level-editor.html`
  录点工具页面入口，提供现有关卡载入、空白配置创建、图片替换、点位列表和导出区域。

- `assets/js/editor.js`
  editor 逻辑文件。负责关卡载入、双图预览、拖拽缩放、点击录点、点位编辑、`differences` / 完整关卡对象导出等。

- `assets/css/editor.css`
  editor 页面样式文件，负责工具面板、预览区、点位列表、导出区和响应式布局。

- `assets/audio/bgm/`
  背景音乐目录。当前已经约定主 BGM 文件名为 `main-theme.mp3`，主游戏会在合适时机尝试播放它；文件缺失不会阻断主流程。

## 关卡数据约定

`data/levels.js` 中每关的核心结构如下：

```js
{
  levelId: "level-01",
  requiredDifferences: 6,
  title: "校园主入口",
  titleEn: "Main Campus Entrance",
  summary: "关卡简介，可选",
  imageA: "./assets/img/levels/level-01/scene-a.jpg",
  imageB: "./assets/img/levels/level-01/scene-b.jpg",
  differences: [
    { id: "roof-light", x: 0.205, y: 0.172, radius: 0.045 }
  ]
}
```

补充说明：

- `x`、`y`、`radius` 都是归一化坐标 / 半径。
- `requiredDifferences` 用于控制“找到多少处即可过关”。
- `titleEn` 主要用于首页或结果页副标题等展示。
- 图片资源当前由配置显式引用，不依赖自动扫描目录。

## 改什么功能先看哪个文件

### 改首页 / 选关

- `index.html`：首页 DOM 结构与入口按钮
- `assets/js/app.js`：首页轮播、选关状态、入口跳转、完成态 / 未完成态文案
- `assets/css/styles.css`：首页视觉、按钮、圆形预览、结果态样式
- `data/levels.js`：关卡标题、首页预览图、英文副标题等展示数据

### 改关卡规则 / 过关逻辑

- `assets/js/app.js`：点击命中、已找到状态、计数器、过关判定、结果页流转
- `data/levels.js`：每关差异点与 `requiredDifferences`
- `assets/js/shared.js`：如需调整坐标换算、命中辅助工具，可从这里入手

### 改关卡数据

- `data/levels.js`：唯一主入口
- `assets/img/levels/...`：关卡图片素材
- `tools/level-editor.html` + `assets/js/editor.js`：辅助录点、调半径、导出新配置

### 改 editor / 录点工具

- `tools/level-editor.html`：工具页面结构
- `assets/js/editor.js`：录点、缩放平移、点位编辑、导出逻辑
- `assets/css/editor.css`：工具页布局与交互样式
- `assets/js/shared.js`：editor 与主游戏共用的底层工具

### 改音频 / BGM

- `assets/audio/bgm/`：音频资源目录
- `assets/js/app.js`：当前主 BGM 路径与播放时机

### 未来如果接身份或服务端同步

只看方向，不代表当前已实现：

- 从 `assets/js/app.js` 现有的 URL 参数入口与本地进度读写逻辑开始梳理
- 先明确哪些状态仍留在本地，哪些需要与外部页面或服务端同步
- 如果未来有导航页传入 `user_id`，建议优先检查入口参数解析和初始化流程
- 如果未来要同步整体通关状态，建议优先检查 `localStorage` 进度结构和通关写入时机

## Editor 使用简述

1. 打开 `/tools/level-editor.html`
2. 选择已有关卡并载入，或创建空白配置
3. 替换图片路径后应用图片
4. 在预览图上点击录入差异点，必要时在列表中调整 `id` 与 `radius`
5. 根据需要导出 `differences` 片段或完整关卡对象，再回填到 `data/levels.js`

如果只是替换同一路径下的素材文件，通常不需要改文件名；重新应用图片或刷新 editor 页面即可重新取图。

## Future Extension / Integration Notes

以下内容属于未来扩展方向，不是当前已实现功能：

- 当前版本仍是单机版，进度记录以本地存储为主。
- 后续可能接入导航页传入的 `user_id`，用于识别当前用户。
- 后续可能接入服务端，用于同步“小游戏整体通关状态”或其他跨页面进度。
- 这些能力需要单独实施，并补充新的状态流转与接口约定；当前 README 不把它们写成既成事实。

## 文档说明

- 当前项目没有单独的 `docs/` 根目录，README 就是当前主文档。
- 如果后续新增玩法说明、接入说明或数据制作规范，建议再按主题拆到 `docs/`。
