# Urban Echoes - Spot the Difference MVP

ZGCA 校园主题找不同 H5 小游戏前端项目。当前版本仍然是以单机体验为基础的 polished MVP，但已经加入一层可接招生后端 API 的联机增强能力：当 URL 带有 `user_id` 时，应用会查询“当前小游戏”的云端整体通关状态，并在本地所有开放关卡全部通关后尝试向后端登记该小游戏已通关。

这版不是“纯联网游戏”。本地单关进度仍然保留在浏览器本地存储中；联机部分只负责“当前小游戏整体是否已通关”的读写，不做逐关云端同步。

## 当前已实现

- 首页 / 选关页，支持左右切换关卡与直接进入当前关卡
- 双圆窗主玩法，支持拖拽平移、滚轮或双指缩放
- 找到足够差异点后自动进入结果页
- 关卡完成状态保存在浏览器 `localStorage`
- 单关直达、`?debug=1`、`?reset=1` 等开发入口
- 差异点 editor，可用于录点、调半径、导出关卡片段
- 背景音乐目录与主 BGM 文件名约定已预留
- 可选联机增强：检测 URL 中的 `user_id`，查询当前小游戏云端整体通关状态，并在本地所有开放关卡全部通关后尝试登记已通关

## 当前状态与边界

- 当前版本仍是单机优先的静态 H5，不依赖后端才能游玩。
- 本地单关进度继续保存在浏览器 `localStorage`，不会被云端整体通关状态粗暴覆盖。
- 云端当前只同步“当前小游戏整体是否已通关”，不做逐关状态同步。
- 没有 `user_id` 时，应用自动退回当前单机模式。
- 有 `user_id` 但接口失败、超时或返回异常时，应用会降级继续使用本地逻辑，不阻断首页或关卡游玩。

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
- 首页入口（带联机上下文）：`/index.html?user_id=test-user`
- 单关直达：`/index.html?level=1`
- 单关直达：`/index.html?level=level-01`
- 单关直达 + 联机上下文：`/index.html?level=1&user_id=test-user`
- Debug 入口：`/index.html?debug=1`
- 重置本地进度：`/index.html?reset=1`
- Debug + 单关组合：`/index.html?debug=1&level=1`
- Editor 入口：`/tools/level-editor.html`

说明：

- 首页不再暴露 editor / debug / reset 的快捷按钮，开发时请直接使用 URL。
- `?debug=1`、`?level=...`、`?reset=1`、`?user_id=...` 可以组合使用。
- 当前没有自动化测试脚本，建议以本地静态服务 + 手动验收为主。

### 建议手动检查项

- 首页是否能正常显示并切换关卡
- 单关直达是否能正确进入指定关卡
- `?debug=1` 是否显示热区与点击读数
- `?reset=1` 是否能清空本地通关记录
- Editor 是否能加载已有关卡、录点并导出
- 带 `user_id` 访问时，是否能正常发出 admission 状态查询请求

## 目录结构与关键文件

```text
ZGCA_202605_spot_the_diff/
|- index.html
|- README.md
|- data/
|  \- levels.js
|- assets/
|  |- audio/
|  |  |- bgm/
|  |  \- sfx/
|  |- css/
|  |  |- styles.css
|  |  \- editor.css
|  |- img/
|  \- js/
|     |- admission.js
|     |- app.js
|     |- editor.js
|     \- shared.js
\- tools/
   \- level-editor.html
```

### 关键文件职责

- `index.html`
  主游戏唯一页面入口，承载首页、游戏页、结果页三套 DOM 结构，并引入 `data/levels.js`、`assets/js/shared.js`、`assets/js/admission.js`、`assets/js/app.js`。

- `data/levels.js`
  关卡数据源。每关的 `levelId`、标题、图片路径、差异点数组、`requiredDifferences`、`titleEn` 等都在这里维护。

- `assets/js/admission.js`
  联机增强层。负责集中配置 `API base URL / campaign_id / game_id`，解析 URL 中的 `user_id`，封装 admission 查询/登记接口，并维护本会话内的云端整体通关同步状态与降级逻辑。

