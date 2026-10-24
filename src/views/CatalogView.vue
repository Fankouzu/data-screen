<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ScreenCard from '../components/ScreenCard.vue'
import { screens } from '../data/screens'
import '../styles/catalog.css'

const search = ref('')
const sort = ref('recent')
const category = ref('all')
const searchInput = ref<HTMLInputElement | null>(null)
const collection = ref<HTMLElement | null>(null)
const categories = computed(() => [
  { value: 'all', label: '全部' },
  ...[...new Set(screens.map(screen => screen.category))].map(value => ({ value, label: value })),
])
const matches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return screens.filter(screen => {
    const text = [screen.title, screen.subtitle, screen.description, screen.category, ...screen.tags]
      .join(' ').toLocaleLowerCase()
    return (category.value === 'all' || screen.category === category.value) && (!query || text.includes(query))
  }).sort((a, b) => sort.value === 'name'
    ? a.title.localeCompare(b.title, 'zh-CN')
    : b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'))
})

async function clearSearch() {
  search.value = ''
  category.value = 'all'
  await nextTick()
  searchInput.value?.focus()
}

function scrollToCollection() {
  collection.value?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  collection.value?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="catalog-page">
    <a class="skip-link" href="#collection" @click.prevent="scrollToCollection">跳转到大屏列表</a>
    <div class="site-shell">
      <header class="site-header">
        <RouterLink class="brand" to="/" aria-label="Data Screen 首页">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 6h26v17H3zM10 28h12M16 23v5"/><path class="brand-signal" d="m7 17 5-5 4 5 8-8"/></svg>
          <span>DATA<span class="brand-divider">/</span>SCREEN</span>
        </RouterLink>
        <nav aria-label="主导航">
          <a class="nav-current" href="#collection" @click.prevent="scrollToCollection">作品索引</a>
          <a href="https://github.com/mzlc-linmo/data-screen" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </nav>
      </header>
      <main>
        <section class="intro" aria-labelledby="page-title">
          <div>
            <p class="eyebrow"><span class="status-dot"></span> A GROWING COLLECTION</p>
            <h1 id="page-title">数据大屏<span class="title-outline">作品索引</span></h1>
            <p class="intro-copy">从数据到空间，从信息到现场。<br class="mobile-break">在这里浏览和打开每一块大屏。</p>
          </div>
          <div class="collection-count" aria-label="大屏总数"><strong id="total-count">{{ String(screens.length).padStart(2, '0') }}</strong><span>SCREENS IN COLLECTION</span></div>
        </section>
        <section id="collection" ref="collection" class="collection" aria-labelledby="collection-title" tabindex="-1">
          <div class="collection-heading"><h2 id="collection-title">全部作品 <span id="result-count" aria-live="polite">{{ matches.length }} / {{ screens.length }}</span></h2><span class="collection-caption">EXPLORE THE SCREENS</span></div>
          <div class="toolbar">
            <div id="categories" class="categories" role="group" aria-label="按主题筛选">
              <button v-for="item in categories" :key="item.value" type="button" class="category" :class="{ active: category === item.value }" :data-category="item.value" :aria-pressed="category === item.value" @click="category = item.value">{{ item.label }}</button>
            </div>
            <div class="toolbar-right">
              <label class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg><input id="search" ref="searchInput" v-model="search" type="search" placeholder="搜索名称、主题或标签" autocomplete="off" aria-label="搜索大屏"></label>
              <label class="sort-label"><span class="sr-only">排序方式</span><select id="sort" v-model="sort"><option value="recent">最近添加</option><option value="name">按名称排序</option></select></label>
            </div>
          </div>
          <div id="screen-grid" class="screen-grid"><ScreenCard v-for="screen in matches" :key="screen.id" :screen="screen" /></div>
          <div id="empty-state" class="empty-state" :hidden="matches.length > 0"><span class="empty-symbol" aria-hidden="true">⌕</span><h3>没有匹配的大屏</h3><p>换个关键词，或清除筛选查看全部作品。</p><button id="clear-search" type="button" class="clear-button" @click="clearSearch">清除筛选</button></div>
        </section>
        <div class="collection-end"><span class="end-line"></span><span>持续收录，持续探索</span><span class="end-line"></span></div>
      </main>
      <footer class="site-footer"><span>DATA / SCREEN <span class="footer-muted">— 可交互的数据可视化作品集</span></span><a href="https://github.com/mzlc-linmo/data-screen" target="_blank" rel="noopener noreferrer">查看仓库 <span aria-hidden="true">↗</span></a></footer>
    </div>
  </div>
</template>
