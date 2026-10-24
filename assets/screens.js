// 新增大屏时，在这里登记一条记录。路径相对于仓库根目录 index.html。
// 每个 id 必须唯一；date 使用 YYYY-MM-DD；featured 最多设置一项。
window.DATA_SCREENS = [
  {
    id: 'prompt-crawler',
    title: 'Prompt Crawler',
    subtitle: '三维语义网络 · 智能扫描大屏',
    description: '跟随扫描器穿行于立体数据云，在八个读取阶段中观察信息连接与实时指标。旋转视角，探索不同深度的粒子与词条。',
    category: '三维可视化',
    tags: ['3D 点云', '语义网络', '实时监测'],
    url: 'dashboards/prompt-crawler/index.html',
    preview: 'assets/previews/prompt-crawler.webp',
    date: '2026-10-24',
    featured: true,
    highlights: [
      { value: '34,100', label: '空间粒子' },
      { value: '08', label: '扫描阶段' },
      { value: '2.5×', label: '默认速度' }
    ]
  }
];
