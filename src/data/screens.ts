import promptCrawlerPreview from '../assets/previews/prompt-crawler.webp'
import decisionGridPreview from '../assets/previews/decision-grid.webp'
import marketNeuralPreview from '../assets/previews/market-neural.webp'
import vortexDeskPreview from '../assets/previews/vortex-desk.webp'

export interface ScreenDefinition {
  id: string
  title: string
  subtitle: string
  description: string
  category: string
  tags: string[]
  url: string
  preview: string
  date: string
  featured: boolean
  highlights: { value: string; label: string }[]
}

// 每个 id 必须唯一；date 使用 YYYY-MM-DD；featured 最多设置一项。
// 新增大屏时，在这里登记元数据，并在路由中注册对应组件。
export const screens: ScreenDefinition[] = [
  {
    id: 'prompt-crawler',
    title: 'Prompt Crawler',
    subtitle: '三维语义网络 · 智能扫描大屏',
    description: '跟随扫描器穿行于立体数据云，在八个读取阶段中观察信息连接与实时指标。旋转视角，探索不同深度的粒子与词条。',
    category: '三维可视化',
    tags: ['3D 点云', '语义网络', '实时监测'],
    url: '/screens/prompt-crawler',
    preview: promptCrawlerPreview,
    date: '2026-10-24',
    featured: false,
    highlights: [
      { value: '34,100', label: '空间粒子' },
      { value: '08', label: '扫描阶段' },
      { value: '2.5×', label: '默认速度' },
    ],
  },
  {
    id: 'decision-grid',
    title: 'Decision Grid',
    subtitle: '智能决策网络 · 三维信息流大屏',
    description: '穿行于 15 面发光数据墙，追踪从状态、提问到决策与执行的五步路径。12 个业务案例轮流点亮网络，置信度与监测面板实时联动。',
    category: '决策可视化',
    tags: ['3D 数据墙', '决策路径', '动态监测'],
    url: '/screens/decision-grid',
    preview: decisionGridPreview,
    date: '2026-10-24',
    featured: false,
    highlights: [
      { value: '600', label: '空间节点' },
      { value: '15', label: '数据墙' },
      { value: '12', label: '业务案例' },
    ],
  },
  {
    id: 'market-neural',
    title: 'Market Neural',
    subtitle: '金融信号网络 · 三维神经球体大屏',
    description: '观察高密度神经球体在市场信号中旋转、融合与分裂。三角网格、金色触须与蓝色数据流，联动行情、订单簿、成交记录和收益分布。',
    category: '金融可视化',
    tags: ['3D 神经球体', '形态融合', '行情监测'],
    url: '/screens/market-neural',
    preview: marketNeuralPreview,
    date: '2026-10-24',
    featured: false,
    highlights: [
      { value: '03', label: '融合球体' },
      { value: '06', label: '信号通道' },
      { value: '28s', label: '演示周期' },
    ],
  },
  {
    id: 'vortex-desk',
    title: 'Vortex Desk',
    subtitle: '粒子涡旋交易台 · 三维流光大屏',
    description: '穿过高速旋转的彩色粒子涡旋，观察六个操作员的协作、证据矩阵、订单信号与代码执行。螺旋光带、底部喷射和实时数据流共同构成沉浸式交易终端。',
    category: '粒子可视化',
    tags: ['3D 粒子涡旋', '螺旋光带', '实时数据流'],
    url: '/screens/vortex-desk',
    preview: vortexDeskPreview,
    date: '2026-10-24',
    featured: true,
    highlights: [
      { value: '06', label: '协作操作员' },
      { value: '05', label: '处理阶段' },
      { value: '30s', label: '演示周期' },
    ],
  },
]
