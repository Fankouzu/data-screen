import { createRouter, createWebHashHistory } from 'vue-router';

// Hash history works behind Nginx, object storage and project subpaths without rewrites.
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'catalog', component: () => import('../views/CatalogView.vue'), meta: { title: '数据大屏索引' } },
    { path: '/screens/prompt-crawler', name: 'prompt-crawler', component: () => import('../dashboards/prompt-crawler/PromptCrawler.vue'), meta: { title: 'Prompt Crawler · 三维语义网络' } },
    { path: '/screens/decision-grid', name: 'decision-grid', component: () => import('../dashboards/decision-grid/DecisionGrid.vue'), meta: { title: 'Decision Grid · 智能决策网络' } },
    { path: '/screens/market-neural', name: 'market-neural', component: () => import('../dashboards/market-neural/MarketNeural.vue'), meta: { title: 'Market Neural · 金融信号网络' } },
    { path: '/screens/vortex-desk', name: 'vortex-desk', component: () => import('../dashboards/vortex-desk/VortexDesk.vue'), meta: { title: 'Vortex Desk · 粒子涡旋交易台' } },
    { path: '/screens/signal-loom', name: 'signal-loom', component: () => import('../dashboards/signal-loom/SignalLoom.vue'), meta: { title: 'Signal Loom · 三维信号织机' } },
    { path: '/screens/knowledge-engine', name: 'knowledge-engine', component: () => import('../dashboards/knowledge-engine/KnowledgeEngine.vue'), meta: { title: 'Knowledge Engine · 三维知识图谱' } },
    { path: '/screens/rea-lab', name: 'rea-lab', component: () => import('../dashboards/rea-lab/ReaLab.vue'), meta: { title: 'Rea Lab · 逆向工程实验室' } },
    { path: '/screens/jev-engine', name: 'jev-engine', component: () => import('../dashboards/jev-engine/JevEngine.vue'), meta: { title: 'Jev Engine · 环形决策路由引擎' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '未找到大屏' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach(to => { document.title = `${String(to.meta.title || '数据大屏')} — Data Screen`; });
