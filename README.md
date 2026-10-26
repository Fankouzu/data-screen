# Data Screen · 数据大屏应用

**Vue 3 + TypeScript + Vite + Vue Router** 数据可视化工程。索引页使用 Vue 响应式组件；每个大屏是按需加载的路由页面。

- **Prompt Crawler**：34,100 个真实 XYZ 粒子、WebGL 点线渲染、八阶段扫描与六块联动监测面板。
- **Decision Grid**：15 面空间数据墙、600 张决策卡片、流动光束、五阶段决策路径与 12 个业务案例，复刻第二段视频的决策网络效果。
- **Market Neural**：2,151 个 XYZ 节点、6,174 条网格边、280 根动态触须，三球融合与分裂，六路输入信号和金融终端面板。详见 [视频分析与实现](docs/market-neural.md)。

- **Vortex Desk**：彩色三维粒子龙卷、螺旋光带、底部喷射，联动六个操作员、证据矩阵、JSON 信号与代码日志。详见 [视频分析与实现](docs/vortex-desk.md)。

- **Signal Loom**：三路彩色输入、立体二进制矩阵、发光丝束与六段镜头巡游，十二个业务场景联动推理监测面板。详见 [视频分析与实现](docs/signal-loom.md)。

- **Knowledge Engine**：多色知识图谱、立体球形节点、文档写入波纹与来源冲突追踪，联动八个知识终端面板。详见 [视频分析与实现](docs/knowledge-engine.md)。

- **Rea Lab**：白底逆向工程终端，双侧弯曲指令带、暖冷色三维网络与相位同步，联动六个监测面板。详见 [视频分析与实现](docs/rea-lab.md)。

## 开发与生产构建

推荐 Node.js 22 LTS（22.13+）或 Node.js 24 LTS。

```bash
npm ci
npm run dev
```

Vite 输出本地开发地址，默认 `http://localhost:5173`。支持 Vue 热更新。

```bash
npm run lint       # Vue / TypeScript / JavaScript 静态检查
npm run typecheck  # Vue 组件与应用 TypeScript 检查
npm run build      # 类型检查 + 生产构建，输出 dist/
npm run preview    # 本地验证生产产物，默认 4173
```

开发源码需由 Vite 运行；生产环境使用 `dist/`，不要直接打开源码 `index.html`。构建结果包含哈希资源文件和按路由拆分的 JS/CSS。Prompt Crawler 的 WebGL 引擎保留 JavaScript 实现，入口通过 `engine.d.ts` 声明供 TypeScript 组件调用，并由 ESLint 与浏览器回归验证。

## 路由与组件

| 路由 | 页面 |
| --- | --- |
| `/#/` | 作品索引，支持搜索、分类与排序 |
| `/#/screens/prompt-crawler` | 三维语义网络大屏 |
| `/#/screens/decision-grid` | 三维决策网络大屏 |
| `/#/screens/market-neural` | 三维金融信号网络大屏 |
| `/#/screens/vortex-desk` | 彩色粒子涡旋交易台 |
| `/#/screens/signal-loom` | 三维信号织机 |
| `/#/screens/knowledge-engine` | 三维知识图谱引擎 |
| `/#/screens/rea-lab` | 逆向工程实验室 |
| 其他 hash 路由 | 404 页面 |

采用 hash 路由，支持 CDN、对象存储、Nginx 和子目录托管，刷新深链接无需服务端重写。

