<script setup lang="ts">
import { shallowRef } from 'vue';
import type { SignalOverlay } from './model';

const items = shallowRef<SignalOverlay[]>([]);
const colors = ['#65ebed', '#e850af', '#e9d464'];

// The engine owns time and projection; only this small layer updates every frame.
function update(next: SignalOverlay[]) { items.value = next; }
defineExpose({ update });
</script>

<template>
  <div class="sl-overlays" aria-hidden="true">
    <div
      v-for="item in items"
      :key="item.id"
      class="sl-label sl-overlay"
      :class="`sl-overlay-${item.kind}`"
      :data-overlay-id="item.id"
      :data-kind="item.kind"
      :data-head="item.head"
      :style="{
        '--sl-card': colors[item.head],
        transform: `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%) scale(${item.scale})`,
        opacity: item.opacity,
      }"
    >
      <b>{{ item.title }}</b>
      <small>{{ item.detail }}</small>
    </div>
  </div>
</template>
