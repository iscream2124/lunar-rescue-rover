import * as THREE from './vendor/three/three.module.js';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'luna12-science-save-v2';
const SAVE_VERSION = 2;
const AUDIO_MUTE_KEY = 'luna12-audio-muted';
const WORLD = 210;
const DRIVE = Object.freeze({ normalMax: 24, boostMax: 30, reverseMax: 10, acceleration: 14, boostAcceleration: 18, reverseAcceleration: 10, brakeStrength: .48 });
const missions = [
  {
    title: '충돌 분화구 발견', phenomenon: '충돌 지형학',
    briefing: '고속으로 날아온 천체가 달 표면에 충돌하면 물질이 파여 둥근 함몰부와 솟은 테두리가 생깁니다. 밖으로 튀어나간 암석과 먼지는 분출물로 주변에 쌓여 충돌의 흔적을 남깁니다.',
    task: '신선한 분화구 가장자리에 도착해 E를 길게 눌러 파노라마·LiDAR 조사를 수행하세요.',
    observation: '함몰부, 융기된 테두리, 바깥쪽 분출물 지형을 확인했습니다.',
    action: '파노라마·LiDAR 조사', x: -58, z: -65, radius: 9, hold: 2.4,
    sourceLabel: 'NASA Science · Moon Craters', sourceUrl: 'https://science.nasa.gov/moon/lunar-craters/'
  },
  {
    title: '영구 음영 지역과 물얼음', phenomenon: '극지 콜드 트랩',
    briefing: '달 극지의 일부 분화구 바닥은 태양빛이 거의 또는 전혀 닿지 않아 매우 낮은 온도가 유지됩니다. 이런 영구 음영 지역은 콜드 트랩이 되어 물얼음이 오랫동안 남아 있을 수 있습니다.',
    task: '어두운 분화구 바닥으로 진입해 E를 길게 눌러 레이더·열 조사를 수행하세요.',
    observation: '낮은 온도의 음영 지대에서 물과 관련된 레이더 반사 후보를 기록했습니다.',
    action: '레이더·열 조사', x: -30, z: 25, radius: 10, hold: 2.6,
    sourceLabel: 'NASA Science · LCROSS', sourceUrl: 'https://science.nasa.gov/mission/lcross/'
  },
  {
    title: '표토와 충돌 교란', phenomenon: '임팩트 가드닝',
    briefing: '반복되는 미세 운석 충돌은 달 표면의 암석을 부수어 고운 표토를 만들고 위아래 물질을 섞습니다. 층을 보존한 코어 시료는 서로 다른 시기의 퇴적과 교란 기록을 읽는 데 도움이 됩니다.',
    task: '표토 표본 지점에서 E를 길게 눌러 층상 코어를 시추하세요.',
    observation: '입자 크기와 색이 다른 표토층을 보존한 코어 시료를 확보했습니다.',
    action: '층상 코어 시추', x: 45, z: -8, radius: 8, hold: 2.8,
    sourceLabel: 'NASA Science · Moon Composition', sourceUrl: 'https://science.nasa.gov/moon/composition/'
  },
  {
    title: '월진과 달 내부', phenomenon: '달 지진학',
    briefing: '아폴로 우주비행사가 설치한 지진계는 월진과 충돌로 생긴 진동을 기록했습니다. 지진파가 달 내부를 통과하며 달라지는 방식은 지각과 맨틀 같은 내부 구조를 추정하는 단서가 됩니다.',
    task: '평탄하고 안정된 지점에서 E를 길게 눌러 지진계를 전개하세요.',
    observation: '안정된 지반에 지진계를 설치해 달 내부를 통과할 진동의 관측점을 마련했습니다.',
    action: '지진계 전개', x: 85, z: 15, radius: 8, hold: 2.5,
    sourceLabel: 'NASA Science · Apollo와 월진', sourceUrl: 'https://science.nasa.gov/solar-system/moon/nasas-apollo-samples-lro-help-scientists-forecast-moonquakes/'
  },
  {
    title: '달 뒷면 통신', phenomenon: '가시선과 중계',
    briefing: '달 자체가 전파의 가시선을 가리기 때문에 뒷면의 탐사기는 지구와 직접 통신할 수 없습니다. 달 너머와 지구를 모두 볼 수 있는 중계 위성이나 중계 지점이 신호를 이어 주어야 합니다.',
    task: '높은 능선에 도착해 E를 길게 눌러 통신 중계 비콘을 전개하세요.',
    observation: '능선 비콘이 중계망과 연결되어 뒷면 탐사 자료의 통신 경로를 확보했습니다.',
    action: '중계 비콘 전개', x: 70, z: 66, radius: 9, hold: 2.7,
    sourceLabel: 'NASA NTRS · Lunar far-side communication satellites', sourceUrl: 'https://ntrs.nasa.gov/citations/19680015886'
  }
];
const state = { started: false, complete: false, stage: 0, battery: 100, speed: 0, heading: 0, elapsed: 0, actionProgress: 0, failSafes: 0, discoveries: Array(5).fill(false), briefingOpen: false, codexOpen: false, transitioning: false, boosting: false };
let scene, camera, renderer, rover, marker, markerBeam, markerRing, actionPulse, clock, lastSave = 0;
let roverRig = null;
let actionHeld = false, toastTimer = 0, transitionTimer = 0;
const keys = Object.create(null), boulders = [], wheels = [], scienceSites = [];
const map = $('#mapCanvas'), mapCtx = map.getContext('2d');
const cameraGoal = new THREE.Vector3(), cameraLook = new THREE.Vector3();

const audio = {
  supported: !!(window.AudioContext || window.webkitAudioContext), initialized: false,
  muted: localStorage.getItem(AUDIO_MUTE_KEY) === 'true', context: null, master: null,
  motorOsc: null, motorGain: null, motorFilter: null, wheelNoise: null, wheelGain: null,
  actionOsc: null, actionGain: null, activeSfx: new Set()
};

