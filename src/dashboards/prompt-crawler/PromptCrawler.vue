<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountPromptCrawler } from './engine.js';
import './style.css';

const root = ref<HTMLElement>();
let dispose: (() => void) | undefined;
onMounted(() => { if (root.value) dispose = mountPromptCrawler(root.value); });
onBeforeUnmount(() => { dispose?.(); });
</script>

<template>
<main ref="root" class="prompt-crawler dashboard">
<header class="topbar"><div class="brand"><span>SWARM</span> prompt-crawler</div><span class="metric optional">LEGS<b>16</b></span><span class="metric optional">TENTACLES<b class="green">22</b></span><span class="metric">WORDS READ<b id="words">0/181</b></span><span class="metric">LINKS<b class="gold" id="links">0</b></span><span class="metric">FLAGS<b class="pink" id="flags">0</b></span><span class="metric optional">T<b id="elapsed">0.00</b></span><span class="metric optional">FRAME<b id="frame">0000</b></span><span class="brand-file">studio.prompt</span></header>
<nav class="tabs" aria-label="读取阶段"></nav>
<section class="scene" aria-label="语义网络动态可视化"><canvas id="cloud-space" aria-hidden="true"></canvas><canvas id="network" aria-label="三维粒子语义网络，拖动旋转，Shift 拖动平移，滚轮缩放"></canvas><div class="chapter"><h1 id="chapter-title">01 ROLE</h1><p id="chapter-desc">who the studio works for</p></div><div class="controls"><RouterLink class="control" to="/" aria-label="返回大屏索引" title="返回大屏索引" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">←</RouterLink><button class="control" id="play" aria-label="暂停动画" aria-pressed="false" title="暂停 / 播放（空格）">Ⅱ</button><button class="control" id="rate" aria-label="播放速度 2.5 倍，点击切换" title="切换播放速度">2.5×</button><button class="control" id="replay" aria-label="重播" title="重新播放">↺</button><button class="control" id="reset" aria-label="重置视角" title="重置视角">⌖</button><button class="control" id="fullscreen" aria-label="全屏" title="全屏">⛶</button></div><div class="scene-note">XYZ SPACE · DRAG TO ORBIT · SHIFT + DRAG TO PAN · SCROLL TO ZOOM</div><div class="toast" role="status"></div></section>
<section class="telemetry" aria-label="实时监测数据">
<article class="panel"><div class="panel-title">CRAWL LOG <span class="live" id="log-speed">18 w/s</span></div><div class="log" id="log"></div></article>
<article class="panel"><div class="panel-title">SECTIONS <span class="live">7</span></div><div class="section-list" id="sections"></div><div class="panel-foot">words → kinds → links</div></article>
<article class="panel"><div class="panel-title">COVERAGE RADAR <span class="live">live</span></div><div class="radar-wrap"><svg viewBox="0 0 180 165" aria-label="覆盖率雷达图"><g id="radar-grid" fill="none" stroke="#554335" stroke-width=".6"></g><polygon id="radar-fill" fill="#13ff7759" stroke="#40ff99" stroke-width="2"/><g id="radar-labels" fill="#a79a82" font-size="8" text-anchor="middle"></g></svg></div><div class="mini-row"><span>claims</span><div class="bar" id="claim-bar"></div><b id="claims">0</b></div><div class="mini-row"><span>owners</span><div class="bar" id="owner-bar"></div><b id="owners">0</b></div><div class="mini-row"><span>approvals</span><div class="bar" id="approval-bar"></div><b id="approvals">0</b></div></article>
<article class="panel"><div class="panel-title">WORD HEAT <span class="live">181</span></div><div class="heat" id="heat"></div><div class="speed">words per second<strong id="speed">18/m</strong></div><div class="stat-row"><span>read</span><b id="read">0</b></div><div class="stat-row"><span>linked</span><b style="color:#ffbf45" id="linked">0</b></div><div class="stat-row"><span>flagged</span><b class="pink" id="flagged">0</b></div><div class="stat-row"><span>guessed</span><b class="live">0</b></div></article>
<article class="panel"><div class="panel-title">SPEC SCORE <span class="live">live</span></div><svg class="score-line" viewBox="0 0 170 50" preserveAspectRatio="none"><path id="wave-shadow" fill="none" stroke="#ff009d" stroke-opacity=".12" stroke-width="7"/><path id="wave" fill="none" stroke="#edd18c" stroke-width="1.5"/></svg><svg class="gauge" viewBox="0 0 170 115" aria-label="规格质量分数"><path d="M 41 96 A 57 57 0 1 1 129 96" fill="none" stroke="#3a2b23" stroke-width="9"/><path id="gauge-fill" d="M 41 96 A 57 57 0 1 1 129 96" fill="none" stroke="#ff009d" stroke-width="9" pathLength="100" stroke-dasharray="0 100"/><text id="score" x="85" y="76" fill="#f1efcf" text-anchor="middle" font-size="29" font-weight="bold">0</text><text x="85" y="91" fill="#9a8878" text-anchor="middle" font-size="8">spec score</text></svg><div class="flag-note">flags to ask · <span id="ask">0</span></div><div class="panel-foot">ask, don't guess</div></article>
<article class="panel"><div class="panel-title">CRAWLER.PY <span class="pink">15 L/s</span></div><pre class="code"><span class="comment"># crawler.py · reads a prompt</span>
graph = <span class="str">load('studio.prompt')</span>
spider = <span class="str">Crawler(legs=16, t=22)</span>

<span class="kw">for</span> section <span class="kw">in</span> graph.sections:
    spider.walk_to(section)
    <span class="kw">for</span> word <span class="kw">in</span> spider.read():
        kind = <span class="str">classify(word)</span>
        <span class="kw">if</span> kind == <span class="str">'vague'</span>:
            flags.append(word)
        <span class="kw">else</span>:
            <span class="str">graph.link(word)</span>
        <span class="cursor"></span></pre></article>
</section></main>
</template>