- `assets/js/app.js`
  主玩法控制器。负责：
  首页选关与直达入口解析；
  本地进度读写；
  关卡加载；
  缩放 / 拖拽 / 点击命中；
  过关判断；
  结果页文案与流程；
  `?debug=1`、`?reset=1` 等开发入口；
  主 BGM 与点击音效；
  在合适时机调用 `assets/js/admission.js` 做云端整体通关状态查询与登记。

- `assets/js/shared.js`
  首页与 editor 共用的基础工具集，例如 query 参数读取、坐标换算、图片加载、数值格式化、复制文本、一次性音效播放器等。

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

- `assets/audio/sfx/`
  轻量交互音效目录。当前已接入 `ui-click.mp3`。

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

## Admission 联机增强

当前联机增强只处理“当前小游戏整体通关状态”，不处理本地每一关的云端同步。

### 配置位置

集中配置在 `assets/js/admission.js` 的 `DEFAULT_CONFIG` 中：

- `apiBaseUrl`: `https://leaderboard.liruochen.cn`
- `campaignId`: `zgca-admission`
- `gameId`: `zgca-spot-the-diff`
- `timeoutMs`: `5000`

后续正式联调时，通常只需要优先确认或替换：

- `campaignId`
- `gameId`

### 当前行为

- 应用初始化时，如果 URL 中存在 `user_id`，会调用 `/api/admission/game_status` 查询当前小游戏的云端整体通关状态。
- 如果云端已经是已通关，前端会保留这个整体状态结果，但不会去改写本地每关完成列表。
- 当本地所有开放关卡全部通关时，如果当前存在 `user_id`，应用会调用 `/api/admission/register_clear` 尝试登记当前小游戏已通关。
- 如果云端已确认通关，或本次会话已经成功 / 已尝试登记过，前端会做去重保护，避免重复无脑上报。

### 联调检查清单

- 当前 `campaignId` 默认值是 `zgca-admission`。
- 当前 `gameId` 默认值是 `zgca-spot-the-diff`，联调时需要确认后端已按这个真实值完成配置。
- 真实链路需要通过 URL 传入 `user_id`。
- 需要确认后端已经在对应 `campaignId` 下配置了这个 `gameId`。
- 需要确认浏览器环境下对 `https://leaderboard.liruochen.cn` 的跨域访问正常。
- 需要分别验证 `/api/admission/game_status` 和 `/api/admission/register_clear` 的真实返回。
- 当前云端只同步“小游戏整体通关状态”，本地仍保存单关进度。

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
- `assets/audio/sfx/`：交互音效资源目录
- `assets/js/app.js`：当前主 BGM / 点击音效接入点
- `assets/js/shared.js`：一次性音效播放器

### 改 user_id / Admission API 接入

- `assets/js/admission.js`：`user_id` 解析、配置项、查询接口、登记接口、会话级同步状态
- `assets/js/app.js`：初始化查询时机、全部开放关卡通关后的登记触发时机

## Editor 使用简述

1. 打开 `/tools/level-editor.html`
2. 选择已有关卡并载入，或创建空白配置
3. 替换图片路径后应用图片
4. 在预览图上点击录入差异点，必要时在列表中调整 `id` 与 `radius`
5. 根据需要导出 `differences` 片段或完整关卡对象，再回填到 `data/levels.js`

如果只是替换同一路径下的素材文件，通常不需要改文件名；重新应用图片或刷新 editor 页面即可重新取图。

## Further Integration Notes

以下内容仍属于后续联调或扩展方向，不是当前这版已经完成的范围：

- 导航页或外层容器如何正式传入 `user_id`
- 当前小游戏在招生链路中的正式 `gameId` 配置值
- 云端状态的可视化展示样式
- 更细粒度的每关云端同步或排行榜玩法

## 文档说明

- 当前项目没有单独的 `docs/` 根目录，README 就是当前主文档。
- 如果后续新增联调说明、数据制作规范或更细的测试记录，建议再按主题拆到 `docs/`。