function audioTime(){return audio.context?.currentTime || 0;}
function setAudioParam(param,value,ramp=.04){
  if(!param||!audio.context)return;
  const t=audioTime();param.cancelScheduledValues(t);param.setValueAtTime(param.value,t);param.linearRampToValueAtTime(value,t+ramp);
}
function makeNoiseBuffer(seconds=2){
  const length=Math.max(1,Math.floor(audio.context.sampleRate*seconds)),buffer=audio.context.createBuffer(1,length,audio.context.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(.55+.45*Math.sin(i*.017));
  return buffer;
}
function updateSoundButton(){
  const button=$('#soundBtn');if(!button)return;
  const on=audio.supported&&!audio.muted;button.textContent=on?'소리 켜짐':'소리 꺼짐';button.setAttribute('aria-label',on?'효과음 끄기':'효과음 켜기');button.setAttribute('aria-pressed',String(on));button.classList.toggle('muted',!on);
}
function initAudio(){
  if(!audio.supported)return false;
  try{
    if(audio.initialized){if(audio.context.state==='suspended')audio.context.resume();return true;}
    const AudioContextClass=window.AudioContext||window.webkitAudioContext,ctx=new AudioContextClass();audio.context=ctx;
    const master=ctx.createGain();master.gain.value=audio.muted?0:.42;master.connect(ctx.destination);audio.master=master;
    const motorFilter=ctx.createBiquadFilter();motorFilter.type='lowpass';motorFilter.frequency.value=520;motorFilter.Q.value=.8;motorFilter.connect(master);audio.motorFilter=motorFilter;
    const motorGain=ctx.createGain();motorGain.gain.value=0;motorGain.connect(motorFilter);audio.motorGain=motorGain;
    const motorOsc=ctx.createOscillator();motorOsc.type='triangle';motorOsc.frequency.value=48;motorOsc.connect(motorGain);motorOsc.start();audio.motorOsc=motorOsc;
    const wheelFilter=ctx.createBiquadFilter();wheelFilter.type='bandpass';wheelFilter.frequency.value=760;wheelFilter.Q.value=.65;wheelFilter.connect(master);
    const wheelGain=ctx.createGain();wheelGain.gain.value=0;wheelGain.connect(wheelFilter);audio.wheelGain=wheelGain;
    const wheelNoise=ctx.createBufferSource();wheelNoise.buffer=makeNoiseBuffer(2);wheelNoise.loop=true;wheelNoise.connect(wheelGain);wheelNoise.start();audio.wheelNoise=wheelNoise;
    const actionGain=ctx.createGain();actionGain.gain.value=0;actionGain.connect(master);audio.actionGain=actionGain;
    const actionOsc=ctx.createOscillator();actionOsc.type='sine';actionOsc.frequency.value=180;actionOsc.connect(actionGain);actionOsc.start();audio.actionOsc=actionOsc;
    audio.initialized=true;ctx.resume();updateSoundButton();return true;
  }catch(error){console.warn('Web Audio를 초기화할 수 없습니다.',error);audio.supported=false;updateSoundButton();return false;}
}
function playTone(frequency=440,duration=.12,type='sine',volume=.12,slide=0){
  if(!audio.initialized||audio.muted||audio.context.state==='closed'||audio.activeSfx.size>12)return;
  const ctx=audio.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();audio.activeSfx.add(osc);
  osc.type=type;osc.frequency.setValueAtTime(frequency,t);if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(20,frequency+slide),t+duration);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(gain);gain.connect(audio.master);osc.onended=()=>{osc.disconnect();gain.disconnect();audio.activeSfx.delete(osc);};osc.start(t);osc.stop(t+duration+.025);
}
function playNoise(duration=.14,volume=.055,frequency=900){
  if(!audio.initialized||audio.muted||audio.activeSfx.size>12)return;
  const ctx=audio.context,t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();audio.activeSfx.add(source);
  source.buffer=makeNoiseBuffer(duration+.05);filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=1.2;gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(filter);filter.connect(gain);gain.connect(audio.master);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();audio.activeSfx.delete(source);};source.start(t);source.stop(t+duration+.02);
}
function playSfx(kind){
  if(kind==='start'){playTone(330,.09,'sine',.1,110);setTimeout(()=>playTone(550,.14,'sine',.08,140),80);}
  else if(kind==='scan'){playTone(620,.2,'sine',.11,420);playNoise(.11,.035,1500);}
  else if(kind==='drill'){playNoise(.28,.08,420);playTone(105,.3,'sawtooth',.045,-28);}
  else if(kind==='seismic'){[180,260,390].forEach((f,i)=>setTimeout(()=>playTone(f,.18,'sine',.075,25),i*85));}
  else if(kind==='relay'){[360,540,760].forEach((f,i)=>setTimeout(()=>playTone(f,.16,'triangle',.075,90),i*75));}
  else if(kind==='unlock'){playTone(760,.15,'sine',.085,180);setTimeout(()=>playTone(1020,.19,'sine',.065,160),90);}
  else if(kind==='success'){[392,523,659,784].forEach((f,i)=>setTimeout(()=>playTone(f,.34,'triangle',.08,45),i*105));}
  else playTone(460,.08,'sine',.055,45);
}
function setMuted(muted){audio.muted=!!muted;localStorage.setItem(AUDIO_MUTE_KEY,String(audio.muted));if(audio.master)setAudioParam(audio.master.gain,audio.muted?0:.42,.06);updateSoundButton();return getAudioDebug();}
function toggleMuted(){return setMuted(!audio.muted);}
function updateAudio(){
  if(!audio.initialized)return;
  const moving=state.started&&!state.complete&&!state.briefingOpen&&!state.codexOpen,amount=Math.min(1,Math.abs(state.speed)/DRIVE.boostMax),throttle=!!(keys.KeyW||keys.ArrowUp||keys.KeyS||keys.ArrowDown);
  setAudioParam(audio.motorOsc.frequency,48+amount*112+(state.boosting?24:0),.07);setAudioParam(audio.motorGain.gain,moving?(.008+amount*.055+(throttle?.014:0)):0,.07);setAudioParam(audio.motorFilter.frequency,380+amount*760,.09);
  setAudioParam(audio.wheelGain.gain,moving?amount*.035:0,.08);
  const actionActive=actionHeld&&moving&&distanceToObjective()<=missions[state.stage].radius;
  setAudioParam(audio.actionOsc.frequency,[520,260,92,180,680][state.stage]||220,.03);setAudioParam(audio.actionGain.gain,actionActive?.035:0,.04);
}
function getAudioDebug(){return {supported:audio.supported,initialized:audio.initialized,muted:audio.muted,contextState:audio.context?.state||'not-created',activeOneShots:audio.activeSfx.size,motorRunning:!!audio.motorOsc,actionRunning:!!audio.actionOsc};}
function shutdownAudio(){
  if(!audio.initialized)return;
  for(const source of [audio.motorOsc,audio.wheelNoise,audio.actionOsc,...audio.activeSfx]){try{source.stop();}catch{}try{source.disconnect();}catch{}}
  audio.activeSfx.clear();try{audio.master.disconnect();}catch{}audio.context.close();
}

function terrainHeight(x, z) {
  const broad = Math.sin(x * .045) * 2.1 + Math.cos(z * .052) * 1.7 + Math.sin((x + z) * .023) * 2.4;
  const crater = (cx, cz, r, depth) => { const d = Math.hypot(x - cx, z - cz) / r; return d < 1 ? -depth * (1 - d * d) + (d > .72 ? depth * .28 * Math.sin((d - .72) / .28 * Math.PI) : 0) : 0; };
  return broad + crater(-30, 25, 30, 7) + crater(45, -32, 24, 5) + crater(-72, -65, 18, 3);
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020407);
  scene.fog = new THREE.FogExp2(0x070b0f, .0055);
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 700);
  renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0x8ba2b8, 0x070809, .58));
  const sun = new THREE.DirectionalLight(0xffe8c7, 3.05);
  sun.position.set(-75, 90, -45); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -120; sun.shadow.camera.right = sun.shadow.camera.top = 120;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8eb7d8, .48);
  fill.position.set(65, 28, 80); scene.add(fill);

  const seg = 96, geo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x73777a, roughness: 1, metalness: .02, flatShading: true }));
  terrain.receiveShadow = true; scene.add(terrain);

  createStars(); createBoulders(); rover = createRover(); scene.add(rover); createScienceSites(); createMarker();
  camera.position.set(0, 10, 15); clock = new THREE.Clock();
}

