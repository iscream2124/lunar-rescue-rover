import * as THREE from './vendor/three/three.module.js';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'luna12-save-v1';
const WORLD = 210;
const objectives = [
  { name: '스캔 구역으로 이동', detail: '노란 표식 안에서 E를 길게 눌러 얼음 신호를 탐색하십시오.', action: '얼음 신호 스캔', x: -54, z: -38, radius: 10, hold: 2.2 },
  { name: '빙하 표본 지점으로 이동', detail: '청록색 신호원에서 코어 드릴을 가동하십시오.', action: '코어 시추', x: 61, z: -63, radius: 8, hold: 2.6 },
  { name: '중계 지점으로 이동', detail: '능선 위의 중계점에 통신 비콘을 설치하십시오.', action: '비콘 설치', x: 70, z: 66, radius: 9, hold: 2.4 }
];
const state = { started: false, complete: false, stage: 0, battery: 100, speed: 0, heading: 0, elapsed: 0, actionProgress: 0, failSafes: 0 };
let scene, camera, renderer, rover, marker, markerBeam, clock, lastSave = 0;
let actionHeld = false, toastTimer = 0;
const keys = Object.create(null), boulders = [], wheels = [];
const map = $('#mapCanvas'), mapCtx = map.getContext('2d');

function terrainHeight(x, z) {
  const broad = Math.sin(x * .045) * 2.1 + Math.cos(z * .052) * 1.7 + Math.sin((x + z) * .023) * 2.4;
  const crater = (cx, cz, r, depth) => { const d = Math.hypot(x - cx, z - cz) / r; return d < 1 ? -depth * (1 - d * d) + (d > .72 ? depth * .28 * Math.sin((d - .72) / .28 * Math.PI) : 0) : 0; };
  return broad + crater(-30, 25, 30, 7) + crater(45, -32, 24, 5) + crater(-72, -65, 18, 3);
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020407);
  scene.fog = new THREE.FogExp2(0x070b0f, .0055);
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 700);
  renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0x6b7e91, 0x08090a, .42));
  const sun = new THREE.DirectionalLight(0xffe5bc, 2.2);
  sun.position.set(-75, 90, -45); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -120; sun.shadow.camera.right = sun.shadow.camera.top = 120;
  scene.add(sun);

  const seg = 96, geo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x73777a, roughness: 1, metalness: .02, flatShading: true }));
  terrain.receiveShadow = true; scene.add(terrain);

  createStars(); createBoulders(); rover = createRover(); scene.add(rover); createMarker();
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
    if (objectives.some(o => Math.hypot(x-o.x,z-o.z)<15) || Math.hypot(x,z)<12) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat); rock.position.set(x,terrainHeight(x,z)+r*.65,z); rock.scale.y=.65+rand()*.5; rock.rotation.set(rand()*2,rand()*2,rand()*2); rock.castShadow=rock.receiveShadow=true; scene.add(rock); boulders.push({x,z,r:r*.9});
  }
}

function box(w,h,d,mat) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.castShadow=m.receiveShadow=true; return m; }
function createRover() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({color:0xd5d9d6,roughness:.65,metalness:.25}), dark = new THREE.MeshStandardMaterial({color:0x171b1d,roughness:.8}), gold = new THREE.MeshStandardMaterial({color:0xc68b2d,roughness:.45,metalness:.55}), cyan = new THREE.MeshStandardMaterial({color:0x5cf0ed,emissive:0x0d5257});
  const body=box(3.5,1.1,4.6,white); body.position.y=1.7; g.add(body);
  const deck=box(3, .28, 2.7, gold); deck.position.set(0,2.38,-.25); g.add(deck);
  const mast=box(.28,2.3,.28,dark); mast.position.set(0,3.45,-.4); g.add(mast);
  const head=box(1.1,.55,.65,white); head.position.set(0,4.55,-.4); g.add(head);
  const eye=box(.5,.16,.08,cyan); eye.position.set(0,4.55,-.74); g.add(eye);
  const dish=new THREE.Mesh(new THREE.CylinderGeometry(.1,1.05,.24,24,1,true),white); dish.rotation.x=Math.PI/2; dish.position.set(0,3.1,1.3); dish.castShadow=true; g.add(dish);
  const tireGeo=new THREE.CylinderGeometry(.75,.75,.52,14), tireMat=new THREE.MeshStandardMaterial({color:0x17191a,roughness:1,flatShading:true});
  for(const x of [-2,2]) for(const z of [-1.55,1.55]) { const arm=box(Math.abs(x)*.68,.16,.16,dark); arm.position.set(x*.58,1,z); g.add(arm); const wheel=new THREE.Mesh(tireGeo,tireMat); wheel.rotation.z=Math.PI/2; wheel.position.set(x,.82,z); wheel.castShadow=true; wheels.push(wheel); g.add(wheel); }
  const tail=new THREE.PointLight(0xff9e3d,1.5,8); tail.position.set(0,2.1,2.4); g.add(tail); return g;
}

