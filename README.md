# Data Screen · 数据大屏作品集

独立 HTML 数据大屏的持续收藏与制作仓库。首页是可搜索、可按主题筛选、可排序的作品索引；每个大屏存放在独立目录，支持直接打开。

## 快速开始

直接打开根目录 [`index.html`](index.html)，或使用任意静态服务器：

```bash
git clone https://github.com/mzlc-linmo/data-screen.git
cd data-screen
python3 -m http.server 8080
```

浏览器访问 `http://localhost:8080`。无需构建、安装依赖或调用外部 CDN。目录页面使用普通脚本加载，因此 `file://` 方式也可搜索和筛选。

## 已收录大屏

| 大屏 | 分类 | 入口 |
| --- | --- | --- |
| Prompt Crawler | 三维可视化 | [打开大屏](dashboards/prompt-crawler/index.html) |

### Prompt Crawler

基于参考视频重建的三维语义网络大屏：34,100 个 XYZ 粒子、GPU 点线渲染、透视与深度测试、8 个读取阶段、6 块联动数据面板。全部使用模拟数据，无真实后台连接。

- 拖动：旋转三维空间；Shift + 拖动：平移；滚轮：缩放。
- `Ⅱ / ▶` 或空格：暂停 / 播放；暂停后仍可旋转视角。
- `2.5×`：切换 1× / 1.5× / 2.5× / 4×，默认每阶段约 2.2 秒。
- `↺`：重播；`⌖` 或双击：重置视角；`⛶`：全屏。
- 顶部阶段按钮或左右方向键：切换读取阶段。
- `←`：返回索引页。
- 系统开启“减少动态效果”时默认暂停，可手动播放。

现代浏览器启用 WebGL 时获得完整点线与深度效果；WebGL 不可用时退化为 Canvas 投影点云。全屏受浏览器和嵌入环境权限限制。

## 新增大屏

1. 在 `dashboards/<唯一标识>/` 下创建 `index.html`。资源放在该目录内，使用相对路径。
2. 将预览图放到 `assets/previews/<唯一标识>.webp`。建议 1600 × 1000，避免把原始视频放进仓库。
3. 在 [`assets/screens.js`](assets/screens.js) 的 `window.DATA_SCREENS` 数组中添加记录：

```js
{
  id: 'operations-overview',
  title: '运营总览',
  subtitle: '核心业务指标 · 实时监控',
  description: '简要说明大屏展示的内容与可用交互。',
  category: '业务监测',
  tags: ['运营', '实时指标'],
  url: 'dashboards/operations-overview/index.html',
  preview: 'assets/previews/operations-overview.webp',
  date: '2026-10-24',
  featured: false,
  highlights: [
    { value: '06', label: '监测模块' }
  ]
}
```

`id` 必须唯一；`date` 使用 `YYYY-MM-DD`；`featured: true` 最多设置一项。`tags` 与 `highlights` 可使用空数组。分类按钮、总数和搜索结果会根据数据自动生成，无需修改页面结构。路径相对于根目录索引页。

为新大屏添加返回入口：`<a href="../../index.html">返回大屏索引</a>`。

## 目录结构

```text
index.html                         # 作品索引
assets/
  catalog.css                      # 索引页样式与响应式布局
  catalog.js                       # 目录渲染、搜索、分类、排序
  screens.js                       # 大屏目录配置
  previews/                        # 作品预览图
dashboards/
  prompt-crawler/index.html        # 独立三维大屏，含全部脚本与样式
```

## 验证与部署

提交前检查：目录链接和预览图可加载；搜索、分类、排序与空结果状态可用；窄屏无水平溢出；每个大屏可独立打开；无浏览器脚本错误。当前目录没有构建步骤、包依赖或测试运行时依赖。

整个仓库可由任意静态站点服务。所有资源使用相对路径，适用于项目子路径部署。`.nojekyll` 避免 GitHub Pages 对静态文件进行 Jekyll 处理；本次提交没有开启或配置 Pages 托管。