function createStars() {
  const count = 900, pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, y = 35 + Math.random() * 230, r = 220 + Math.random() * 220; pos[i*3] = Math.cos(a)*r; pos[i*3+1] = y; pos[i*3+2] = Math.sin(a)*r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8ecff, size: .65, sizeAttenuation: true })));
  const earth = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 18), new THREE.MeshStandardMaterial({ color: 0x4d9dd9, emissive: 0x09233d, roughness: .8 }));
  earth.position.set(-150, 115, -260); scene.add(earth);
}

function createBoulders() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x565b5e, roughness: 1, flatShading: true });
  let seed = 8128; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 48; i++) {
    const x = (rand()-.5)*350, z = (rand()-.5)*350, r = .8+rand()*2.8;
    if (missions.some(o => Math.hypot(x-o.x,z-o.z)<16) || Math.hypot(x,z)<12) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat); rock.position.set(x,terrainHeight(x,z)+r*.65,z); rock.scale.y=.65+rand()*.5; rock.rotation.set(rand()*2,rand()*2,rand()*2); rock.castShadow=rock.receiveShadow=true; scene.add(rock); boulders.push({x,z,r:r*.9});
  }
}

function box(w,h,d,mat) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.castShadow=m.receiveShadow=true; return m; }
function mesh(geometry, material) { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = true; return m; }
function chamferedBox(w, h, d, c, material) {
  const s = new THREE.Shape();
  s.moveTo(-w/2+c,-h/2); s.lineTo(w/2-c,-h/2); s.lineTo(w/2,-h/2+c); s.lineTo(w/2,h/2-c);
  s.lineTo(w/2-c,h/2); s.lineTo(-w/2+c,h/2); s.lineTo(-w/2,h/2-c); s.lineTo(-w/2,-h/2+c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false}); g.translate(0,0,-d/2);
  return mesh(g,material);
}
function foilTexture() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'), image=ctx.createImageData(128,128), data=image.data;
  let seed=9127; const rand=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4, folds=Math.sin(x*.31+Math.sin(y*.12)*2)*24+Math.sin((x+y)*.83)*9;
    const v=Math.max(25,Math.min(235,125+folds+(rand()-.5)*55)); data[i]=data[i+1]=data[i+2]=v; data[i+3]=255;
  }
  ctx.putImageData(image,0,0); const tex=new THREE.CanvasTexture(canvas); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(3,2); return tex;
}
function cylinderBetween(a,b,r,material,segments=10) {
  const delta=new THREE.Vector3().subVectors(b,a), m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),segments),material);
  m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return m;
}
function createRover() {
  wheels.length=0;
  const g=new THREE.Group(); g.name='LUNA-12 six-wheel rover';
  const foilMap=foilTexture();
  const mats={
    white:new THREE.MeshStandardMaterial({color:0xdde0dc,roughness:.78,metalness:.14}),
    edge:new THREE.MeshStandardMaterial({color:0x899095,roughness:.34,metalness:.83}),
    dark:new THREE.MeshStandardMaterial({color:0x151a1d,roughness:.48,metalness:.7}),
    tire:new THREE.MeshStandardMaterial({color:0x24282a,roughness:.9,metalness:.24}),
    gold:new THREE.MeshStandardMaterial({color:0xd29b38,roughness:.56,metalness:.68,bumpMap:foilMap,bumpScale:.16}),
    solar:new THREE.MeshStandardMaterial({color:0x163c68,roughness:.35,metalness:.5,emissive:0x071629,emissiveIntensity:.65}),
    glass:new THREE.MeshStandardMaterial({color:0x071019,roughness:.12,metalness:.55,emissive:0x051b29,emissiveIntensity:.7}),
    led:new THREE.MeshStandardMaterial({color:0xb8ffff,roughness:.22,emissive:0x55ffff,emissiveIntensity:3}),
    red:new THREE.MeshStandardMaterial({color:0x731d16,roughness:.4,emissive:0xff3c21,emissiveIntensity:2})
  };
  const frame=new THREE.Group(); frame.position.y=1.42; g.add(frame);
  const lower=chamferedBox(3.65,.48,4.75,.22,mats.dark); lower.position.y=-.12; frame.add(lower);
  for(const x of [-1.62,1.62]) { const rail=box(.16,.2,5.15,mats.edge); rail.position.set(x,.18,0); frame.add(rail); }
  for(const z of [-2.48,2.48]) { const bumper=box(3.75,.18,.18,mats.edge); bumper.position.set(0,.04,z); frame.add(bumper); }
  const body=chamferedBox(3.2,.92,3.75,.28,mats.white); body.position.set(0,.57,.12); frame.add(body);
  const foil=chamferedBox(2.84,.64,3.46,.22,mats.gold); foil.position.set(0,.58,.14); foil.scale.set(1.01,1.01,1.01); frame.add(foil);
  const whiteCap=chamferedBox(2.98,.2,3.62,.18,mats.white); whiteCap.position.set(0,1.07,.1); frame.add(whiteCap);
  const radiator=box(2.55,.12,2.15,mats.white); radiator.position.set(0,1.26,.42); frame.add(radiator);
  for(let z=-.42;z<1.35;z+=.22){const rib=box(2.35,.035,.045,mats.edge);rib.position.set(0,1.34,z);frame.add(rib);}
  // Hinged blue solar wings with metallic frames and cell seams.
  const solarGeo=new THREE.BoxGeometry(1.7,.1,2.65), solarFrames=[];
  for(const x of [-2.47,2.47]){
    const panel=mesh(solarGeo,mats.solar); panel.position.set(x,2.52,.55); g.add(panel); solarFrames.push(panel);
    const hinge=cylinderBetween(new THREE.Vector3(Math.sign(x)*1.67,2.5,-.45),new THREE.Vector3(Math.sign(x)*1.67,2.5,1.48),.09,mats.edge,12);g.add(hinge);
    for(let i=-1;i<=1;i++){const seam=box(.025,.025,2.5,mats.edge);seam.position.set(x+i*.53,2.585,.55);g.add(seam);}
    for(let z=-.72;z<=1.82;z+=.63){const seam=box(1.62,.025,.022,mats.edge);seam.position.set(x,2.585,z);g.add(seam);}
  }
  // Shared high-detail wheels: 32-sided tire, rim, hub, and 24 grousers each.
  const tireGeo=new THREE.CylinderGeometry(.78,.78,.48,32,2,true), sidewallGeo=new THREE.TorusGeometry(.585,.17,10,32);
  const rimGeo=new THREE.CylinderGeometry(.46,.46,.53,24), hubGeo=new THREE.CylinderGeometry(.18,.18,.66,20), cleatGeo=new THREE.BoxGeometry(.58,.1,.19);
  const jointGeo=new THREE.CylinderGeometry(.25,.25,.3,16), fastenerGeo=new THREE.CylinderGeometry(.055,.055,.035,10);
  const wheelZ=[-2.05,0,2.05];
  for(const side of [-1,1]){
    const suspension=new THREE.Group(); suspension.name=side<0?'left rocker-bogie':'right rocker-bogie'; g.add(suspension);
    const sx=side*1.73;
    const rockerPivot=new THREE.Vector3(sx,1.42,-.38), frontJoint=new THREE.Vector3(side*2.04,1.12,-2.05), bogiePivot=new THREE.Vector3(side*1.98,1.13,.68);
    suspension.add(cylinderBetween(rockerPivot,frontJoint,.105,mats.edge,12),cylinderBetween(rockerPivot,bogiePivot,.12,mats.dark,12));
    suspension.add(cylinderBetween(bogiePivot,new THREE.Vector3(side*2.04,.82,0),.09,mats.edge,10),cylinderBetween(bogiePivot,new THREE.Vector3(side*2.04,.82,2.05),.09,mats.edge,10));
    for(const p of [rockerPivot,bogiePivot]){const j=mesh(jointGeo,mats.dark);j.rotation.z=Math.PI/2;j.position.copy(p);suspension.add(j);}
    wheelZ.forEach((z,index)=>{
      const steer=new THREE.Group(); steer.name=`${side<0?'L':'R'}${index+1} steering knuckle`; steer.position.set(side*2.12,.78,z); g.add(steer);
      const motor=mesh(jointGeo,mats.dark); motor.rotation.z=Math.PI/2; motor.position.x=-side*.2; steer.add(motor);
      const spin=new THREE.Group(); spin.name=`wheel ${side<0?'L':'R'}${index+1}`; steer.add(spin);
      const tire=mesh(tireGeo,mats.tire); tire.rotation.z=Math.PI/2; spin.add(tire);
      for(const face of [-1,1]){const sidewall=mesh(sidewallGeo,mats.tire);sidewall.rotation.y=Math.PI/2;sidewall.position.x=face*.24;spin.add(sidewall);}
      const rim=mesh(rimGeo,mats.edge);rim.rotation.z=Math.PI/2;spin.add(rim);
      const hub=mesh(hubGeo,mats.dark);hub.rotation.z=Math.PI/2;spin.add(hub);
      const cleats=new THREE.InstancedMesh(cleatGeo,mats.edge,24),dummy=new THREE.Object3D();cleats.name='24 wheel grousers';cleats.castShadow=cleats.receiveShadow=true;
      for(let n=0;n<24;n++){const a=n*Math.PI/12;dummy.position.set(0,Math.cos(a)*.79,Math.sin(a)*.79);dummy.rotation.set(a,0,0);dummy.updateMatrix();cleats.setMatrixAt(n,dummy.matrix);}spin.add(cleats);
      const fasteners=new THREE.InstancedMesh(fastenerGeo,mats.dark,8);fasteners.name='hub fasteners';fasteners.castShadow=true;
      for(let n=0;n<8;n++){const a=n*Math.PI/4;dummy.position.set(side*.35,Math.cos(a)*.32,Math.sin(a)*.32);dummy.rotation.set(0,0,Math.PI/2);dummy.updateMatrix();fasteners.setMatrixAt(n,dummy.matrix);}spin.add(fasteners);
      wheels.push({spin,steer,suspension,side,index,baseY:.78,spinAngle:0,steerAngle:0});
    });
  }
  // Camera mast, twin nav lenses, work lights, and exposed cabling.
  const mastBase=mesh(new THREE.CylinderGeometry(.28,.36,.28,16),mats.dark);mastBase.position.set(-.52,2.78,-.55);g.add(mastBase);
  const mast=cylinderBetween(new THREE.Vector3(-.52,2.86,-.55),new THREE.Vector3(-.52,4.36,-.65),.105,mats.edge,12);g.add(mast);
  const head=chamferedBox(1.12,.52,.58,.12,mats.white);head.position.set(-.52,4.45,-.68);g.add(head);
  const lensGeo=new THREE.CylinderGeometry(.14,.17,.1,20);
  for(const x of [-.83,-.21]){const lens=mesh(lensGeo,mats.glass);lens.rotation.x=Math.PI/2;lens.position.set(x,4.48,-1.01);g.add(lens);const led=mesh(new THREE.SphereGeometry(.045,10,8),mats.led);led.position.set(x+.18,4.35,-1.0);g.add(led);}
  const cableCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.73,2.65,-.4),new THREE.Vector3(-.8,3.35,-.48),new THREE.Vector3(-.68,4.05,-.58),new THREE.Vector3(-.9,4.28,-.66)]);
  g.add(mesh(new THREE.TubeGeometry(cableCurve,24,.035,6,false),mats.dark));
  // Offset parabolic high-gain antenna, yoke, feed horn, and idle tracking pivot.
  const dishPivot=new THREE.Group();dishPivot.name='high-gain antenna gimbal';dishPivot.position.set(1.08,3.1,.45);g.add(dishPivot);
  const profile=[];for(let i=0;i<=12;i++){const r=i/12*1.02;profile.push(new THREE.Vector2(r,r*r*.38));}
  const dish=mesh(new THREE.LatheGeometry(profile,40),mats.white);dish.rotation.x=-Math.PI/2;dishPivot.add(dish);
  const feed=cylinderBetween(new THREE.Vector3(0,.1,-.05),new THREE.Vector3(0,.1,-.9),.035,mats.edge,8);dishPivot.add(feed);
  const horn=mesh(new THREE.ConeGeometry(.12,.22,14),mats.dark);horn.rotation.x=Math.PI;horn.position.set(0,.1,-.94);dishPivot.add(horn);
  // Front deployable-looking science arm with shoulder/elbow joints and drill bit.
  const arm=new THREE.Group();arm.name='front science drill arm';g.add(arm);
  const shoulder=new THREE.Vector3(1.22,1.8,-2.32), elbow=new THREE.Vector3(1.38,1.12,-3.1), wrist=new THREE.Vector3(.8,.72,-3.72);
  arm.add(cylinderBetween(shoulder,elbow,.11,mats.edge,12),cylinderBetween(elbow,wrist,.095,mats.white,12));
  for(const p of [shoulder,elbow,wrist]){const j=mesh(new THREE.SphereGeometry(.18,16,10),mats.dark);j.position.copy(p);arm.add(j);}
  const drill=mesh(new THREE.ConeGeometry(.14,.72,16),mats.edge);drill.rotation.x=-Math.PI/2;drill.position.set(.8,.7,-4.08);arm.add(drill);
  const cable=new THREE.CatmullRomCurve3([shoulder,new THREE.Vector3(1.62,1.45,-2.7),elbow,new THREE.Vector3(1.1,.98,-3.35),wrist]);arm.add(mesh(new THREE.TubeGeometry(cable,30,.028,6,false),mats.dark));
  // Handles, panel seams, fasteners and rear status lamps.
  for(const x of [-1.25,1.25]){g.add(cylinderBetween(new THREE.Vector3(x,2.72,1.25),new THREE.Vector3(x,2.72,2.04),.045,mats.edge,8));}
  for(let x=-1.25;x<=1.25;x+=.5)for(const z of [-1.7,1.72]){const bolt=mesh(new THREE.SphereGeometry(.045,8,6),mats.dark);bolt.position.set(x,2.0,z);g.add(bolt);}
  for(const x of [-.55,.55]){const lamp=mesh(new THREE.BoxGeometry(.28,.13,.06),mats.red);lamp.position.set(x,1.85,2.52);g.add(lamp);}
  const workLight=new THREE.SpotLight(0xc9f7ff,12,18,.48,.6,1.2);workLight.position.set(0,2.25,-2.3);workLight.target.position.set(0,0,-8);g.add(workLight,workLight.target);
  roverRig={dishPivot,solarFrames,suspensions:[...new Set(wheels.map(w=>w.suspension))],wheelSpin:0,steering:0,suspensionPhase:0};
  return g;
}

