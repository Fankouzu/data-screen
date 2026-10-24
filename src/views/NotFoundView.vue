<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="not-found">
    <p class="code">404</p>
    <h1>这块大屏还不在作品集中</h1>
    <p>返回索引页，查看已经收录的作品。</p>
    <RouterLink to="/">返回大屏索引 ↗</RouterLink>
  </main>
</template>

<style scoped>
.not-found { min-height: 100dvh; display: grid; align-content: center; justify-items: center; padding: 30px; text-align: center; background: #10151b; color: #ecf0ed; }
.code { font: 80px Menlo, monospace; margin: 0; color: #a9e7cd; }
h1 { font-size: clamp(22px, 4vw, 32px); }
p { color: #97a3b0; }
a { margin-top: 20px; padding: 14px 22px; border-radius: 4px; background: #a9e7cd; color: #12271e; text-decoration: none; }
</style>
