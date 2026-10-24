import { createRouter, createWebHashHistory } from 'vue-router';

// Hash history works behind Nginx, object storage and project subpaths without rewrites.
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'catalog', component: () => import('../views/CatalogView.vue'), meta: { title: '数据大屏索引' } },
    { path: '/screens/prompt-crawler', name: 'prompt-crawler', component: () => import('../dashboards/prompt-crawler/PromptCrawler.vue'), meta: { title: 'Prompt Crawler · 三维语义网络' } },
    { path: '/screens/decision-grid', name: 'decision-grid', component: () => import('../dashboards/decision-grid/DecisionGrid.vue'), meta: { title: 'Decision Grid · 智能决策网络' } },
    { path: '/screens/market-neural', name: 'market-neural', component: () => import('../dashboards/market-neural/MarketNeural.vue'), meta: { title: 'Market Neural · 金融信号网络' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '未找到大屏' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach(to => { document.title = `${String(to.meta.title || '数据大屏')} — Data Screen`; });