function createMarker() {
  marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(7.3,7.8,48),new THREE.MeshBasicMaterial({color:0xffc45b,transparent:true,opacity:.8,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=.15; marker.add(ring);
  markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(.22,1.8,15,16,1,true),new THREE.MeshBasicMaterial({color:0xffc45b,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false})); markerBeam.position.y=7.5; marker.add(markerBeam); scene.add(marker); updateMarker();
}
function updateMarker(){ const o=objectives[Math.min(state.stage,2)]; marker.position.set(o.x,terrainHeight(o.x,o.z),o.z); }

function loadSave() { try { const s=JSON.parse(localStorage.getItem(SAVE_KEY)); if(s && Number.isInteger(s.stage) && s.stage>=0 && s.stage<3){ state.stage=s.stage; state.battery=Math.max(10,Math.min(100,s.battery||100)); state.elapsed=s.elapsed||0; rover.position.set(s.x||0,0,s.z||0); state.heading=s.heading||0; rover.rotation.y=state.heading; return true; } } catch {} return false; }
function save(){ if(!state.started||state.complete)return; localStorage.setItem(SAVE_KEY,JSON.stringify({stage:state.stage,battery:state.battery,elapsed:state.elapsed,x:rover.position.x,z:rover.position.z,heading:state.heading})); }
function reset(){ localStorage.removeItem(SAVE_KEY); Object.assign(state,{started:false,complete:false,stage:0,battery:100,speed:0,heading:0,elapsed:0,actionProgress:0,failSafes:0}); rover.position.set(0,0,0); rover.rotation.y=0; updateMarker(); updateMissionUI(); $('#ending').classList.add('hidden'); $('#start').classList.remove('hidden'); $('#continueBtn').classList.add('hidden'); setGameHud(false); return getState(); }
function startGame(useSave=false){ if(!useSave){ localStorage.removeItem(SAVE_KEY); Object.assign(state,{stage:0,battery:100,speed:0,heading:0,elapsed:0,actionProgress:0,complete:false}); rover.position.set(0,0,0); rover.rotation.y=0; } state.started=true; $('#start').classList.add('hidden'); setGameHud(true); updateMarker(); updateMissionUI(); toast('LUNA-12 연결 완료 · 목표 표식을 따라가십시오'); }
function setGameHud(on){ ['#topbar','#mission','#telemetry','#minimap','#objectiveArrow'].forEach(s=>$(s).classList.toggle('hidden',!on)); $('#touch').classList.toggle('active',on); }

function updateMissionUI(){ const o=objectives[Math.min(state.stage,2)]; $('#stageNum').textContent=String(state.stage+1).padStart(2,'0'); $('#missionTitle').textContent=o.name; $('#missionText').textContent=o.detail; $('#actionLabel').textContent=`E 길게 눌러 ${o.action}`; }
function distanceToObjective(){const o=objectives[Math.min(state.stage,2)];return Math.hypot(rover.position.x-o.x,rover.position.z-o.z)}
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600); }

