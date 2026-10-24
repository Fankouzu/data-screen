<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { ScreenDefinition } from '../data/screens'

defineProps<{ screen: ScreenDefinition }>()
const previewFailed = ref(false)
</script>

<template>
  <article class="screen-card" :class="{ featured: screen.featured }">
    <RouterLink
      :to="screen.url"
      class="preview-link"
      :class="{ 'preview-unavailable': previewFailed }"
      :aria-label="`打开 ${screen.title} 大屏`"
    >
      <img
        v-if="!previewFailed"
        class="preview-image"
        :src="screen.preview"
        :alt="`${screen.title} 大屏预览`"
        width="1600"
        height="1000"
        :loading="screen.featured ? 'eager' : 'lazy'"
        @error="previewFailed = true"
      >
      <span v-else class="preview-fallback">{{ screen.title }} · 打开大屏 ↗</span>
      <span class="preview-badge">{{ screen.category }}</span>
      <span class="preview-expand" aria-hidden="true">↗</span>
    </RouterLink>
    <div class="card-body">
      <div class="card-meta">
        <span class="card-kicker">{{ screen.featured ? 'FEATURED SCREEN' : 'DATA SCREEN' }}</span>
        <time :datetime="screen.date">{{ screen.date.replaceAll('-', '.') }}</time>
      </div>
      <h3 class="card-title"><RouterLink :to="screen.url">{{ screen.title }}</RouterLink></h3>
      <p class="card-subtitle">{{ screen.subtitle }}</p>
      <p class="card-description">{{ screen.description }}</p>
      <ul class="tags"><li v-for="tag in screen.tags" :key="tag">{{ tag }}</li></ul>
      <dl v-if="screen.highlights.length" class="highlights">
        <div v-for="item in screen.highlights" :key="item.label">
          <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
        </div>
      </dl>
      <RouterLink :to="screen.url" class="open-screen" :aria-label="`打开 ${screen.title} 大屏`">
        <span>打开大屏</span><span class="open-arrow" aria-hidden="true">↗</span>
      </RouterLink>
    </div>
  </article>
</template>
