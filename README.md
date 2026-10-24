# Data Screen · 数据大屏应用

**Vue 3 + TypeScript + Vite + Vue Router** 数据可视化工程。索引页使用 Vue 响应式组件；每个大屏是按需加载的路由页面。当前收录 Prompt Crawler：34,100 个真实 XYZ 粒子、WebGL 点线渲染、八阶段扫描与六块联动监测面板。

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

开发源码需由 Vite 运行；生产环境使用 `dist/`，不要直接打开源码 `index.html`。构建结果包含哈希资源文件和按路由拆分的 JS/CSS。WebGL 引擎保留 JavaScript 实现，入口通过 `engine.d.ts` 声明供 TypeScript 组件调用，并由 ESLint 与浏览器回归验证。

## 路由与组件

| 路由 | 页面 |
| --- | --- |
| `/#/` | 作品索引，支持搜索、分类与排序 |
| `/#/screens/prompt-crawler` | 三维语义网络大屏 |
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
  assets/previews/                     # 由 Vite 处理的预览资源
  styles/                             # 公共基础与索引样式
tests/app.spec.ts                      # 浏览器端到端回归
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

测试生产预览：搜索/筛选、SPA 导航与三次重复挂载、动画循环清理、XYZ 深度和旋转视差、阶段数据、暂停/倍速、刷新深链接、404、手机布局、减少动态效果。

如果本机已有 Chrome，也可以设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 为可执行文件路径。CI 使用 Playwright 官方 Chromium。推送 main 或打开 PR 后会运行 CI；成功构建的 `dist/` 可在 GitHub Actions artifacts 下载。CI 不自动发布外网。

## 部署

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

拖动旋转、Shift + 拖动平移、滚轮缩放；空间键暂停/播放；`2.5×` 切换速度；`↺` 重播；`⌖` 重置；`⛶` 全屏。默认保留 2.5 倍速的短停、突进、回弹节奏。系统减少动态效果时默认暂停。

目前使用模拟数据，无后台服务或凭据。WebGL 不可用时使用 Canvas 投影点云回退；全屏受浏览器权限限制。本次提供可部署工程和 CI 配置，不默认创建外部托管项目。