function performObjective(){ if(!state.started||state.complete)return false; const o=objectives[state.stage]; if(distanceToObjective()>o.radius){toast('목표 구역 안으로 이동하십시오');return false;} state.actionProgress=0; if(state.stage===0) toast('얼음 반사 신호 확인 · 표본 좌표가 표시됩니다'); else if(state.stage===1) toast('빙하 코어 확보 · 중계 지점으로 이동하십시오'); else { completeMission(); return true; } state.stage++; state.battery=Math.min(100,state.battery+10); updateMarker(); updateMissionUI(); save(); return true; }
function completeMission(){ state.complete=true; state.speed=0; localStorage.removeItem(SAVE_KEY); setTimeout(()=>{setGameHud(false);$('#actionWrap').classList.add('hidden');$('#ending').classList.remove('hidden');$('#finalTime').textContent=formatTime(state.elapsed);},500); }
function failSafe(){ state.failSafes++; state.battery=35; state.speed=0; const o=objectives[state.stage]; const a=Math.atan2(o.x,o.z); rover.position.set(o.x-Math.sin(a)*18,0,o.z-Math.cos(a)*18); toast('비상 전력 가동 · 안전 지점으로 복귀했습니다'); save(); }

function update(dt){
  marker.rotation.y += dt*.45; markerBeam.material.opacity=.1+Math.sin(performance.now()*.003)*.045;
  if(!state.started||state.complete){updateCamera(dt);return;}
  state.elapsed+=dt;
  const forward=keys.KeyW||keys.ArrowUp, back=keys.KeyS||keys.ArrowDown, left=keys.KeyA||keys.ArrowLeft, right=keys.KeyD||keys.ArrowRight, brake=keys.Space;
  const accel=forward?5.8:back?-4.2:0;
  state.speed += accel*dt; state.speed*=Math.pow(brake?.72:.975,dt*60); state.speed=Math.max(-5,Math.min(11,state.speed)); if(Math.abs(state.speed)<.025)state.speed=0;
  if((left||right)&&Math.abs(state.speed)>.08) state.heading += (left?1:-1)*dt*1.2*Math.sign(state.speed)*Math.min(1,Math.abs(state.speed)/3);
  const oldX=rover.position.x,oldZ=rover.position.z; rover.position.x-=Math.sin(state.heading)*state.speed*dt; rover.position.z-=Math.cos(state.heading)*state.speed*dt;
  rover.position.x=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.x)); rover.position.z=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.z));
  for(const b of boulders){const dx=rover.position.x-b.x,dz=rover.position.z-b.z,d=Math.hypot(dx,dz);if(d<b.r+1.7){rover.position.x=oldX;rover.position.z=oldZ;state.speed*=-.15;break;}}
  rover.rotation.y=state.heading; rover.position.y=terrainHeight(rover.position.x,rover.position.z)+.12; rover.rotation.z=THREE.MathUtils.lerp(rover.rotation.z,(terrainHeight(rover.position.x+1.5,rover.position.z)-terrainHeight(rover.position.x-1.5,rover.position.z))*.13,.12); rover.rotation.x=THREE.MathUtils.lerp(rover.rotation.x,(terrainHeight(rover.position.x,rover.position.z-1.5)-terrainHeight(rover.position.x,rover.position.z+1.5))*.13,.12);
  wheels.forEach(w=>w.rotation.x+=state.speed*dt/0.75);
  state.battery-=dt*(.035+Math.abs(state.speed)*.017); if(state.battery<=0)failSafe();
  const near=distanceToObjective()<=objectives[state.stage].radius; $('#actionWrap').classList.toggle('hidden',!near); if(actionHeld&&near){state.actionProgress+=dt; if(state.actionProgress>=objectives[state.stage].hold)performObjective();}else state.actionProgress=Math.max(0,state.actionProgress-dt*2.5); $('#actionProgress').style.width=`${Math.min(100,state.actionProgress/objectives[state.stage].hold*100)}%`;
  updateCamera(dt); updateHUD(); if(state.elapsed-lastSave>5){lastSave=state.elapsed;save();}
}