function createScienceSites() {
  const metal = new THREE.MeshStandardMaterial({color:0xaeb8bd,roughness:.42,metalness:.76});
  const dark = new THREE.MeshStandardMaterial({color:0x11171c,roughness:.7,metalness:.48});
  const amber = new THREE.MeshStandardMaterial({color:0xffb84c,emissive:0x6b3100,emissiveIntensity:1.2,roughness:.5});
  const cyan = new THREE.MeshStandardMaterial({color:0x69ecff,emissive:0x0b7185,emissiveIntensity:1.8,roughness:.28});
  const white = new THREE.MeshStandardMaterial({color:0xe0e6e7,roughness:.66,metalness:.2});
  const place = (index, group) => { const m=missions[index]; group.position.set(m.x,terrainHeight(m.x,m.z)+.12,m.z); group.name=`science site ${index+1}: ${m.title}`; scene.add(group); scienceSites[index]={group,deployed:null,actionPart:null}; };

  // 1: survey stakes frame the raised rim of the fresh impact crater.
  const craterSite=new THREE.Group();
  for(const [x,z] of [[-3,-3],[-3,3],[3,-3],[3,3]]){const pole=mesh(new THREE.CylinderGeometry(.07,.09,2.4,10),metal);pole.position.set(x,1.2,z);craterSite.add(pole);const lamp=mesh(new THREE.SphereGeometry(.16,12,8),amber);lamp.position.set(x,2.45,z);craterSite.add(lamp);}
  const lidar=mesh(new THREE.CylinderGeometry(.28,.4,.5,16),dark);lidar.position.y=.42;craterSite.add(lidar);place(0,craterSite);scienceSites[0].actionPart=lidar;

  // 2: a visibly dark cold trap with small blue ice-candidate glints.
  const psr=new THREE.Group();
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(10,48),new THREE.MeshBasicMaterial({color:0x02070c,transparent:true,opacity:.72,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.18;psr.add(shadow);
  const coldRing=new THREE.Mesh(new THREE.RingGeometry(8.8,9.3,48),new THREE.MeshBasicMaterial({color:0x4ddfff,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}));coldRing.rotation.x=-Math.PI/2;coldRing.position.y=.22;psr.add(coldRing);
  for(let i=0;i<9;i++){const a=i*2.4,r=2.4+(i%3)*1.55;const ice=mesh(new THREE.OctahedronGeometry(.12+(i%2)*.08,0),cyan);ice.position.set(Math.cos(a)*r,.32,Math.sin(a)*r);psr.add(ice);}
  place(1,psr);scienceSites[1].actionPart=coldRing;

  // 3: a striped regolith sampling collar and layered core rack.
  const coreSite=new THREE.Group();
  const collar=mesh(new THREE.TorusGeometry(1.15,.12,10,32),amber);collar.rotation.x=Math.PI/2;collar.position.y=.18;coreSite.add(collar);
  for(const x of [-1.8,1.8]){const pole=mesh(new THREE.CylinderGeometry(.065,.065,2.2,8),white);pole.position.set(x,1.1,0);coreSite.add(pole);const tip=mesh(new THREE.ConeGeometry(.15,.35,10),amber);tip.position.set(x,2.35,0);coreSite.add(tip);}
  const core=mesh(new THREE.CylinderGeometry(.16,.16,1.8,14),new THREE.MeshStandardMaterial({color:0x8a8174,roughness:1}));core.position.set(0,.95,0);coreSite.add(core);place(2,coreSite);scienceSites[2].actionPart=core;

  // 4: a packaged station becomes a three-footed Apollo-style seismometer.
  const seismicSite=new THREE.Group();const crate=box(1.5,.42,1.2,dark);crate.position.y=.25;seismicSite.add(crate);
  const seismo=new THREE.Group();seismo.visible=false;const body=box(1.35,.62,1.05,amber);body.position.y=.58;seismo.add(body);
  for(const [x,z] of [[-.62,-.45],[.62,-.45],[0,.62]])seismo.add(cylinderBetween(new THREE.Vector3(0,.5,0),new THREE.Vector3(x,.1,z),.055,metal,8));
  const aerial=mesh(new THREE.CylinderGeometry(.03,.03,2.3,8),metal);aerial.position.set(.45,1.65,.2);seismo.add(aerial);seismicSite.add(seismo);place(3,seismicSite);scienceSites[3].deployed=seismo;scienceSites[3].actionPart=seismo;

  // 5: a relay mast, dish and signal rings deploy on the ridge.
  const relaySite=new THREE.Group();const base=mesh(new THREE.CylinderGeometry(.72,.95,.35,16),dark);base.position.y=.2;relaySite.add(base);
  const relay=new THREE.Group();relay.visible=false;const mast=mesh(new THREE.CylinderGeometry(.07,.12,5.2,10),metal);mast.position.y=2.75;relay.add(mast);
  const dish=mesh(new THREE.SphereGeometry(1.05,24,12,0,Math.PI*2,0,.72),white);dish.scale.y=.24;dish.rotation.x=-.55;dish.position.set(0,4.45,0);relay.add(dish);
  const signal=new THREE.Mesh(new THREE.TorusGeometry(1.55,.035,8,48),new THREE.MeshBasicMaterial({color:0x67e8f9,transparent:true,opacity:.7}));signal.rotation.x=Math.PI/2;signal.position.y=4.9;relay.add(signal);relaySite.add(relay);place(4,relaySite);scienceSites[4].deployed=relay;scienceSites[4].actionPart=signal;
}

function createMarker() {
  marker = new THREE.Group();
  markerRing = new THREE.Mesh(new THREE.RingGeometry(7.3,7.8,48),new THREE.MeshBasicMaterial({color:0xffc45b,transparent:true,opacity:.8,side:THREE.DoubleSide})); markerRing.rotation.x=-Math.PI/2; markerRing.position.y=.15; marker.add(markerRing);
  markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(.22,1.8,15,16,1,true),new THREE.MeshBasicMaterial({color:0xffc45b,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false})); markerBeam.position.y=7.5; marker.add(markerBeam);
  actionPulse = new THREE.Mesh(new THREE.RingGeometry(1.2,1.45,48),new THREE.MeshBasicMaterial({color:0x67e8f9,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));actionPulse.rotation.x=-Math.PI/2;actionPulse.position.y=.3;marker.add(actionPulse);
  scene.add(marker); updateMarker();
}
function updateMarker(){ const o=missions[Math.min(state.stage,missions.length-1)]; marker.position.set(o.x,terrainHeight(o.x,o.z),o.z); const colors=[0xffc45b,0x55ddff,0xff9f43,0x9cff87,0x67e8f9],c=colors[state.stage]||colors[4]; markerRing.material.color.setHex(c);markerBeam.material.color.setHex(c); }

function restoreDeployedProps(){scienceSites.forEach((site,i)=>{if(site?.deployed){site.deployed.visible=!!state.discoveries[i];site.deployed.scale.setScalar(1);}});}
function loadSave() {
  try {
    const s=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(s?.version===SAVE_VERSION&&Number.isInteger(s.stage)&&s.stage>=0&&s.stage<missions.length&&Array.isArray(s.discoveries)&&s.discoveries.length===missions.length){
      state.stage=s.stage;state.discoveries=s.discoveries.map(Boolean);state.battery=Math.max(10,Math.min(100,Number(s.battery)||100));state.elapsed=Math.max(0,Number(s.elapsed)||0);
      rover.position.set(Number(s.x)||0,0,Number(s.z)||0);state.heading=Number(s.heading)||0;rover.rotation.y=state.heading;restoreDeployedProps();return true;
    }
  } catch {}
  return false;
}
function save(){if(!state.started||state.complete)return;localStorage.setItem(SAVE_KEY,JSON.stringify({version:SAVE_VERSION,stage:state.stage,discoveries:state.discoveries,battery:state.battery,elapsed:state.elapsed,x:rover.position.x,z:rover.position.z,heading:state.heading}));}
function clearInputs(){actionHeld=false;Object.keys(keys).forEach(k=>keys[k]=false);state.actionProgress=0;}
function reset(){
  clearTimeout(transitionTimer);localStorage.removeItem(SAVE_KEY);clearInputs();
  Object.assign(state,{started:false,complete:false,stage:0,battery:100,speed:0,heading:0,elapsed:0,actionProgress:0,failSafes:0,discoveries:Array(5).fill(false),briefingOpen:false,codexOpen:false,transitioning:false,boosting:false});
  rover.position.set(0,0,0);rover.rotation.y=0;restoreDeployedProps();updateMarker();updateMissionUI();renderCodex();
  ['#ending','#briefing','#codex','#observationCard'].forEach(s=>$(s).classList.add('hidden'));$('#start').classList.remove('hidden');$('#continueBtn').classList.add('hidden');setGameHud(false);return getState();
}
function startGame(useSave=false){
  if(!useSave){localStorage.removeItem(SAVE_KEY);Object.assign(state,{stage:0,battery:100,speed:0,heading:0,elapsed:0,actionProgress:0,complete:false,failSafes:0,discoveries:Array(5).fill(false),boosting:false});rover.position.set(0,0,0);rover.rotation.y=0;restoreDeployedProps();}
  state.started=true;state.transitioning=false;$('#start').classList.add('hidden');setGameHud(true);updateMarker();updateMissionUI();renderCodex();showBriefing();
}
function setGameHud(on){['#topbar','#mission','#telemetry','#minimap','#objectiveArrow'].forEach(s=>$(s).classList.toggle('hidden',!on));$('#touch').classList.toggle('active',on);}
function showBriefing(){
  const m=missions[state.stage];clearInputs();state.speed=0;state.briefingOpen=true;
  $('#briefingMission').textContent=`SCIENCE MISSION ${String(state.stage+1).padStart(2,'0')} / 05`;$('#briefingPhenomenon').textContent=m.phenomenon;$('#briefingTitle').textContent=m.title;$('#briefingText').textContent=m.briefing;$('#briefingTask').textContent=m.task;
  const link=$('#briefingSource');link.textContent=`과학 출처 · ${m.sourceLabel} ↗`;link.href=m.sourceUrl;$('#briefingContinue').textContent=state.stage===0?'탐사 시작':'계속';$('#briefing').classList.remove('hidden');
}
function closeBriefing(){if(!state.briefingOpen)return getState();state.briefingOpen=false;$('#briefing').classList.add('hidden');toast(`${missions[state.stage].phenomenon} · 현장 표식을 따라가십시오`);save();return getState();}
function openCodex(){clearInputs();state.speed=0;state.codexOpen=true;renderCodex();$('#codex').classList.remove('hidden');return getState();}
function closeCodex(){state.codexOpen=false;$('#codex').classList.add('hidden');return getState();}
function renderCodex(){
  const count=state.discoveries.filter(Boolean).length;$('#codexCount').textContent=`${count} / 5 발견`;$('#codexBadge').textContent=`${count}/5`;
  $('#codexList').innerHTML=missions.map((m,i)=>{const unlocked=state.discoveries[i];return `<article class="codex-entry ${unlocked?'unlocked':'locked'}"><span class="codex-number">${String(i+1).padStart(2,'0')}</span><div><small>${unlocked?m.phenomenon:'미발견 현상'}</small><h3>${unlocked?m.title:'잠긴 기록'}</h3><p>${unlocked?m.observation:'현장 임무를 완료하면 관측 결과가 기록됩니다.'}</p>${unlocked?`<a href="${m.sourceUrl}" target="_blank" rel="noopener noreferrer">${m.sourceLabel} ↗</a>`:''}</div></article>`;}).join('');
}
function updateMissionUI(){const m=missions[Math.min(state.stage,missions.length-1)];$('#stageNum').textContent=String(state.stage+1).padStart(2,'0');$('#missionPhenomenon').textContent=m.phenomenon;$('#missionTitle').textContent=m.title;$('#missionText').textContent=m.task;$('#actionLabel').textContent=`E 길게 눌러 ${m.action}`;}
function distanceToObjective(){const m=missions[Math.min(state.stage,missions.length-1)];return Math.hypot(rover.position.x-m.x,rover.position.z-m.z);}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);}
function showObservation(index,next){
  const m=missions[index];state.transitioning=true;clearInputs();$('#observationTitle').textContent=m.title;$('#observationText').textContent=m.observation;$('#observationCard').classList.remove('hidden');
  transitionTimer=setTimeout(()=>{$('#observationCard').classList.add('hidden');state.transitioning=false;next();},1350);
}
function performObjective(){
  if(!state.started||state.complete||state.briefingOpen||state.codexOpen||state.transitioning)return false;
  const index=state.stage,m=missions[index];if(distanceToObjective()>m.radius){toast('표시된 현장 조사 구역 안으로 이동하십시오');return false;}
  state.actionProgress=0;state.discoveries[index]=true;state.battery=Math.min(100,state.battery+8);const site=scienceSites[index];
  if(site?.deployed){site.deployed.visible=true;site.deployed.scale.setScalar(.08);}
  playSfx(['scan','scan','drill','seismic','relay'][index]);setTimeout(()=>playSfx('unlock'),180);renderCodex();save();
  showObservation(index,()=>{
    if(index===missions.length-1){completeMission();return;}
    state.stage=index+1;updateMarker();updateMissionUI();save();showBriefing();
  });
  return true;
}
function completeMission(){state.complete=true;state.speed=0;state.boosting=false;state.transitioning=false;localStorage.removeItem(SAVE_KEY);setGameHud(false);$('#actionWrap').classList.add('hidden');$('#endingDiscoveries').innerHTML=missions.map(m=>`<li><b>${m.title}</b><span>${m.observation}</span></li>`).join('');$('#ending').classList.remove('hidden');$('#finalTime').textContent=formatTime(state.elapsed);setTimeout(()=>playSfx('success'),180);}
function failSafe(){state.failSafes++;state.battery=35;state.speed=0;const m=missions[state.stage];const a=Math.atan2(m.x,m.z);rover.position.set(m.x-Math.sin(a)*18,0,m.z-Math.cos(a)*18);toast('비상 전력 가동 · 안전 지점으로 복귀했습니다');save();}

