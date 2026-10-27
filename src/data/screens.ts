import promptCrawlerPreview from '../assets/previews/prompt-crawler.webp'
import decisionGridPreview from '../assets/previews/decision-grid.webp'
import marketNeuralPreview from '../assets/previews/market-neural.webp'
import vortexDeskPreview from '../assets/previews/vortex-desk.webp'
import signalLoomPreview from '../assets/previews/signal-loom.webp'
import knowledgeEnginePreview from '../assets/previews/knowledge-engine.webp'
import reaLabPreview from '../assets/previews/rea-lab.webp'
import jevEnginePreview from '../assets/previews/jev-engine.webp'

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
    featured: false,
    highlights: [
      { value: '06', label: '协作操作员' },
      { value: '05', label: '处理阶段' },
      { value: '30s', label: '演示周期' },
    ],
  },
  {
    id: 'signal-loom',
    title: 'Signal Loom',
    subtitle: '三维信号织机 · 多路推理数据流',
    description: '青、粉、金三路信号穿过发光丝束，织入立体二进制矩阵。跟随六段镜头巡游，观察十二种场景的推理、门控与执行，联动信号流、置信曲线和动作矩阵。',
    category: '信号可视化',
    tags: ['3D 数字矩阵', '流光丝束', '镜头巡游'],
    url: '/screens/signal-loom',
    preview: signalLoomPreview,
    date: '2026-10-26',
    featured: false,
    highlights: [
      { value: '03', label: '信号通道' },
      { value: '12', label: '业务场景' },
      { value: '06', label: '巡游视角' },
    ],
  },
  {
    id: 'knowledge-engine',
    title: 'Knowledge Engine',
    subtitle: '三维知识图谱 · 文档协作引擎',
    description: '穿行于青蓝、紫色与珊瑚橙交织的立体文档簇，追踪读取、写入、回答与冲突检查。十二个知识页面联动引用矩阵、文档差异和写入队列，金色源节点标出证据与冲突。',
    category: '知识可视化',
    tags: ['3D 知识图谱', '文档协作', '冲突检查'],
    url: '/screens/knowledge-engine',
    preview: knowledgeEnginePreview,
    date: '2026-10-26',
    featured: false,
    highlights: [
      { value: '12', label: '知识页面' },
      { value: '3,206', label: '图谱节点' },
      { value: '24s', label: '演示周期' },
    ],
  },
  {
    id: 'rea-lab',
    title: 'Rea Lab',
    subtitle: '逆向工程实验室 · 双侧编译网络',
    description: '在白色实验终端中穿过暖色反汇编网络与青蓝色反编译网络。双侧弯曲指令带交换高速数据，镜头依次巡游两侧，观察相位同步、代码生成与最终解析结果。',
    category: '工程可视化',
    tags: ['双侧网络', '指令频谱', '相位同步'],
    url: '/screens/rea-lab',
    preview: reaLabPreview,
    date: '2026-10-26',
    featured: false,
    highlights: [
      { value: '64 + 16', label: '协作代理' },
      { value: '05', label: '解析阶段' },
      { value: '1,536', label: '提升指令' },
    ],
  },
  {
    id: 'jev-engine',
    title: 'Jev Engine',
    subtitle: '环形决策路由 · 三维针束网络',
    description: '穿过密集彩色针束组成的立体环形网络，跟随白色扫描波与节点事件观察决策路由。任务火焰图、置信度分布、令牌流量与成本监测同步变化。',
    category: '路由可视化',
    tags: ['3D 环形网络', '针束扫描', '决策路由'],
    url: '/screens/jev-engine',
    preview: jevEnginePreview,
    date: '2026-10-27',
    featured: true,
    highlights: [
      { value: '2,600', label: '空间针束' },
      { value: '48', label: '置信分箱' },
      { value: '03', label: '负载通道' },
    ],
  },
]
