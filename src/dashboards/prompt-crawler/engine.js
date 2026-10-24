/** Mount one dashboard instance. Vue owns the route; this module owns its canvas lifecycle. */
export function mountPromptCrawler(root) {
const lifecycle = new AbortController();
let disposed = false, animationFrame = 0;
const shaders = [];
function listen(target, type, handler, options = {}) {
  target.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
}

const $=id=>root.querySelector(`#${id}`),TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const stages=[
{name:'role',count:25,color:'#f1efcf',desc:'who the studio works for',x:855,y:365,rx:157,ry:180,words:['You · owner','studio','release','5.5 · spec','claims · claim','source','approve · approval','the','production','audience']},
{name:'objective',count:23,color:'#48ffc4',desc:'what success looks like',x:515,y:160,rx:144,ry:165,words:['manifest','release','run','the','result','cover','repeat','done','one','produce']},
{name:'context',count:35,color:'#ff009d',desc:'sources · files · approvals',x:390,y:455,rx:190,ry:177,words:['Transcript · claim','over','holds','into','quality · vague','purchases · approval','messages · approval','next','approve · approval','sheet · claim','sources · claim','feedback','examples','BRAND.md','saved','better · vague']},
{name:'roles',count:42,color:'#ffcf23',desc:'all owners · all inputs',x:740,y:805,rx:177,ry:172,words:['1080 · spec','Editor · owner','BRAND.md · file','900 · spec','Writer · owner','Publisher · owner','timestamp · claim','cover','review','credits','deliver']},
{name:'rules',count:25,color:'#43ff69',desc:'verify · ask · stop · report',x:710,y:565,rx:127,ry:139,words:['they','Report','Verify · claim','draft','buying · approval','publishing · approval','ask','Keep','with · claim','old','each','work']},
{name:'review',count:17,color:'#c87cff',desc:'check the work against the brief',x:200,y:725,rx:167,ry:168,words:['match','copy','cover','asset','corrected','the','well · vague','propose','source · claim','feedback','review']},
{name:'start',count:14,color:'#ff7746',desc:'smallest runnable first',x:525,y:440,rx:89,ry:96,words:['release','you','deliver','can','source · claim','Ask · approval','start','first']},
{name:'ship',count:0,color:'#f1efcf',desc:'181 words read · 12 flagged · 0 guessed',x:525,y:450,rx:80,ry:80,words:[]}
];
let seed=821;function rnd(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}
const canvas=$('network');const ctx=canvas.getContext('2d',{alpha:true});let w=0,h=0,dpr=1,scale=1;let elapsed=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,stageIndex=0,lastIndex=-1,frame=0,last=0,uiTime=0,zoom=1,pan={x:0,y:0},drag=null,cam={x:540,y:480},spider={x:650,y:420,z:0},latestLog=-1,playbackRate=2.5,dirty=true,paintedTime=-1,motionStage=-1,motionBeat=-1,burst=0,impact=0,lastPaint=0;
let hopFrom={x:650,y:420,z:0},hopTo={x:650,y:420,z:0};const trail=[];const sectionDom=[],heatDom=[];
let orbit={yaw:0,pitch:0},camera={yaw:0,pitch:0},worldWide=1,worldTall=1;
const depths=[-200,190,70,-160,310,-290,5,0];stages.forEach((s,i)=>{s.baseX=s.x;s.baseY=s.y;s.z=depths[i];s.rz=s.rx*.95});
const gpuCanvas=$('cloud-space'),gl=gpuCanvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,powerPreference:'high-performance'});
const duration=5.5,total=duration*8;const queryStage=Number(new URLSearchParams(location.search).get('stage'));if(new URLSearchParams(location.search).has('stage')&&queryStage>=0&&queryStage<8)elapsed=queryStage*duration+1;
// Static XYZ buffers stay on the GPU; rotation and perspective run per vertex.
const clouds=stages.slice(0,7).map((s,index)=>{
 const points=[],n=index===2?6500:4600;
 for(let i=0;i<n;i++){
  const a=rnd()*TAU,u=rnd()*2-1,r=Math.cbrt(rnd())*(.82+.24*rnd()),v=Math.sqrt(1-u*u);
  let x=Math.cos(a)*v*r*s.rx,y=Math.sin(a)*v*r*s.ry,z=u*r*s.rz;
  x+=Math.sin(y/s.ry*4+z/s.rz*2+index)*s.rx*.12;
  y+=Math.cos(z/s.rz*3+x/s.rx*2)*s.ry*.1;
  points.push({x,y,z,b:rnd()});
 }
 const bins=new Map,cell=30,edges=[];
 points.forEach((p,i)=>{const key=`${Math.floor(p.x/cell)},${Math.floor(p.y/cell)},${Math.floor(p.z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i)});
 points.forEach((p,i)=>{const bx=Math.floor(p.x/cell),by=Math.floor(p.y/cell),bz=Math.floor(p.z/cell);let count=0;
  search:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const j of bins.get(`${bx+dx},${by+dy},${bz+dz}`)||[]){
   if(j<=i)continue;const q=points[j],d=(q.x-p.x)**2+(q.y-p.y)**2+(q.z-p.z)**2;
   if(d<1100&&d>30){edges.push([i,j]);if(++count===3)break search}
  }
 });
 return {points,edges,anchors:points.filter(p=>p.b>.985).slice(0,40)};
});
const vertexSource=`
precision highp float;
attribute vec3 aPosition; attribute vec3 aCenter; attribute vec3 aColor; attribute float aGroup; attribute float aBrightness;
uniform float uTime,uYaw,uPitch,uScale,uDpr,uWide,uTall,uStage;uniform mediump float uMode;
uniform vec2 uViewport,uPan,uTarget;
varying vec3 vColor;varying float vAlpha;
vec3 turn(vec3 p,float y,float x){float c=cos(y),s=sin(y);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(x);s=sin(x);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
void main(){
 vec3 p=turn(aPosition,uTime*.055+aGroup*.31,sin(uTime*.027+aGroup)*.19);
 p+=vec3(aCenter.x*uWide,aCenter.y*uTall,aCenter.z);
 p.xy-=uTarget;
 p=turn(p,uYaw,uPitch);
 float depth=1200.-p.z;float k=1050./max(depth,80.);
 vec2 screen=p.xy*k*uScale+uViewport*.5+uPan+vec2(0.,28.);
 gl_Position=vec4(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.,clamp((depth-250.)/1900.,0.,1.)*2.-1.,1.);
 float active=1.-step(.1,abs(aGroup-uStage));float done=1.-step(uStage,aGroup);
 vColor=mix(vec3(.72,.66,.56),aColor,max(active,done*.75));
 float fog=.25+.75*clamp((1800.-depth)/1000.,.12,1.);
 vAlpha=(.3+aBrightness*.9)*fog*(.9+active*.8);
 if(uMode<.5){vAlpha*=.43;gl_PointSize=1.;}
 else if(uMode>1.5){vAlpha*=.28;gl_PointSize=clamp((11.+aBrightness*8.)*k*uScale*uDpr,2.,28.);}
 else{gl_PointSize=clamp((1.5+aBrightness*aBrightness*2.5)*k*uScale*uDpr,1.5,7.);}
 if(depth<100.){gl_Position=vec4(2.,2.,2.,1.);vAlpha=0.;}
}`;
const fragmentSource=`precision mediump float;uniform mediump float uMode;varying vec3 vColor;varying float vAlpha;
void main(){float a=vAlpha;if(uMode>.5){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;a*=uMode>1.5?pow(1.-r,2.):smoothstep(1.,.15,r);}gl_FragColor=vec4(vColor,a);}`;
let program,uniforms={},buffers={},renderer=gl?'webgl':'canvas-fallback';
function createBuffer(values){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);return {buffer:b,count:values.length/11}}
function initGPU(){
 const compile=(type,source)=>{const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader};
 program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));shaders.forEach(shader=>gl.deleteShader(shader));shaders.length=0;gl.useProgram(program);
 for(const name of ['Time','Yaw','Pitch','Scale','Dpr','Wide','Tall','Stage','Mode','Viewport','Pan','Target'])uniforms[name]=gl.getUniformLocation(program,'u'+name);
 const dots=[],links=[],glows=[];
 clouds.forEach((c,i)=>{const s=stages[i],rgb=s.color.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255),row=p=>[p.x,p.y,p.z,s.baseX-540,s.baseY-480,s.z,...rgb,i,p.b];c.points.forEach(p=>{const v=row(p);dots.push(...v);if(p.b>.985)glows.push(...v)});c.edges.forEach(([a,b])=>links.push(...row(c.points[a]),...row(c.points[b])))});
 buffers={dots:createBuffer(dots),links:createBuffer(links),glows:createBuffer(glows)};
 // Sparse transparent space: a depth buffer keeps bright foreground nodes in front.
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
}
if(gl)initGPU();
function updateCamera(){camera.yaw=orbit.yaw+Math.sin(elapsed*.035)*.42;camera.pitch=orbit.pitch-.14+Math.sin(elapsed*.021)*.12}
function rotate3(p,y,x){const cy=Math.cos(y),sy=Math.sin(y),cx=Math.cos(x),sx=Math.sin(x),xx=p.x*cy+p.z*sy,zz=-p.x*sy+p.z*cy;return {x:xx,y:p.y*cx-zz*sx,z:p.y*sx+zz*cx}}
function localWorld(p,i){const s=stages[i],v=rotate3(p,elapsed*.055+i*.31,Math.sin(elapsed*.027+i)*.19);return {x:s.x+v.x,y:s.y+v.y,z:s.z+v.z}}
function project(p){const v=rotate3({x:p.x-cam.x,y:p.y-cam.y,z:p.z||0},camera.yaw,camera.pitch),depth=1200-v.z,k=1050/Math.max(depth,80)*scale*zoom;return {x:w/2+pan.x+v.x*k,y:h/2+pan.y+28+v.y*k,k,depth}}
function drawGPU(){
 if(!gl)return;gl.viewport(0,0,gpuCanvas.width,gpuCanvas.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
 for(const [key,v] of Object.entries({Time:elapsed,Yaw:camera.yaw,Pitch:camera.pitch,Scale:scale*zoom,Dpr:dpr,Wide:worldWide,Tall:worldTall,Stage:stageIndex}))gl.uniform1f(uniforms[key],v);
 gl.uniform2f(uniforms.Viewport,w,h);gl.uniform2f(uniforms.Pan,pan.x,pan.y);gl.uniform2f(uniforms.Target,cam.x-540,cam.y-480);
 const draw=(batch,mode,primitive)=>{gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);let offset=0;for(const [name,size] of [['Position',3],['Center',3],['Color',3],['Group',1],['Brightness',1]]){const location=gl.getAttribLocation(program,'a'+name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,44,offset*4);offset+=size}gl.uniform1f(uniforms.Mode,mode);gl.drawArrays(primitive,0,batch.count)};
 gl.depthMask(false);draw(buffers.links,0,gl.LINES);draw(buffers.glows,2,gl.POINTS);gl.depthMask(true);draw(buffers.dots,1,gl.POINTS);
}
const tabs=root.querySelector('.tabs');stages.forEach((s,i)=>{const b=document.createElement('button');b.className='tab';b.textContent=s.name;b.title=`切换到 ${s.name} 阶段`;b.addEventListener('click',()=>{elapsed=i*duration+.05;latestLog=-1;motionBeat=-1;dirty=true;updateUI();});tabs.append(b)});
$('sections').innerHTML=stages.slice(0,7).map((s,i)=>`<div class="section-row"><div class="section-label" id="label-${i}"><span>${s.name}</span><span id="count-${i}">0/${s.count}</span></div><div class="track"><div class="fill" id="fill-${i}" style="--c:${s.color}"></div></div></div>`).join('');
$('heat').innerHTML=stages.slice(0,7).map(s=>`<div class="heat-row" style="--c:${s.color}"><span>${s.name.slice(0,3).toUpperCase()}</span>${'<i class="cell"></i>'.repeat(12)}</div>`).join('');
stages.slice(0,7).forEach((s,i)=>{sectionDom.push({count:$(`count-${i}`),fill:$(`fill-${i}`),label:$(`label-${i}`)});heatDom.push([...root.querySelectorAll('.heat-row')[i].querySelectorAll('.cell')])});
function polygon(values,r=59){return values.map((v,i)=>{const a=-Math.PI/2+i*TAU/7;return `${90+Math.cos(a)*r*v},${82+Math.sin(a)*r*v}`}).join(' ')}
for(let i=1;i<=4;i++)$('radar-grid').innerHTML+=`<polygon points="${polygon(Array(7).fill(i/4))}"/>`;
stages.slice(0,7).forEach((s,i)=>{const a=-Math.PI/2+i*TAU/7;const x=90+Math.cos(a)*77,y=85+Math.sin(a)*74;$('radar-grid').innerHTML+=`<path d="M90 82 L${90+Math.cos(a)*59} ${82+Math.sin(a)*59}"/>`;$('radar-labels').innerHTML+=`<text x="${x}" y="${y}">${['ROLE','OBJ','CTX','TEAM','RULES','REV','START'][i]}</text>`});
function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(2400000/Math.max(1,w*h)));canvas.width=gpuCanvas.width=Math.round(w*dpr);canvas.height=gpuCanvas.height=Math.round(h*dpr);scale=Math.min(w/1080,h/1080);const wide=w/h>1.25;if(wide)scale=Math.min(w/1600,h/850);scale=Math.max(.25,scale);worldWide=wide?1.75:1;worldTall=wide?.78:1;stages.forEach(s=>{s.x=540+(s.baseX-540)*(wide?1.75:1);s.y=480+(s.baseY-480)*(wide?.78:1)});dirty=true;motionBeat=-1}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
function progress(i){return clamp((elapsed-i*duration)/duration,0,1)}
function updateUI(){stageIndex=Math.min(7,Math.floor(elapsed/duration));const s=stages[stageIndex];if(lastIndex!==stageIndex){root.style.setProperty('--accent',s.color);$('chapter-title').textContent=`0${stageIndex+1} ${s.name.toUpperCase()}`;$('chapter-desc').textContent=s.desc;[...tabs.children].forEach((b,i)=>{b.classList.toggle('active',i===stageIndex);b.classList.toggle('done',i<stageIndex);b.setAttribute('aria-current',i===stageIndex?'step':'false')});lastIndex=stageIndex;}
let read=0;const ps=stages.slice(0,7).map((s,i)=>{const p=progress(i),n=Math.floor(s.count*p);read+=n;sectionDom[i].count.textContent=`${n}/${s.count}`;sectionDom[i].fill.style.width=p*100+'%';sectionDom[i].label.classList.toggle('selected',i===stageIndex);heatDom[i].forEach((c,j)=>c.classList.toggle('lit',j<Math.ceil(p*12)));return p});
const links=Math.floor(read/181*45),flags=Math.floor(read/181*12),score=Math.floor(read/181*82),speed=paused||stageIndex===7?0:Math.floor((14+8*Math.sin(elapsed*3)**2)*playbackRate);$('words').textContent=read+'/181';$('read').textContent=read;$('links').textContent=$('linked').textContent=links;$('flags').textContent=$('flagged').textContent=$('ask').textContent=flags;$('elapsed').textContent=elapsed.toFixed(2);$('frame').textContent=String(frame).padStart(4,'0');$('log-speed').textContent=speed+' w/s';$('speed').textContent=(speed*60)+'/m';$('score').textContent=score;$('gauge-fill').setAttribute('stroke-dasharray',`${score} 100`);$('gauge-fill').setAttribute('stroke',score>65?'#40ff99':score>40?'#ffe73e':'#ff009d');$('radar-fill').setAttribute('points',polygon(ps.map(p=>.05+p*.95)));for(const [id,v] of [['claim',16],['owner',10],['approval',11]]){$(id+'-bar').style.width=(read/181*90)+'%';$(id==='claim'?'claims':id==='owner'?'owners':'approvals').textContent=Math.floor(read/181*v)}
const path=Array.from({length:45},(_,i)=>`${i===0?'M':'L'}${i*170/44},${22+Math.sin(i*.2+elapsed*.8)*8*Math.sin(i*.09+1)}`).join(' ');$('wave').setAttribute('d',path);$('wave-shadow').setAttribute('d',path);
const tick=Math.floor(elapsed*5);if(tick!==latestLog){latestLog=tick;const entries=[];for(let n=0;n<18;n++){const t=Math.max(0,elapsed-n*.2),si=Math.min(6,Math.floor(t/duration)),ss=stages[si],word=ss.words[(Math.floor(t*5)+n*3)%ss.words.length].split(' · ')[0],act=n%7===0?'flag':n%5===0?'link':n%9===0?'walk':'read';entries.push(`<div class="log-row"><span class="log-time">00:${String(Math.floor(t)).padStart(2,'0')}</span><span class="log-action" style="color:${act==='flag'?'#ff009d':act==='link'?'#ffe73e':act==='walk'?'#40ff99':'#baad98'}">${act}</span><span class="log-word" style="color:${ss.color}">${word}</span></div>`)}$('log').innerHTML=entries.join('')}
}
function line(x1,y1,x2,y2,color,alpha=.5,width=1){ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function drawClouds(){
 const labels=[];
 stages.slice(0,7).forEach((s,i)=>{
  const p=progress(i),active=i===stageIndex,head=project({x:s.x-s.rx*.25,y:s.y-s.ry-32,z:s.z});
  head.x=clamp(head.x,12,w-130);head.y=clamp(head.y,22,h-28);labels.push({head,s,p,active});
  if(!gl){const c=clouds[i];for(let j=0;j<c.points.length;j+=4){const v=project(localWorld(c.points[j],i));if(v.depth<100)continue;ctx.globalAlpha=clamp((1800-v.depth)/1800,.08,.6);ctx.fillStyle=active?s.color:'#b4a78f';ctx.fillRect(v.x,v.y,Math.max(.6,v.k*1.6),Math.max(.6,v.k*1.6))}}
 });
 labels.sort((a,b)=>b.head.depth-a.head.depth);
 labels.forEach(({head,s,p,active})=>{if(head.depth<100)return;const i=stages.indexOf(s),fog=clamp((1900-head.depth)/900,.18,1);
  ctx.globalAlpha=fog;ctx.fillStyle=active?s.color:p>0?s.color:'#d1c6ae';ctx.font=`bold ${clamp((active?19:15)*head.k,8,24)}px Menlo,monospace`;ctx.fillText(s.name,head.x,head.y);
  ctx.font=`${clamp(9*head.k,6,12)}px Menlo,monospace`;ctx.fillStyle='#a39780';ctx.fillText(`${Math.floor(s.count*p)}/${s.count} words · ${active?'reading':p>=1?'done':'queued'}`,head.x,head.y+12*head.k);
  if(p<=.01)return;
  const entries=s.words.map((word,j)=>({word,j,q:project(localWorld(clouds[i].anchors[(j*3)%clouds[i].anchors.length],i))})).sort((a,b)=>b.q.depth-a.q.depth);
  for(const {word,j,q} of entries){if(j/s.words.length>p+.04||!active&&j%3===0||q.depth<100)continue;
   const hot=word.includes('vague'),size=clamp(q.k, .55,1.5);ctx.font=`${10*size}px Menlo,monospace`;const ww=ctx.measureText(word).width+8*size;
   ctx.globalAlpha=(active?.94:.55)*clamp((1900-q.depth)/900,.2,1);ctx.fillStyle=hot?'#ff009d':'#17130bd9';ctx.fillRect(q.x-3*size,q.y-11*size,ww,15*size);ctx.strokeStyle=hot?'#ff64c3':s.color;ctx.lineWidth=.7;ctx.strokeRect(q.x-3*size,q.y-11*size,ww,15*size);ctx.fillStyle=hot?'#351126':s.color;ctx.fillText(word,q.x+size,q.y);
  }
 });
}
function drawOrientation(){
 const origin={x:37,y:h-39},axes=[['X',{x:27,y:0,z:0},'#ff7746'],['Y',{x:0,y:-27,z:0},'#40ff99'],['Z',{x:0,y:0,z:27},'#65caff']];
 ctx.font='9px Menlo,monospace';axes.forEach(([name,v,color])=>{const r=rotate3(v,camera.yaw,camera.pitch);line(origin.x,origin.y,origin.x+r.x,origin.y+r.y,color,.7,1);ctx.globalAlpha=.8;ctx.fillStyle=color;ctx.fillText(name,origin.x+r.x+3,origin.y+r.y-3)});
}
// Every beat holds its landing, then makes a fast, time-based leap.
function updateMotion(dt){
 const s=stages[stageIndex],local=elapsed-stageIndex*duration,beat=Math.floor(local/.8),phase=(local%.8)/.8;
 const changed=motionStage!==stageIndex;
 if(changed||motionBeat!==beat){
  hopFrom={...spider};
  const a=beat*2.39996+stageIndex*1.7;
  hopTo={x:s.x+Math.cos(a)*s.rx*(.25+(beat%3)*.16),y:s.y+Math.sin(a)*s.ry*.52,z:s.z+Math.sin(a*1.3)*s.rz*.65};
  motionStage=stageIndex;motionBeat=beat;
 }
 const u=clamp((phase-.42)/.33,0,1),ease=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
 const settle=phase>.75?Math.sin((phase-.75)*38)*Math.exp(-(phase-.75)*22)*.035:0;
 spider.x=lerp(hopFrom.x,hopTo.x,ease+settle);spider.y=lerp(hopFrom.y,hopTo.y,ease+settle);spider.z=lerp(hopFrom.z,hopTo.z,ease+settle);
 burst=Math.sin(Math.PI*u);impact=phase>.75?Math.exp(-(phase-.75)*15):0;
 if(!paused){trail.push({x:spider.x,y:spider.y,z:spider.z,t:elapsed});while(trail.length>20||trail.length&&elapsed-trail[0].t>.65)trail.shift()}
 const follow=1-Math.exp(-dt*7),cx=lerp(540,s.x,.38)+(spider.x-s.x)*.1,cy=lerp(480,s.y,.36)+(spider.y-s.y)*.1;
 cam.x=lerp(cam.x,cx,follow);cam.y=lerp(cam.y,cy,follow);
}
function drawMotion(t){
 const s=stages[stageIndex],head=project(spider);
 for(let j=1;j<trail.length;j++){const a=project(trail[j-1]),b=project(trail[j]),fade=clamp(1-(elapsed-trail[j].t)/.65,0,1);line(a.x,a.y,b.x,b.y,'#40ff99',fade*.22,9*fade*b.k);line(a.x,a.y,b.x,b.y,'#baffdb',fade*.65,1.5*fade*b.k)}
 if(impact>.04){ctx.globalAlpha=impact*.7;ctx.strokeStyle=s.color;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(head.x,head.y,(44+(1-impact)*63)*head.k,(34+(1-impact)*48)*head.k,0,0,TAU);ctx.stroke()}
 for(let j=0;j<28;j++){const a=j*2.39996+stageIndex,cycle=(t*1.5+j*.071)%1,r=(1-cycle)*(125+j%5*19)+34,len=5+burst*18;
  const p=project({x:spider.x+Math.cos(a)*r,y:spider.y+Math.sin(a)*r,z:spider.z+Math.sin(a*2)*r});
  const q=project({x:spider.x+Math.cos(a)*(r+len),y:spider.y+Math.sin(a)*(r+len),z:spider.z+Math.sin(a*2)*(r+len)});
  line(p.x,p.y,q.x,q.y,j%4===0?'#fff7b9':s.color,(.14+burst*.6)*cycle,Math.max(.5,p.k*(1+j%3*.4)));
 }
}
function drawSpider(t){const s=stages[stageIndex],projected=project(spider),x=projected.x,y=projected.y;
ctx.save();ctx.translate(x,y);ctx.scale(projected.k,projected.k);ctx.rotate(Math.sin(Math.floor(t/.8)*1.7)*.35-.4+burst*.15);ctx.scale(1+burst*.16,1-burst*.14);ctx.globalCompositeOperation='lighter';const aura=ctx.createRadialGradient(0,0,8,0,0,105);aura.addColorStop(0,'#00ff7c22');aura.addColorStop(.5,'#00ff7c0b');aura.addColorStop(1,'#00ff7c00');ctx.globalAlpha=1;ctx.fillStyle=aura;ctx.fillRect(-110,-110,220,220);
for(let j=0;j<22;j++){const a=j/22*TAU;const phase=t*8+j*.9;const len=(75+24*Math.sin(j*3.3)+17*Math.sin(phase))*(1-burst*.36+impact*.18);const bx=Math.cos(a)*32,by=Math.sin(a)*39;const ex=Math.cos(a+.10*Math.sin(phase))*len,ey=Math.sin(a+.10*Math.sin(phase))*len;ctx.strokeStyle=j%5===0?'#b6ffc1':'#40ff99';ctx.globalAlpha=.85;ctx.lineWidth=j%3===0?1.3:.8;ctx.beginPath();ctx.moveTo(bx,by);ctx.bezierCurveTo(bx*1.7,by*1.45,ex*.82+10*Math.sin(phase),ey*.8,ex,ey);ctx.stroke();for(let q=1;q<=7;q++){const k=q/7;ctx.globalAlpha=.3+k*.5;ctx.fillStyle='#d8ffd0';ctx.fillRect(lerp(bx,ex,k)-.9,lerp(by,ey,k)-.9,1.6,1.6)}ctx.fillStyle='#f7ffd8';ctx.globalAlpha=.95;ctx.beginPath();ctx.arc(ex,ey,1.6,0,TAU);ctx.fill();}
ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.95;ctx.fillStyle='#063d29';ctx.strokeStyle='#43ff99';ctx.lineWidth=1.7;ctx.beginPath();ctx.ellipse(0,0,31,42,0,0,TAU);ctx.fill();ctx.stroke();ctx.save();ctx.beginPath();ctx.ellipse(0,0,29,40,0,0,TAU);ctx.clip();ctx.globalAlpha=.32;for(let n=-40;n<=40;n+=7){line(n,-45,n,45,'#45ffac',.3,.6);line(-40,n,40,n,'#45ffac',.3,.6)}ctx.restore();ctx.strokeStyle='#5effa8';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,42,9,0,TAU);ctx.stroke();ctx.beginPath();ctx.ellipse(0,-45,8,13,0,0,TAU);ctx.stroke();ctx.shadowColor='#ff009d';ctx.shadowBlur=12;ctx.fillStyle='#ff3dae';ctx.globalAlpha=1;ctx.fillRect(-8,-8,16,16);ctx.shadowBlur=0;ctx.restore();
// Moving reading filaments connect the crawler to the active semantic cluster.
if(stageIndex<7){const points=clouds[stageIndex].anchors;for(let j=0;j<5;j++){const pt=points[(Math.floor(t*2.5)+j*5)%points.length],endpoint=project(localWorld(pt,stageIndex)),ex=endpoint.x,ey=endpoint.y;ctx.strokeStyle=j%2?s.color:'#f8efb4';ctx.globalAlpha=.5;ctx.lineWidth=j===0?1.7:.7;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo((x+ex)/2+Math.sin(t+j)*35,(y+ey)/2-35,ex,ey);ctx.stroke();const p=(t*2.2+j*.19)%1,q=1-p,cx=(x+ex)/2+Math.sin(t+j)*35,cy=(y+ey)/2-35;ctx.fillStyle='#ffffd5';ctx.globalAlpha=.9;ctx.fillRect(q*q*x+2*q*p*cx+p*p*ex-1,q*q*y+2*q*p*cy+p*p*ey-1,2.5,2.5)}}
}
function render(now){
 if (disposed) return;
 animationFrame = requestAnimationFrame(render);
 const dt=clamp((now-last)/1000||0,0,.1);last=now;
 if(document.hidden)return;
 if(!paused){elapsed+=dt*playbackRate;if(elapsed>=total+2){elapsed=0;latestLog=-1;motionStage=-1;trail.length=0}frame++}
 // Paused scenes need no GPU work until a view or stage control changes.
 if(paused&&!dirty&&paintedTime===elapsed)return;
 if(now-lastPaint<14&&!dirty)return;const paintDt=Math.min((now-lastPaint)/1000||.016,.1);lastPaint=now;
 stageIndex=Math.min(7,Math.floor(elapsed/duration));
 if(!paused||dirty&&paintedTime!==elapsed)updateMotion(paintDt);
 updateCamera();drawGPU();
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,w,h);
 drawClouds(elapsed);drawMotion(elapsed);drawSpider(elapsed);drawOrientation();ctx.globalAlpha=1;
 if(now-uiTime>110||dirty){updateUI();uiTime=now}paintedTime=elapsed;dirty=false;
}
function setPlay(){dirty=true;last=performance.now();const b=$('play');b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-label',paused?'播放动画':'暂停动画');b.setAttribute('aria-pressed',String(paused));b.title=paused?'播放（空格）':'暂停（空格）';updateUI()}
$('rate').onclick=()=>{const rates=[1,1.5,2.5,4];playbackRate=rates[(rates.indexOf(playbackRate)+1)%rates.length];$('rate').textContent=playbackRate+'×';$('rate').setAttribute('aria-label',`播放速度 ${playbackRate} 倍，点击切换`);dirty=true;updateUI()};
$('play').onclick=()=>{paused=!paused;setPlay()};$('replay').onclick=()=>{elapsed=0;paused=false;latestLog=-1;motionStage=-1;motionBeat=-1;trail.length=0;pan={x:0,y:0};orbit={yaw:0,pitch:0};zoom=1;setPlay()};$('reset').onclick=()=>{zoom=1;pan={x:0,y:0};orbit={yaw:0,pitch:0};dirty=true;toast('视角已重置')};let toastTimer;function toast(msg){if(disposed)return;const el=root.querySelector('.toast');el.textContent=msg;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2000)}
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen()}catch{toast('当前预览不支持全屏，请在浏览器中打开')}};
listen(canvas,'pointerdown',e=>{drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,yaw:orbit.yaw,pitch:orbit.pitch,pan:e.shiftKey};canvas.setPointerCapture(e.pointerId)});listen(canvas,'pointermove',e=>{if(drag){if(drag.pan)pan={x:drag.px+e.clientX-drag.x,y:drag.py+e.clientY-drag.y};else orbit={yaw:drag.yaw+(e.clientX-drag.x)*.005,pitch:clamp(drag.pitch+(e.clientY-drag.y)*.004,-1.1,1.1)};dirty=true}});listen(canvas,'pointerup',()=>drag=null);listen(canvas,'pointercancel',()=>drag=null);listen(canvas,'wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.45,2.8);dirty=true},{passive:false});listen(canvas,'dblclick',()=>{zoom=1;pan={x:0,y:0};dirty=true});
listen(document,'keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();paused=!paused;setPlay()}if(e.key==='ArrowRight'){elapsed=Math.min(7,stageIndex+1)*duration+.05;dirty=true;motionBeat=-1;updateUI()}if(e.key==='ArrowLeft'){elapsed=Math.max(0,stageIndex-1)*duration+.05;dirty=true;motionBeat=-1;updateUI()}});
listen(document,'visibilitychange',()=>{last=performance.now();dirty=true});setPlay();resize();animationFrame = requestAnimationFrame(render);
// Read-only diagnostics for demo validation.
const getState=()=>({stage:stages[stageIndex].name,paused,elapsed,playbackRate,spider:{...spider},burst,impact,renderDpr:dpr,renderer,camera:{...camera},clusters:stages.slice(0,7).map(s=>({name:s.name,x:s.x,y:s.y,z:s.z})),particleDepthRange:{min:Math.min(...clouds.flatMap((c,i)=>c.points.map(p=>p.z+stages[i].z))),max:Math.max(...clouds.flatMap((c,i)=>c.points.map(p=>p.z+stages[i].z)))},zoom,pan:{...pan},particles:clouds.reduce((n,c)=>n+c.points.length,0)});
const getProjection=()=>({probes:[{x:650,y:440,z:-260},{x:650,y:440,z:260},{x:540,y:480,z:0}].map(world=>({world,screen:project(world)}))});

window.demoState = getState;
window.demo3D = getProjection;
return () => {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(animationFrame);
  clearTimeout(toastTimer);
  lifecycle.abort();
  resizeObserver.disconnect();
  root.querySelectorAll('button').forEach(button => { button.onclick = null; });
  if (gl) {
    Object.values(buffers).forEach(batch => gl.deleteBuffer(batch.buffer));
    shaders.forEach(shader => gl.deleteShader(shader));
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  if (window.demoState === getState) delete window.demoState;
  if (window.demo3D === getProjection) delete window.demo3D;
};
}