function updateScienceEffects(dt){
  const now=performance.now()*.001,current=scienceSites[state.stage];
  scienceSites.forEach((site,i)=>{if(site?.deployed&&site.deployed.visible){const s=site.deployed.scale.x;site.deployed.scale.setScalar(THREE.MathUtils.lerp(s,1,.11));if(i===4&&site.actionPart)site.actionPart.rotation.z+=dt*.65;}});
  if(scienceSites[1]?.actionPart)scienceSites[1].actionPart.material.opacity=.35+Math.sin(now*2.2)*.16;
  const active=actionHeld&&!state.briefingOpen&&!state.codexOpen&&!state.transitioning&&state.started&&!state.complete&&distanceToObjective()<=missions[state.stage].radius;
  if(actionPulse){const phase=state.actionProgress/Math.max(.1,missions[state.stage].hold);actionPulse.material.opacity=active?.72:0;actionPulse.scale.setScalar(1+phase*5.4);}
  if(active&&current?.actionPart){if(state.stage===0)current.actionPart.rotation.y+=dt*5;if(state.stage===2){current.actionPart.rotation.y+=dt*10;current.actionPart.position.y=.95-Math.sin(Math.min(1,state.actionProgress/missions[2].hold)*Math.PI)*.55;}if(state.stage===4)current.actionPart.scale.setScalar(1+Math.sin(now*8)*.18);}
}

