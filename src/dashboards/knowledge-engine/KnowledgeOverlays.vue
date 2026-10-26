<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { pages, type KnowledgeOverlay, type KnowledgeSnapshot } from './model';
const props = defineProps<{ snapshot: KnowledgeSnapshot }>();
const emit = defineEmits<{ select: [index: number] }>();
const root = ref<HTMLElement>();
const overlay = shallowRef<KnowledgeOverlay>({ labels: [], anchor: { x: 0, y: 0, visible: false } });
const size = shallowRef({ width: 720, height: 570 });
let observer: ResizeObserver | undefined;
const page = computed(() => pages[props.snapshot.activePage] ?? pages[7]!);
const selectedConflict = computed(() => props.snapshot.conflicts > 0 && props.snapshot.activePage === 3);
const title = computed(() => !props.snapshot.inspecting && props.snapshot.phase === 'READER' ? 'raw/source-042.pdf' : !props.snapshot.inspecting && props.snapshot.phase === 'ANSWER' ? 'wiki/answer-013.md' : `wiki/${page.value.name}`);
const cardPosition = computed(() => {
  const cardWidth = size.value.width >= 1100 ? 232 : size.value.width < 560 ? 164 : 188;
  const preferredX = overlay.value.anchor.x > size.value.width * .58 ? overlay.value.anchor.x - cardWidth - 20 : overlay.value.anchor.x + 14;
  const x = Math.max(8, Math.min(size.value.width - cardWidth - 8, preferredX));
  const y = Math.max(26, Math.min(size.value.height - 116, overlay.value.anchor.y - 105));
  return { transform: `translate3d(${x}px,${y}px,0)`, width: `${cardWidth}px` };
});
function update(value: KnowledgeOverlay) { overlay.value = value; }
function select(id: string) { const index = Number(id.replace('page-', '')); if (Number.isInteger(index) && index >= 0 && index < pages.length) emit('select', index); }
defineExpose({ update });
onMounted(() => {
  observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) size.value = { width: rect.width, height: rect.height }; });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="ke-overlays">
    <template v-for="label in overlay.labels" :key="label.id">
      <button v-if="label.kind === 'page'" v-show="label.visible" type="button" class="ke-node-label ke-page-label" :class="{ active: label.active }" :data-page="label.id" :aria-label="`查看 ${label.text}`" :aria-pressed="label.active" :style="{ transform: `translate3d(${label.x}px,${label.y}px,0) scale(${label.scale})` }" @click="select(label.id)">{{ label.text }}</button>
      <span v-else v-show="label.visible" class="ke-node-label" :class="`ke-${label.kind}-label`" :style="{ transform: `translate3d(${label.x}px,${label.y}px,0) scale(${label.scale})` }" aria-hidden="true">{{ label.text }}</span>
    </template>
    <aside v-show="overlay.anchor.visible" class="ke-floating-inspector" :class="{ conflict: selectedConflict }" :style="cardPosition" aria-label="图谱当前页面详情">
      <strong>{{ title }}</strong><small>CLAIM</small>
      <p>{{ snapshot.claim }}</p>
      <small>SOURCE</small><span>{{ selectedConflict ? 'raw/source-017.pdf ↔ source-042.pdf' : 'raw/source-042.pdf' }}</span>
      <div><small>LAST CONFIRMED</small><span>2026-10-18</span></div>
      <i></i>
    </aside>
  </div>
</template>
