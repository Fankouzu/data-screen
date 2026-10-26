<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { pages, type KnowledgeOverlay, type KnowledgeSnapshot } from './model';
const props = defineProps<{ snapshot: KnowledgeSnapshot }>();
const emit = defineEmits<{ select: [index: number]; reset: [] }>();
const root = ref<HTMLElement>();
const inspector = ref<HTMLElement>();
const inspectorHeight = ref(116);
const overlay = shallowRef<KnowledgeOverlay>({ labels: [], anchor: { x: 0, y: 0, visible: false } });
const size = shallowRef({ width: 720, height: 570 });
let observer: ResizeObserver | undefined;
const page = computed(() => pages[props.snapshot.activePage] ?? pages[7]!);
const selectedConflict = computed(() => props.snapshot.conflicts > 0 && props.snapshot.activePage === 3);
const title = computed(() => props.snapshot.inspectedRecord?.startsWith('raw/') ? props.snapshot.inspectedRecord : !props.snapshot.inspecting && props.snapshot.phase === 'READER' ? 'raw/source-042.pdf' : !props.snapshot.inspecting && props.snapshot.phase === 'ANSWER' ? 'wiki/answer-013.md' : `wiki/${page.value.name}`);
const cardPosition = computed(() => {
  const cardWidth = props.snapshot.inspecting ? (size.value.width < 560 ? 216 : 270) : size.value.width >= 1100 ? 232 : size.value.width < 560 ? 164 : 188;
  const preferredX = overlay.value.anchor.x > size.value.width * .58 ? overlay.value.anchor.x - cardWidth - 20 : overlay.value.anchor.x + (props.snapshot.inspecting ? 32 : 14);
  const mobileDetail = props.snapshot.inspecting && size.value.width < 560;
  const x = mobileDetail ? (size.value.width - cardWidth) / 2 : Math.max(8, Math.min(size.value.width - cardWidth - 8, preferredX));
  const cardHeight = inspectorHeight.value;
  const y = Math.max(26, Math.min(size.value.height - cardHeight - 8, mobileDetail ? overlay.value.anchor.y + 36 : overlay.value.anchor.y - (props.snapshot.inspecting ? 80 : 105)));
  return { transform: `translate3d(${x}px,${y}px,0)`, width: `${cardWidth}px`, maxHeight: `${Math.max(0, size.value.height - 34)}px`, overflowY: 'auto' as const };
});
function update(value: KnowledgeOverlay) { overlay.value = value; }
function select(id: string) { const index = Number(id.replace('page-', '')); if (Number.isInteger(index) && index >= 0 && index < pages.length) emit('select', index); }
defineExpose({ update });
onMounted(() => {
  observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === root.value) size.value = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (entry.target === inspector.value && entry.contentRect.height > 0) inspectorHeight.value = inspector.value.getBoundingClientRect().height;
    }
  });
  if (root.value) observer.observe(root.value);
  if (inspector.value) observer.observe(inspector.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="ke-overlays">
    <template v-for="label in overlay.labels" :key="label.id">
      <button v-if="label.kind === 'page'" v-show="label.visible" type="button" class="ke-node-label ke-page-label" :class="{ active: label.active }" :data-page="label.id" :aria-label="`查看 ${label.text}`" :aria-pressed="label.active" :style="{ transform: `translate3d(${label.x}px,${label.y}px,0) scale(${label.scale})` }" @click="select(label.id)">{{ label.text }}</button>
      <span v-else v-show="label.visible" class="ke-node-label" :class="`ke-${label.kind}-label`" :style="{ transform: `translate3d(${label.x}px,${label.y}px,0) scale(${label.scale})` }" aria-hidden="true">{{ label.text }}</span>
    </template>
    <aside ref="inspector" v-show="overlay.anchor.visible" class="ke-floating-inspector" :class="{ conflict: selectedConflict, expanded: snapshot.inspecting }" :style="cardPosition" aria-label="图谱当前页面详情">
      <strong>{{ title }}</strong><template v-if="snapshot.inspecting && snapshot.inspectedRecord"><small>RECORD</small><span>{{ snapshot.inspectedRecord }}</span></template><small>CLAIM</small>
      <p>{{ snapshot.claim }}</p>
      <small>SOURCE</small><span>{{ snapshot.inspectedRecord?.startsWith('raw/') ? snapshot.inspectedRecord : selectedConflict ? 'raw/source-017.pdf ↔ source-042.pdf' : 'raw/source-042.pdf' }}</span>
      <div><small>LAST CONFIRMED</small><span>2026-10-18</span></div>
      <i></i>
      <button v-if="snapshot.inspecting" type="button" class="ke-back-overview" @click="emit('reset')">↶ 返回全景</button>
    </aside>
  </div>
</template>