function update(dt){
  marker.rotation.y += dt*.45; markerBeam.material.opacity=.1+Math.sin(performance.now()*.003)*.045;
  const idleTime=performance.now()*.001;
  roverRig.dishPivot.rotation.y=Math.sin(idleTime*.23)*.32;
  roverRig.dishPivot.rotation.x=-.12+Math.sin(idleTime*.17)*.06;
  updateScienceEffects(dt);
  if(!state.started||state.complete||state.briefingOpen||state.codexOpen||state.transitioning){state.boosting=false;updateRoverRig(dt,0);updateCamera(dt);updateAudio();return;}
  state.elapsed+=dt;
  const forward=keys.KeyW||keys.ArrowUp, back=keys.KeyS||keys.ArrowDown, left=keys.KeyA||keys.ArrowLeft, right=keys.KeyD||keys.ArrowRight, brake=keys.Space;
  state.boosting=!!(forward&&(keys.ShiftLeft||keys.ShiftRight));
  const accel=forward?(state.boosting?DRIVE.boostAcceleration:DRIVE.acceleration):back?-DRIVE.reverseAcceleration:0;
  state.speed+=accel*dt;if(brake)state.speed*=Math.pow(DRIVE.brakeStrength,dt*60);else if(!forward&&!back)state.speed*=Math.pow(.988,dt*60);
  const topSpeed=state.boosting?DRIVE.boostMax:DRIVE.normalMax;state.speed=Math.max(-DRIVE.reverseMax,Math.min(topSpeed,state.speed));if(Math.abs(state.speed)<.025)state.speed=0;
  const speedRatio=Math.min(1,Math.abs(state.speed)/DRIVE.boostMax),steeringAttenuation=1-speedRatio*.68;
  if((left||right)&&Math.abs(state.speed)>.08)state.heading+=(left?1:-1)*dt*1.48*steeringAttenuation*Math.sign(state.speed)*Math.min(1,Math.abs(state.speed)/2.2);
  const oldX=rover.position.x,oldZ=rover.position.z; rover.position.x-=Math.sin(state.heading)*state.speed*dt; rover.position.z-=Math.cos(state.heading)*state.speed*dt;
  rover.position.x=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.x)); rover.position.z=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.z));
  for(const b of boulders){const dx=rover.position.x-b.x,dz=rover.position.z-b.z,d=Math.hypot(dx,dz);if(d<b.r+1.7){rover.position.x=oldX;rover.position.z=oldZ;state.speed*=-.15;break;}}
  rover.rotation.y=state.heading; rover.position.y=terrainHeight(rover.position.x,rover.position.z)+.12; rover.rotation.z=THREE.MathUtils.lerp(rover.rotation.z,(terrainHeight(rover.position.x+1.5,rover.position.z)-terrainHeight(rover.position.x-1.5,rover.position.z))*.13,.12); rover.rotation.x=THREE.MathUtils.lerp(rover.rotation.x,(terrainHeight(rover.position.x,rover.position.z-1.5)-terrainHeight(rover.position.x,rover.position.z+1.5))*.13,.12);
  updateRoverRig(dt,(left?1:0)-(right?1:0));
  state.battery-=dt*(.035+Math.abs(state.speed)*.017+(state.boosting?.13:0)); if(state.battery<=0)failSafe();
  const near=distanceToObjective()<=missions[state.stage].radius; $('#actionWrap').classList.toggle('hidden',!near); if(actionHeld&&near){state.actionProgress+=dt; if(state.actionProgress>=missions[state.stage].hold)performObjective();}else state.actionProgress=Math.max(0,state.actionProgress-dt*2.5); $('#actionProgress').style.width=`${Math.min(100,state.actionProgress/missions[state.stage].hold*100)}%`;
  updateCamera(dt);updateAudio();updateHUD();if(state.elapsed-lastSave>5){lastSave=state.elapsed;save();}
}