function updateCamera(dt){ const behind=new THREE.Vector3(Math.sin(state.heading)*11,7.5,Math.cos(state.heading)*11).add(rover.position); camera.position.lerp(behind,1-Math.pow(.005,dt)); const look=rover.position.clone().add(new THREE.Vector3(0,2,0)); camera.lookAt(look); }
function updateHUD(){ const d=distanceToObjective(),o=objectives[state.stage]; $('#speed').textContent=Math.abs(state.speed).toFixed(1); $('#batteryText').textContent=`${Math.ceil(state.battery)}%`; $('#batteryBar').style.width=`${state.battery}%`; $('#batteryBar').style.background=state.battery<25?'#ff6b55':''; $('#distance').textContent=`${Math.round(d)} m`; $('#arrowDistance').textContent=`${Math.round(d)}m`; const targetAngle=Math.atan2(o.x-rover.position.x,o.z-rover.position.z); $('#objectiveArrow').style.transform=`translateX(-50%) rotate(${state.heading-targetAngle}rad)`; drawMap(); }
function drawMap(){const w=map.width,c=w/2,s=.35;mapCtx.clearRect(0,0,w,w);mapCtx.strokeStyle='rgba(175,205,215,.15)';for(let r=25;r<80;r+=25){mapCtx.beginPath();mapCtx.arc(c,c,r,0,Math.PI*2);mapCtx.stroke()}const o=objectives[state.stage];mapCtx.fillStyle='#ffc45b';mapCtx.beginPath();mapCtx.arc(c+(o.x-rover.position.x)*s,c+(o.z-rover.position.z)*s,5,0,7);mapCtx.fill();mapCtx.save();mapCtx.translate(c,c);mapCtx.rotate(-state.heading);mapCtx.fillStyle='#67e8f9';mapCtx.beginPath();mapCtx.moveTo(0,-7);mapCtx.lineTo(5,6);mapCtx.lineTo(-5,6);mapCtx.fill();mapCtx.restore();}
function formatTime(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`}
function getState(){return {started:state.started,complete:state.complete,stage:state.stage,stageName:objectives[Math.min(state.stage,2)].name,battery:+state.battery.toFixed(2),speed:+state.speed.toFixed(2),elapsed:+state.elapsed.toFixed(2),position:{x:+rover.position.x.toFixed(2),z:+rover.position.z.toFixed(2)},distanceToObjective:+distanceToObjective().toFixed(2),failSafes:state.failSafes};}
function teleportToObjective(){const o=objectives[state.stage];rover.position.set(o.x+2,terrainHeight(o.x+2,o.z),o.z);state.speed=0;updateHUD();return getState();}

function bind(){
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
  addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE')actionHeld=true;if(e.code==='KeyH')$('#help').classList.remove('hidden');if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault()});
  addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='KeyE')actionHeld=false});
  $('#startBtn').onclick=()=>startGame(false); $('#continueBtn').onclick=()=>startGame(true); $('#restartBtn').onclick=()=>reset(); $('#helpBtn').onclick=()=>$('#help').classList.remove('hidden'); $('#closeHelp').onclick=()=>$('#help').classList.add('hidden');
  const actionStart=e=>{e.preventDefault();actionHeld=true},actionEnd=e=>{e.preventDefault();actionHeld=false};
  for(const el of [$('#actionBtn'),$('#touchAction')]){el.addEventListener('pointerdown',actionStart);el.addEventListener('pointerup',actionEnd);el.addEventListener('pointercancel',actionEnd);el.addEventListener('pointerleave',actionEnd)}
  document.querySelectorAll('[data-key]').forEach(el=>{const code=el.dataset.key;el.addEventListener('pointerdown',e=>{e.preventDefault();keys[code]=true});for(const ev of ['pointerup','pointercancel','pointerleave'])el.addEventListener(ev,e=>{e.preventDefault();keys[code]=false})});
}

init3D(); bind(); const hasSave=loadSave(); if(hasSave)$('#continueBtn').classList.remove('hidden'); updateMissionUI();
window.__LUNA12__={getState,teleportToObjective,performObjective,setBattery(v){state.battery=Math.max(0,Math.min(100,Number(v)));return getState();},start(){startGame(false);return getState();},reset};
window.__LUNA12_READY__=true;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);update(dt);renderer.render(scene,camera)});