```text
src/
  main.ts / App.vue                    # Vue 应用入口
  router/index.ts                      # 按需加载的路由注册
  data/screens.ts                      # 带类型的大屏目录
  components/ScreenCard.vue             # 作品卡片
  views/CatalogView.vue                 # 响应式索引
  views/NotFoundView.vue                # 404
  dashboards/prompt-crawler/
    PromptCrawler.vue                  # 大屏组件与生命周期
    engine.js / engine.d.ts             # WebGL 引擎及入口类型
    style.css                          # 隔离的大屏样式
  dashboards/decision-grid/
    DecisionGrid.vue                    # 指标、案例、监测面板与交互控制
    model.ts / engine.ts                # 决策状态与 XYZ 投影渲染
    style.css                          # 决策大屏独立样式
  dashboards/market-neural/
    MarketNeural.vue                    # 行情面板、六路信号和交互控制
    model.ts / engine.ts                # 模拟状态、球体融合与 XYZ 投影
    style.css                          # 金融终端响应式布局
  dashboards/vortex-desk/
    VortexDesk.vue                     # 操作员、信号流、代码和日志面板
    model.ts / engine.ts                # 状态模型与三维粒子引擎
    style.css                          # 全屏粒子场与浮层布局
  dashboards/signal-loom/
    SignalLoom.vue / style.css         # 信号终端布局与监测面板
    model.ts / engine.ts               # XYZ 数字墙、丝束、镜头巡游
  dashboards/knowledge-engine/
    KnowledgeEngine.vue / style.css    # 知识终端与八个监测面板
    KnowledgeOverlays.vue              # 文档标签与浮动检查卡
    model.ts / engine.ts               # 图谱几何、阶段时序与相机
  dashboards/rea-lab/
    ReaLab.vue / style.css             # 白底逆向工程终端与六个监测面板
    model.ts / engine.ts               # 双侧网络、指令频谱与相位同步
  assets/previews/                     # 由 Vite 处理的预览资源
  styles/                             # 公共基础与索引样式
tests/*.spec.ts                        # 七个大屏的浏览器端到端回归
deploy/nginx.conf                      # 容器生产服务配置
Dockerfile                            # 多阶段构建
.github/workflows/ci.yml               # 检查、测试、构建与产物归档
```

大屏在 `onMounted` 初始化，在 `onBeforeUnmount` 取消动画帧、清理计时器和监听器、断开 ResizeObserver、释放 WebGL buffer/program/context。路由切换不会保留后台渲染循环；索引和大屏样式有独立作用域。

## 新增大屏

1. 在 `src/dashboards/<id>/` 新建 Vue 组件，建议拆分视图、渲染逻辑与样式。
2. 在 `src/router/index.ts` 注册按需加载路由：

```ts
{
  path: '/screens/operations',
  name: 'operations',
  component: () => import('../dashboards/operations/OperationsScreen.vue'),
  meta: { title: '运营总览' },
}
```

3. 将预览图放入 `src/assets/previews/`，在 `src/data/screens.ts` 中 import，并新增 `ScreenDefinition` 记录：

```ts
{
  id: 'operations',
  title: '运营总览',
  subtitle: '核心业务指标 · 实时监控',
  description: '展示业务指标和变化趋势。',
  category: '业务监测',
  tags: ['运营', '实时指标'],
  url: '/screens/operations',
  preview: operationsPreview,
  date: '2026-10-24',
  featured: false,
  highlights: [{ value: '06', label: '监测模块' }],
}
```

索引的数量、筛选分类、搜索和排序自动更新。`id` / 路由名称保持唯一，`featured` 最多一项。使用 `<RouterLink to="/">返回大屏索引</RouterLink>` 导航。新引擎必须提供卸载清理，并为样式增加自己的根作用域。

## 自动化测试

```bash
npx playwright install chromium
npm run build
npm run test:e2e
# 一次执行全部检查（先安装浏览器）
npm run check
```

测试生产预览：七大屏索引的搜索/筛选/排序、SPA 导航与三次重复挂载、动画循环清理、XYZ 深度和旋转视差、阶段数据、暂停/倍速、刷新深链接、404、手机布局、减少动态效果。Decision Grid 还验证 12 案例切换、五阶段推进，以及低于 0.85 置信度时的人工复核路径。Market Neural 验证完整融合周期、三种形态模式、暂停旋转和横竖屏布局边界。Vortex Desk 验证粒子深度与相机视差、五阶段与风险拦截、循环清理和响应式布局。

如果本机已有 Chrome，也可以设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 为可执行文件路径。CI 使用 Playwright 官方 Chromium。推送 main 或打开 PR 后会运行 CI；成功构建的 `dist/` 可在 GitHub Actions artifacts 下载。Cloudflare Pages 的 Git 集成独立执行构建与发布，不等待 GitHub CI 完成。

## 部署

### Cloudflare Pages（生产环境）

公网地址：**https://data-screen-6zn.pages.dev/**

项目 `data-screen` 已连接 GitHub 仓库 `mzlc-linmo/data-screen`。推送 `main` 会自动构建并更新生产站点；其他分支的构建可用于预览。GitHub 仓库保持私有，公网仅提供 `dist/` 中的前端产物。

| 配置项 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 根目录 | 仓库根目录 |
| 构建命令 | `npm run build` |
| 构建输出目录 | `dist` |
| 环境变量 | `NODE_VERSION=24` |
| 资源基础路径 | `/`（默认，不设置 `VITE_BASE_PATH`） |

