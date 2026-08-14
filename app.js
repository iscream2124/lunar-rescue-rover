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
let roverRig = null;
let actionHeld = false, toastTimer = 0;
const keys = Object.create(null), boulders = [], wheels = [];
const map = $('#mapCanvas'), mapCtx = map.getContext('2d');
const cameraGoal = new THREE.Vector3(), cameraLook = new THREE.Vector3();

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
  const idleTime=performance.now()*.001;
  roverRig.dishPivot.rotation.y=Math.sin(idleTime*.23)*.32;
  roverRig.dishPivot.rotation.x=-.12+Math.sin(idleTime*.17)*.06;
  if(!state.started||state.complete){updateRoverRig(dt,0);updateCamera(dt);return;}
  state.elapsed+=dt;
  const forward=keys.KeyW||keys.ArrowUp, back=keys.KeyS||keys.ArrowDown, left=keys.KeyA||keys.ArrowLeft, right=keys.KeyD||keys.ArrowRight, brake=keys.Space;
  const accel=forward?5.8:back?-4.2:0;
  state.speed += accel*dt; state.speed*=Math.pow(brake?.72:.975,dt*60); state.speed=Math.max(-5,Math.min(11,state.speed)); if(Math.abs(state.speed)<.025)state.speed=0;
  if((left||right)&&Math.abs(state.speed)>.08) state.heading += (left?1:-1)*dt*1.2*Math.sign(state.speed)*Math.min(1,Math.abs(state.speed)/3);
  const oldX=rover.position.x,oldZ=rover.position.z; rover.position.x-=Math.sin(state.heading)*state.speed*dt; rover.position.z-=Math.cos(state.heading)*state.speed*dt;
  rover.position.x=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.x)); rover.position.z=Math.max(-WORLD+8,Math.min(WORLD-8,rover.position.z));
  for(const b of boulders){const dx=rover.position.x-b.x,dz=rover.position.z-b.z,d=Math.hypot(dx,dz);if(d<b.r+1.7){rover.position.x=oldX;rover.position.z=oldZ;state.speed*=-.15;break;}}
  rover.rotation.y=state.heading; rover.position.y=terrainHeight(rover.position.x,rover.position.z)+.12; rover.rotation.z=THREE.MathUtils.lerp(rover.rotation.z,(terrainHeight(rover.position.x+1.5,rover.position.z)-terrainHeight(rover.position.x-1.5,rover.position.z))*.13,.12); rover.rotation.x=THREE.MathUtils.lerp(rover.rotation.x,(terrainHeight(rover.position.x,rover.position.z-1.5)-terrainHeight(rover.position.x,rover.position.z+1.5))*.13,.12);
  updateRoverRig(dt,(left?1:0)-(right?1:0));
  state.battery-=dt*(.035+Math.abs(state.speed)*.017); if(state.battery<=0)failSafe();
  const near=distanceToObjective()<=objectives[state.stage].radius; $('#actionWrap').classList.toggle('hidden',!near); if(actionHeld&&near){state.actionProgress+=dt; if(state.actionProgress>=objectives[state.stage].hold)performObjective();}else state.actionProgress=Math.max(0,state.actionProgress-dt*2.5); $('#actionProgress').style.width=`${Math.min(100,state.actionProgress/objectives[state.stage].hold*100)}%`;
  updateCamera(dt); updateHUD(); if(state.elapsed-lastSave>5){lastSave=state.elapsed;save();}
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
  const back=12.8,side=5.4,cos=Math.cos(state.heading),sin=Math.sin(state.heading);
  cameraGoal.set(rover.position.x+sin*back+cos*side,rover.position.y+5.25,rover.position.z+cos*back-sin*side);
  camera.position.lerp(cameraGoal,1-Math.pow(.008,dt)); cameraLook.set(rover.position.x,rover.position.y+1.75,rover.position.z-.7); camera.lookAt(cameraLook);
}
function updateHUD(){ const d=distanceToObjective(),o=objectives[state.stage]; $('#speed').textContent=Math.abs(state.speed).toFixed(1); $('#batteryText').textContent=`${Math.ceil(state.battery)}%`; $('#batteryBar').style.width=`${state.battery}%`; $('#batteryBar').style.background=state.battery<25?'#ff6b55':''; $('#distance').textContent=`${Math.round(d)} m`; $('#arrowDistance').textContent=`${Math.round(d)}m`; const targetAngle=Math.atan2(o.x-rover.position.x,o.z-rover.position.z); $('#objectiveArrow').style.transform=`translateX(-50%) rotate(${state.heading-targetAngle}rad)`; drawMap(); }
function drawMap(){const w=map.width,c=w/2,s=.35;mapCtx.clearRect(0,0,w,w);mapCtx.strokeStyle='rgba(175,205,215,.15)';for(let r=25;r<80;r+=25){mapCtx.beginPath();mapCtx.arc(c,c,r,0,Math.PI*2);mapCtx.stroke()}const o=objectives[state.stage];mapCtx.fillStyle='#ffc45b';mapCtx.beginPath();mapCtx.arc(c+(o.x-rover.position.x)*s,c+(o.z-rover.position.z)*s,5,0,7);mapCtx.fill();mapCtx.save();mapCtx.translate(c,c);mapCtx.rotate(-state.heading);mapCtx.fillStyle='#67e8f9';mapCtx.beginPath();mapCtx.moveTo(0,-7);mapCtx.lineTo(5,6);mapCtx.lineTo(-5,6);mapCtx.fill();mapCtx.restore();}
function formatTime(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`}
function getState(){return {started:state.started,complete:state.complete,stage:state.stage,stageName:objectives[Math.min(state.stage,2)].name,battery:+state.battery.toFixed(2),speed:+state.speed.toFixed(2),elapsed:+state.elapsed.toFixed(2),position:{x:+rover.position.x.toFixed(2),z:+rover.position.z.toFixed(2)},distanceToObjective:+distanceToObjective().toFixed(2),failSafes:state.failSafes};}
function getRoverDebug(){let triangles=0,drawables=0;rover.traverse(o=>{if(!o.isMesh||!o.geometry)return;drawables++;const base=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;triangles+=base*(o.isInstancedMesh?o.count:1);});return {name:rover.name,wheelCount:wheels.length,grouserCount:wheels.length*24,triangles:Math.round(triangles),drawables,wheelSpin:+roverRig.wheelSpin.toFixed(3),steering:+roverRig.steering.toFixed(3),wheelObjects:wheels.map(w=>({name:w.spin.name,spin:+w.spinAngle.toFixed(3),steer:+w.steerAngle.toFixed(3),height:+w.steer.position.y.toFixed(3)})),cameraFov:camera.fov,renderer:{toneMapping:renderer.toneMapping,outputColorSpace:renderer.outputColorSpace,shadowMapSize:2048}};}
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
window.__LUNA12__={getState,getRoverDebug,teleportToObjective,performObjective,setBattery(v){state.battery=Math.max(0,Math.min(100,Number(v)));return getState();},start(){startGame(false);return getState();},reset};
window.__LUNA12_READY__=true;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);update(dt);renderer.render(scene,camera)});