function updateRoverRig(dt,turnInput){
  const steerTarget=turnInput*.34;
  roverRig.steering=THREE.MathUtils.lerp(roverRig.steering,steerTarget,1-Math.pow(.001,dt));
  roverRig.wheelSpin+=state.speed*dt/.78; roverRig.suspensionPhase+=Math.abs(state.speed)*dt*.55;
  const cos=Math.cos(state.heading),sin=Math.sin(state.heading), centerGround=terrainHeight(rover.position.x,rover.position.z);
  for(const w of wheels){
    w.spinAngle=roverRig.wheelSpin; w.spin.rotation.x=w.spinAngle;
    const targetSteer=w.index===0?roverRig.steering:w.index===2?-roverRig.steering*.58:0;
    w.steerAngle=THREE.MathUtils.lerp(w.steerAngle,targetSteer,1-Math.pow(.0005,dt)); w.steer.rotation.y=w.steerAngle;
    const lx=w.side*2.12,lz=[-2.05,0,2.05][w.index],wx=rover.position.x+lx*cos+lz*sin,wz=rover.position.z-lx*sin+lz*cos;
    const groundDelta=THREE.MathUtils.clamp(terrainHeight(wx,wz)-centerGround,-.28,.28);
    const mechanicalBob=Math.sin(roverRig.suspensionPhase+w.index*1.7+w.side)*.025*Math.min(1,Math.abs(state.speed)/2);
    w.steer.position.y=THREE.MathUtils.lerp(w.steer.position.y,w.baseY+groundDelta+mechanicalBob,.16);
  }
  const leftY=(wheels[0].steer.position.y+wheels[1].steer.position.y+wheels[2].steer.position.y)/3;
  const rightY=(wheels[3].steer.position.y+wheels[4].steer.position.y+wheels[5].steer.position.y)/3;
  roverRig.suspensions[0].position.y=THREE.MathUtils.lerp(roverRig.suspensions[0].position.y,(leftY-.78)*.34,.12);
  roverRig.suspensions[1].position.y=THREE.MathUtils.lerp(roverRig.suspensions[1].position.y,(rightY-.78)*.34,.12);
}
function updateCamera(dt){
  const speedRatio=Math.min(1,Math.abs(state.speed)/DRIVE.boostMax),back=12.8+speedRatio*3+(state.boosting?.7:0),side=5.4+speedRatio*.45,cos=Math.cos(state.heading),sin=Math.sin(state.heading);
  cameraGoal.set(rover.position.x+sin*back+cos*side,rover.position.y+5.25,rover.position.z+cos*back-sin*side);
  camera.position.lerp(cameraGoal,1-Math.pow(.008,dt));camera.fov=THREE.MathUtils.lerp(camera.fov,50+speedRatio*5+(state.boosting?1:0),1-Math.pow(.02,dt));camera.updateProjectionMatrix();cameraLook.set(rover.position.x,rover.position.y+1.75,rover.position.z-.7); camera.lookAt(cameraLook);
}
function updateHUD(){const d=distanceToObjective(),m=missions[state.stage];$('#speed').textContent=Math.abs(state.speed).toFixed(1);$('#speedGauge').classList.toggle('boosting',state.boosting);$('#boostIndicator').textContent=state.boosting?'BOOST 30':'DRIVE 24';$('#boostIndicator').classList.toggle('active',state.boosting);$('#touchBoost').classList.toggle('active',state.boosting); $('#batteryText').textContent=`${Math.ceil(state.battery)}%`; $('#batteryBar').style.width=`${state.battery}%`; $('#batteryBar').style.background=state.battery<25?'#ff6b55':''; $('#distance').textContent=`${Math.round(d)} m`; $('#arrowDistance').textContent=`${Math.round(d)}m`; const targetAngle=Math.atan2(m.x-rover.position.x,m.z-rover.position.z); $('#objectiveArrow').style.transform=`translateX(-50%) rotate(${state.heading-targetAngle}rad)`; drawMap(); }
function drawMap(){const w=map.width,c=w/2,s=.35;mapCtx.clearRect(0,0,w,w);mapCtx.strokeStyle='rgba(175,205,215,.15)';for(let r=25;r<80;r+=25){mapCtx.beginPath();mapCtx.arc(c,c,r,0,Math.PI*2);mapCtx.stroke()}const m=missions[state.stage];mapCtx.fillStyle=['#ffc45b','#55ddff','#ff9f43','#9cff87','#67e8f9'][state.stage];mapCtx.beginPath();mapCtx.arc(c+(m.x-rover.position.x)*s,c+(m.z-rover.position.z)*s,5,0,7);mapCtx.fill();mapCtx.save();mapCtx.translate(c,c);mapCtx.rotate(-state.heading);mapCtx.fillStyle='#67e8f9';mapCtx.beginPath();mapCtx.moveTo(0,-7);mapCtx.lineTo(5,6);mapCtx.lineTo(-5,6);mapCtx.fill();mapCtx.restore();}
function formatTime(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`}
function getState(){const m=missions[Math.min(state.stage,missions.length-1)];return {started:state.started,complete:state.complete,stage:state.stage,stageNumber:state.stage+1,stageName:m.title,phenomenon:m.phenomenon,battery:+state.battery.toFixed(2),speed:+state.speed.toFixed(2),boosting:state.boosting,speedLimits:{normal:DRIVE.normalMax,boost:DRIVE.boostMax,reverse:DRIVE.reverseMax},elapsed:+state.elapsed.toFixed(2),position:{x:+rover.position.x.toFixed(2),z:+rover.position.z.toFixed(2)},distanceToObjective:+distanceToObjective().toFixed(2),failSafes:state.failSafes,briefingOpen:state.briefingOpen,codexOpen:state.codexOpen,transitioning:state.transitioning,discoveredCount:state.discoveries.filter(Boolean).length,discoveries:state.discoveries.map((unlocked,i)=>({title:missions[i].title,unlocked}))};}
function getRoverDebug(){let triangles=0,drawables=0;rover.traverse(o=>{if(!o.isMesh||!o.geometry)return;drawables++;const base=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;triangles+=base*(o.isInstancedMesh?o.count:1);});return {name:rover.name,wheelCount:wheels.length,grouserCount:wheels.length*24,triangles:Math.round(triangles),drawables,wheelSpin:+roverRig.wheelSpin.toFixed(3),steering:+roverRig.steering.toFixed(3),wheelObjects:wheels.map(w=>({name:w.spin.name,spin:+w.spinAngle.toFixed(3),steer:+w.steerAngle.toFixed(3),height:+w.steer.position.y.toFixed(3)})),cameraFov:camera.fov,renderer:{toneMapping:renderer.toneMapping,outputColorSpace:renderer.outputColorSpace,shadowMapSize:2048}};}
function teleportToObjective(){const m=missions[state.stage];rover.position.set(m.x+2,terrainHeight(m.x+2,m.z)+.12,m.z);state.speed=0;updateHUD();return getState();}

function bind(){
  addEventListener('pagehide',shutdownAudio,{once:true});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
  addEventListener('keydown',e=>{if(e.code==='KeyC'&&state.started){state.codexOpen?closeCodex():openCodex();return;}if(e.code==='Escape'&&state.codexOpen){closeCodex();return;}keys[e.code]=true;if(e.code==='KeyE')actionHeld=true;if(e.code==='KeyH')$('#help').classList.remove('hidden');if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault()});
  addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='KeyE')actionHeld=false});
  $('#startBtn').onclick=()=>{initAudio();playSfx('start');startGame(false);};$('#continueBtn').onclick=()=>{initAudio();playSfx('start');startGame(true);};$('#briefingContinue').onclick=()=>{playSfx('ui');closeBriefing();};$('#restartBtn').onclick=()=>reset();
  $('#soundBtn').onclick=()=>toggleMuted();
  $('#codexBtn').onclick=()=>openCodex();$('#endingCodexBtn').onclick=()=>openCodex();$('#closeCodex').onclick=()=>closeCodex();$('#helpBtn').onclick=()=>$('#help').classList.remove('hidden');$('#closeHelp').onclick=()=>$('#help').classList.add('hidden');
  const actionStart=e=>{e.preventDefault();actionHeld=true},actionEnd=e=>{e.preventDefault();actionHeld=false};
  for(const el of [$('#actionBtn'),$('#touchAction')]){el.addEventListener('pointerdown',actionStart);el.addEventListener('pointerup',actionEnd);el.addEventListener('pointercancel',actionEnd);el.addEventListener('pointerleave',actionEnd)}
  document.querySelectorAll('[data-key]').forEach(el=>{const code=el.dataset.key;el.addEventListener('pointerdown',e=>{e.preventDefault();keys[code]=true});for(const ev of ['pointerup','pointercancel','pointerleave'])el.addEventListener(ev,e=>{e.preventDefault();keys[code]=false})});
}

init3D();bind();const hasSave=loadSave();if(hasSave)$('#continueBtn').classList.remove('hidden');updateMissionUI();renderCodex();updateSoundButton();
window.__LUNA12__={getState,getAudioDebug,getRoverDebug,getMissions(){return missions.map(m=>({...m}));},teleportToObjective,performObjective,continueBriefing:closeBriefing,openCodex,closeCodex,setMuted,setBattery(v){state.battery=Math.max(0,Math.min(100,Number(v)));return getState();},start(){startGame(false);return getState();},reset};
window.__LUNA12_READY__=true;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);update(dt);renderer.render(scene,camera)});