Cloudflare 自动安装锁文件中的依赖。使用现有 GitHub App 集成，不需要在仓库或 GitHub Actions 中保存 Cloudflare API Token。Hash 路由支持直接打开及刷新七个大屏，无需服务端路由规则。

部署状态、日志及回滚入口位于 Cloudflare → Workers 和 Pages → `data-screen` → 部署。发布失败时先查看构建日志；需要回退时，可将之前的成功生产部署回滚。添加新大屏后提交并推送 `main` 即可发布。

### Vercel / Netlify / 静态托管

连接仓库，框架选 **Vite**，安装命令 `npm ci`，构建命令 `npm run build`，输出目录 `dist`。无需 Node 服务端常驻进程。也可以将本地构建的 `dist/` 内容上传到任意 Web 服务器。

### 子目录托管

默认发布到网站根路径；若部署到 `/data-screen/`：

```bash
VITE_BASE_PATH=/data-screen/ npm run build
```

将构建结果放到服务器对应子目录，访问 `/data-screen/#/`。此变量在构建时生效，不包含域名。可参考 `.env.example`。

### Docker / Nginx

```bash
docker build -t data-screen .
docker run --rm -p 8080:80 data-screen
```

访问 `http://localhost:8080/#/`。镜像内先使用 Node 构建，再用 Nginx 提供生产资源；不包含开发依赖。默认容器配置部署到根路径。

## 大屏操作与范围

Prompt Crawler：拖动旋转、Shift + 拖动平移、滚轮缩放；空间键暂停/播放；`2.5×` 切换速度；`↺` 重播；`⌖` 重置；`⛶` 全屏。默认保留 2.5 倍速的短停、突进、回弹节奏。

Decision Grid：拖动或聚焦画布后按方向键旋转，滚轮缩放；选择任意业务案例即可从 STATE 重新开始。每个案例依次经过 STATE → ASK → JEV → GATE → CODE，默认每 6 秒切换案例。`Ⅱ` 暂停、`1×` 切换速度、`↺` 重播当前案例、`⌖` 重置视角、`⛶` 全屏。暂停时可调整视角。界面显示的成本、延迟、置信度等均为视频风格的演示数值，并非实测服务表现；支持案例以 0.71 置信度展示 HOLD / human_gate 分支。

Market Neural：默认 28 秒循环呈现分布 → 融合 → 统一 → 分裂，支持自动、合并、分裂三种视图。拖动或方向键旋转，滚轮或 `+` / `-` 缩放，`0` 重置；工具栏可暂停、倍速、重播、重置、全屏。桌面横竖屏填满视口，低于 860px 高的桌面保留滚动，手机采用纵向排布。

Vortex Desk：拖动或方向键调整三维涡旋视角，滚轮或 `+` / `-` 缩放，`0` 重置；工具栏支持暂停、倍速、重播和全屏。演示依次经过 OBSERVE → ANALYZE → RISK CHECK → EXECUTE → REPORT，风险状态与执行浮层联动。

Signal Loom：三路信号织入立体数字矩阵，27 秒巡游、十二个业务场景。拖动或方向键旋转，滚轮或 `+` / `-` 缩放，`0` 重置；工具栏支持暂停、倍速、重播和全屏。

Knowledge Engine：24 秒演示读取、写入、回答与冲突检查。节点从 2,788 增至 3,206，最多 11,483 条实际连线；可选择文档查看声明和来源，手动检查不改变演示流程目标。支持暂停、倍速、重播、旋转、缩放、重置和全屏。

Rea Lab：18 秒完成加载、反汇编、反编译、同步与结算。双侧真实 XYZ 网络由杂乱线簇收束为指令流，最终解析 1,536 条指令；支持暂停、倍速、重播、旋转、缩放与平滑重置。

七个大屏在系统减少动态效果时均默认暂停。新大屏无需增加依赖，使用真实 XYZ 几何与透视投影；离开页面会清理绘制循环、事件、纹理缓存及尺寸观察器。

目前使用模拟数据，无后台服务或凭据。使用 WebGL 的大屏在其不可用时提供 Canvas 投影回退；Rea Lab 直接使用 Canvas 绘制空间网络；全屏受浏览器权限限制。生产站点由 Cloudflare Pages 托管。
