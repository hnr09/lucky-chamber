// 3D 테이블 씬 (Three.js). 게임 규칙은 모르고, 상태를 그리고 이벤트를 연출만 한다.
// 레트로 로우폴리 스타일: 저해상도 렌더 → 픽셀 확대, 플랫 셰이딩, 안개, 흔들리는 전등.
import * as THREE from 'three';
import { CHIPS } from '../core/chips.js';
import { CHARMS } from '../core/charms.js';
import { CONFIG } from '../core/config.js';

const PIXEL_SCALE = 3; // 클수록 더 도트처럼 보인다
const HOLD = {
  player: new THREE.Vector3(0.32, 1.3, 1.1),
  dealer: new THREE.Vector3(-0.25, 1.28, -1.05),
};
const AIM = {
  dealer: new THREE.Vector3(0, 1.95, -1.55),   // 딜러 머리
  player: new THREE.Vector3(0, 1.75, 2.3),     // 카메라(나)
};
const REST_POS = new THREE.Vector3(0.1, 0.99, -0.3);
const REST_LOOK = new THREE.Vector3(1.5, 0.99, -0.45);

// 카메라 위치: 테이블에 앉음 / 일어나서 왼쪽 벽 전화 / 오른쪽 상점 진열장 / 사망
const POSES = {
  table: { pos: new THREE.Vector3(0, 1.78, 2.2), look: new THREE.Vector3(0, 1.16, -1.2) },
  phone: { pos: new THREE.Vector3(-1.2, 1.85, 1.9), look: new THREE.Vector3(-3.3, 1.25, 0.7) },
  shop:  { pos: new THREE.Vector3(0.9, 1.85, 1.9), look: new THREE.Vector3(3.1, 1.3, 1.25) },
  dead:  { pos: new THREE.Vector3(0.5, 1.05, 2.0), look: new THREE.Vector3(-0.4, 1.6, 0.3) },
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

export function createScene(canvas, { onChipClick, onHurt, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070506);
  scene.fog = new THREE.Fog(0x070506, 3.2, 10);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 40);
  const camPos = POSES.table.pos.clone();
  const camLook = POSES.table.look.clone();
  let pose = 'table';

  // ── 조명 ──
  scene.add(new THREE.AmbientLight(0x3a2c34, 1.1));
  const lamp = new THREE.SpotLight(0xffd29a, 30, 0, Math.PI / 4.2, 0.55, 1.6);
  lamp.position.set(0, 2.5, -0.2);
  lamp.target.position.set(0, 0.9, -0.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp, lamp.target);
  const rim = new THREE.PointLight(0xff2a18, 2.5, 6, 1.6);
  rim.position.set(0, 2.2, -3.2);
  scene.add(rim);
  // 딜러 얼굴을 비추는 약한 보조광 (없으면 실루엣만 보인다)
  const fill = new THREE.PointLight(0xffd8b0, 1.6, 3.2, 1.4);
  fill.position.set(0, 2.1, -0.3);
  scene.add(fill);
  // 아래에서 비추는 붉은 빛: 얼굴에 그림자가 위로 진다
  const under = new THREE.PointLight(0xff2a14, 0.9, 1.6, 1.8);
  under.position.set(0, 1.2, -1.15);
  scene.add(under);
  const flash = new THREE.PointLight(0xffa040, 0, 6, 1.5);
  scene.add(flash);

  // ── 방 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), mat(0x1b1311));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = mat(0x1a1416);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
  back.position.set(0, 3, -3.6);
  scene.add(back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallMat);
    w.position.set(side * 3.4, 3, 0);
    w.rotation.y = -side * Math.PI / 2;
    scene.add(w);
  }

  // ── 테이블 ──
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 2.3), mat(0x4a2b18));
  top.position.y = 0.86;
  const felt = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.02, 2.0), mat(0x1d4636));
  felt.position.y = 0.93;
  felt.receiveShadow = true;
  table.add(top, felt);
  for (const [x, z] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), mat(0x3a2112));
    leg.position.set(x, 0.4, z);
    table.add(leg);
  }
  scene.add(table);

  // ── 전등 ──
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), mat(0x111111));
  cord.position.set(0, 3.15, -0.2);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.32, 8, 1, true), mat(0x2b3a2c, { side: THREE.DoubleSide }));
  shade.position.set(0, 2.55, -0.2);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
  bulb.position.set(0, 2.45, -0.2);
  scene.add(cord, shade, bulb);

  // ── 딜러: 길쭉한 해골 얼굴, 퀭한 눈구멍, 이빨, 긴 손가락, 누더기 두건 ──
  const dealer = new THREE.Group();
  dealer.position.set(0, 0, -1.55);
  const coat = mat(0x0e0b10);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 1.25, 6), coat);
  torso.position.y = 1.15;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.36), coat);
  shoulders.position.y = 1.7;
  shoulders.rotation.z = 0.04;
  const boneMat = mat(0xb9b29c, { emissive: 0x000000 });
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x020102 });
  const toothMat = mat(0xe3d9b4);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0xff2414 });

  const head = new THREE.Group();
  head.position.set(0, 2.02, 0.02);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), boneMat);
  skull.scale.set(0.88, 1.38, 0.95);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.17), boneMat);
  jaw.position.set(0, -0.3, 0.05);
  const cheeks = [-0.12, 0.12].map((x) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.08), boneMat);
    c.position.set(x, -0.05, 0.17);
    return c;
  });
  const sockets = [-0.085, 0.085].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.068, 7, 5), voidMat);
    e.position.set(x, 0.06, 0.18);
    e.scale.set(1, 1.2, 0.55);
    return e;
  });
  const pupils = [-0.085, 0.085].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), pupilMat);
    e.position.set(x, 0.05, 0.215);
    return e;
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 3), voidMat);
  nose.position.set(0, -0.07, 0.215);
  nose.rotation.x = Math.PI;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.03), voidMat);
  mouth.position.set(0, -0.2, 0.19);
  const teeth = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.13 + i * 0.0325;
    const curve = Math.abs(x) * 0.35;
    for (const [y, h] of [[-0.175, 0.03], [-0.228, 0.026]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.024, h, 0.02), toothMat);
      t.position.set(x, y + curve * (y > -0.2 ? 1 : -1) * 0.2, 0.2 - curve * 0.25);
      teeth.push(t);
    }
  }
  // 누더기 두건 (뒤쪽 반구 + 늘어진 천)
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 6, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.62), coat);
  hood.scale.set(1, 1.35, 1.05);
  hood.position.set(0, 0.06, -0.05);
  const drape = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 6, 1, true), coat);
  drape.position.set(0, -0.35, -0.08);
  head.add(skull, jaw, ...cheeks, ...sockets, ...pupils, nose, mouth, ...teeth, hood, drape);

  // 긴 팔과 테이블을 짚은 손가락
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.95, 5), coat);
    arm.position.set(side * 0.5, 1.33, 0.25);
    arm.rotation.x = 0.95;
    arm.rotation.z = side * -0.15;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.12), boneMat);
    palm.position.set(side * 0.56, 0.975, 0.62);
    arms.push(arm, palm);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Group();
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.2), boneMat);
      seg.position.z = 0.1;
      finger.add(seg);
      finger.position.set(side * 0.56 + (f - 1.5) * 0.032, 0.98, 0.67);
      finger.rotation.y = (f - 1.5) * 0.18 * side;
      finger.rotation.x = 0.12;
      arms.push(finger);
    }
  }
  dealer.add(torso, shoulders, head, ...arms);
  dealer.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(dealer);
  const headMat = boneMat;
  const twitch = { t: 0, z: 0, y: 0 };

  // ── 벽 모니터 (점수판) ──
  const monCanvas = document.createElement('canvas');
  monCanvas.width = 192; monCanvas.height = 112;
  const monCtx = monCanvas.getContext('2d');
  const monTex = new THREE.CanvasTexture(monCanvas);
  monTex.magFilter = THREE.NearestFilter;
  monTex.minFilter = THREE.NearestFilter;
  monTex.colorSpace = THREE.SRGBColorSpace;
  const monitor = new THREE.Group();
  const casing = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 0.35), mat(0x2a2622));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.63), new THREE.MeshBasicMaterial({ map: monTex }));
  screen.position.z = 0.18;
  monitor.add(casing, screen);
  monitor.position.set(1.45, 2.05, -3.3);
  monitor.rotation.y = -0.25;
  scene.add(monitor);
  const monGlow = new THREE.PointLight(0x40ff90, 1.2, 3, 2);
  monGlow.position.set(1.3, 2.1, -2.8);
  scene.add(monGlow);

  // ── 벽 전화기 (왼쪽 벽) ──
  const phone = new THREE.Group();
  const bakelite = mat(0x141010, { roughness: 0.35, metalness: 0.3 });
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.3), bakelite);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mat(0xd8ccaa, { metalness: 0.2 }));
  dial.rotation.z = Math.PI / 2;
  dial.position.set(0.08, -0.04, 0);
  const handset = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), bakelite);
  const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), bakelite);
  ear.position.y = 0.2;
  const mouthPiece = ear.clone();
  mouthPiece.position.y = -0.2;
  handset.add(grip, ear, mouthPiece);
  handset.position.set(0.12, 0.05, 0.14);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0x330000 }));
  bell.position.set(0.08, 0.16, 0);
  // 위쪽 황동 종 두 개 + 나무 받침판
  const brassBell = mat(0xc89a3c, { metalness: 0.8, roughness: 0.3 });
  const bells = [-0.08, 0.08].map((z) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), brassBell);
    b.rotation.z = -Math.PI / 2;
    b.position.set(0.07, 0.26, z);
    return b;
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.45), mat(0x3a2414));
  board.position.set(-0.08, 0, 0);
  const dialFace = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: 0x1a1210 }));
  dialFace.rotation.y = Math.PI / 2;
  dialFace.position.set(0.097, -0.04, 0);
  phone.add(board, phoneBody, dial, dialFace, handset, bell, ...bells);
  phone.scale.setScalar(1.35);
  phone.position.set(-3.32, 1.5, 0.75);
  scene.add(phone);
  // 전화기를 비추는 작은 벽등
  const sconce = new THREE.PointLight(0xffc890, 1.4, 2.4, 1.6);
  sconce.position.set(-3.0, 2.2, 0.75);
  scene.add(sconce);
  const phoneLight = new THREE.PointLight(0xffb070, 0, 1.6, 2);
  phoneLight.position.set(-3.0, 1.7, 0.75);
  scene.add(phoneLight);

  // ── 상점 진열장 (오른쪽 벽) ──
  const cabinet = new THREE.Group();
  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 1.1), mat(0x1c1612));
  cabBody.position.y = 1.05;
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 128; signCanvas.height = 32;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#1a0500'; sg.fillRect(0, 0, 128, 32);
  sg.fillStyle = '#ffb030'; sg.font = 'bold 22px monospace'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('· 상 점 ·', 64, 17);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.magFilter = THREE.NearestFilter;
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(-0.31, 1.95, 0);
  sign.rotation.y = -Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshBasicMaterial({ color: 0x2a3a20, transparent: true, opacity: 0.35 }));
  glass.position.set(-0.31, 1.1, 0);
  glass.rotation.y = -Math.PI / 2;
  cabinet.add(cabBody, sign, glass);
  // 진열된 칩 더미와 상자들
  const shelfColors = ['#d9443a', '#3f7fd9', '#f2c14e', '#1c1c1c', '#9fe3f0', '#4fbf72'];
  for (let row = 0; row < 3; row++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.95), mat(0x3a2a1a));
    shelf.position.set(-0.05, 0.6 + row * 0.42, 0);
    cabinet.add(shelf);
    for (let k = 0; k < 4; k++) {
      const item = row === 1
        ? new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), mat(0x6a4a8a))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03 * (2 + k), 10), mat(shelfColors[(row * 4 + k) % shelfColors.length]));
      item.position.set(-0.1, 0.62 + row * 0.42 + (row === 1 ? 0.08 : 0.015 * (2 + k)), -0.33 + k * 0.22);
      cabinet.add(item);
    }
  }
  cabinet.position.set(3.05, 0, 0.15);
  scene.add(cabinet);
  const cabLight = new THREE.PointLight(0xffb040, 0.6, 3, 1.5);
  cabLight.position.set(2.5, 1.9, 0.15);
  scene.add(cabLight);

  // ── 부적 받침 (테이블 위, 왼쪽부터 발동 순서) ──
  const charmsGroup = new THREE.Group();
  scene.add(charmsGroup);
  const charmTexCache = {};
  function charmTexture(id) {
    if (charmTexCache[id]) return charmTexCache[id];
    const def = CHARMS[id];
    const c = document.createElement('canvas');
    c.width = 48; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = def.rare ? '#3a1028' : '#2a2016'; g.fillRect(0, 0, 48, 64);
    g.strokeStyle = def.rare ? '#ff8ac6' : '#c9a24a'; g.lineWidth = 3; g.strokeRect(2, 2, 44, 60);
    g.font = '24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(def.icon, 24, 26);
    g.fillStyle = '#efe3c8'; g.font = 'bold 9px sans-serif';
    g.fillText(def.name, 24, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    charmTexCache[id] = tex;
    return tex;
  }
  let charmMeshes = [];
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x0f2a20 });
  function rebuildCharms(charms) {
    charmsGroup.clear();
    charmMeshes = [];
    const spacing = 0.21;
    for (let i = 0; i < CONFIG.maxCharms; i++) {
      const x = (i - (CONFIG.maxCharms - 1) / 2) * spacing;
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.08), slotMat);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(x, 0.942, 0.12);
      charmsGroup.add(slot);
      const id = charms[i];
      if (!id) continue;
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.025), [
        mat(0x2a2016), mat(0x2a2016), mat(0x2a2016), mat(0x2a2016),
        new THREE.MeshStandardMaterial({ map: charmTexture(id), roughness: 0.7 }), mat(0x2a2016),
      ]);
      plaque.position.set(x, 1.045, 0.12);
      plaque.rotation.x = -0.35;
      plaque.castShadow = true;
      plaque.userData = { kind: 'charm', id, index: i };
      charmsGroup.add(plaque);
      charmMeshes.push(plaque);
    }
  }

  // ── 산탄총 (총구가 +z 방향이라 lookAt으로 조준) ──
  const gun = new THREE.Group();
  const steel = mat(0x55595e, { metalness: 0.6, roughness: 0.4 });
  const wood = mat(0x5a3418);
  for (const x of [-0.035, 0.035]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, 0, 0.3);
    gun.add(barrel);
  }
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.3), steel);
  receiver.position.z = -0.25;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.5), wood);
  stock.position.set(0, -0.04, -0.62);
  stock.rotation.x = 0.12;
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.25), wood);
  pump.position.set(0, -0.06, 0.15);
  gun.add(receiver, stock, pump);
  gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const muzzle = new THREE.Object3D();
  muzzle.position.z = 0.75;
  gun.add(muzzle);
  const flashSprite = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0 }));
  muzzle.add(flashSprite);
  scene.add(gun);
  const aimHelper = new THREE.Object3D();
  function aimQuat(from, to) {
    aimHelper.position.copy(from);
    aimHelper.lookAt(to);
    return aimHelper.quaternion.clone();
  }
  const restQuat = aimQuat(REST_POS, REST_LOOK);
  gun.position.copy(REST_POS);
  gun.quaternion.copy(restQuat);

  // ── 탄 / 칩 그룹 (상태가 바뀔 때마다 다시 만든다) ──
  const shellsGroup = new THREE.Group();
  const chipsGroup = new THREE.Group();
  const pouchGroup = new THREE.Group();
  scene.add(shellsGroup, chipsGroup, pouchGroup);
  const shellGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.15, 8);
  const brassGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.04, 8);
  const brass = mat(0xc89a3c, { metalness: 0.7, roughness: 0.35 });
  const shellMats = { hidden: mat(0x3a3434), live: mat(0xb3261e), blank: mat(0x2c5d9e) };

  const chipGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.04, 20);
  const chipMatCache = {};
  function chipMaterials(type) {
    if (chipMatCache[type]) return chipMatCache[type];
    const def = CHIPS[type];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = def.color; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 5; g.setLineDash([7, 6]);
    g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.fillStyle = '#00000055';
    g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
    g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(def.icon, 32, 34);
    const topTex = new THREE.CanvasTexture(c);
    topTex.magFilter = THREE.NearestFilter;
    topTex.colorSpace = THREE.SRGBColorSpace;
    const side = document.createElement('canvas');
    side.width = 64; side.height = 8;
    const sg = side.getContext('2d');
    sg.fillStyle = def.color; sg.fillRect(0, 0, 64, 8);
    sg.fillStyle = '#ffffffcc';
    for (let x = 0; x < 64; x += 16) sg.fillRect(x, 0, 6, 8);
    const sideTex = new THREE.CanvasTexture(side);
    sideTex.magFilter = THREE.NearestFilter;
    sideTex.colorSpace = THREE.SRGBColorSpace;
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.6 });
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.6 });
    chipMatCache[type] = [sideMat, topMat, topMat];
    return chipMatCache[type];
  }

  let chipMeshes = [];

  function rebuildShells(duel) {
    shellsGroup.clear();

    duel.shells.forEach((_, i) => {
      const known = i === 0 && duel.knownCurrent !== null;
      const m = known ? (duel.knownCurrent ? shellMats.live : shellMats.blank) : shellMats.hidden;
      const s = new THREE.Group();
      const body = new THREE.Mesh(shellGeo, m);
      const base = new THREE.Mesh(brassGeo, brass);
      base.position.y = -0.09;
      s.add(body, base);
      s.position.set((i - (duel.shells.length - 1) / 2) * 0.1, 1.05, -0.5);
      if (i === 0) s.position.y += 0.03;
      s.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      shellsGroup.add(s);
    });
    // 사용한 탄은 옆으로 눕혀서 공개
    duel.spent.forEach((live, i) => {
      const s = new THREE.Group();
      const body = new THREE.Mesh(shellGeo, live ? shellMats.live : shellMats.blank);
      const base = new THREE.Mesh(brassGeo, brass);
      base.position.y = -0.09;
      s.add(body, base);
      s.rotation.z = Math.PI / 2;
      s.rotation.y = (i * 0.7) % 1 - 0.5;
      s.position.set(-0.75 + (i % 4) * 0.13, 0.97, -0.3 - Math.floor(i / 4) * 0.12);
      shellsGroup.add(s);
    });
  }

  function rebuildChips(pouch, selected) {
    chipsGroup.clear();
    chipMeshes = [];
    const hand = pouch.hand;
    const spacing = 0.27;
    const x0 = -((hand.length - 1) * spacing) / 2;
    hand.forEach((chip, i) => {
      const m = new THREE.Mesh(chipGeo, chipMaterials(chip.type));
      const sel = selected === i;
      m.position.set(x0 + i * spacing, sel ? 1.06 : 0.96, 0.42);
      m.rotation.x = sel ? 0.6 : 0;
      m.castShadow = true;
      m.userData = { kind: 'chip', id: chip.type, index: i };
      chipsGroup.add(m);
      chipMeshes.push(m);
    });
    // 주머니: 남은 칩 개수만큼 쌓인 더미
    pouchGroup.clear();
    const stackMat = mat(0x6a5a50);
    for (let i = 0; i < pouch.draw.length; i++) {
      const m = new THREE.Mesh(chipGeo, i === pouch.draw.length - 1 ? chipMaterials('white') : stackMat);
      m.position.set(0.95, 0.96 + i * 0.041, 0.3);
      pouchGroup.add(m);
    }
  }

  function drawMonitor(state) {
    const g = monCtx;
    const { duel: d, dealer: dl } = state;
    const met = d.score >= d.quota;
    g.fillStyle = '#031208'; g.fillRect(0, 0, 192, 112);
    g.textAlign = 'center';
    g.fillStyle = met ? '#ffe066' : '#4dff8f';
    g.font = 'bold 40px monospace';
    g.fillText(String(d.score), 96, 46);
    g.font = 'bold 20px monospace';
    g.fillStyle = '#4dff8f';
    g.fillText(`/ ${d.quota}`, 96, 72);
    for (let i = 0; i < dl.maxHp; i++) {
      g.fillStyle = i < dl.hp ? '#ff4040' : '#3a1414';
      g.fillRect(96 - dl.maxHp * 10 + i * 20 + 2, 84, 16, 16);
    }
    g.textAlign = 'start';
    g.fillStyle = '#00000050';
    for (let y = 0; y < 112; y += 3) g.fillRect(0, y, 192, 1);
    monTex.needsUpdate = true;
  }

  // ── 애니메이션 ──
  const anims = [];
  let now = 0;
  function tween(delay, dur, fn) {
    anims.push({ start: now + delay, dur, fn });
  }
  let shake = 0;
  let dealerTurn = false;
  let leanK = 0;
  const hitJolt = { z: 0, x: 0 };
  let hurtGlow = 0;

  function animShot(t, e) {
    const holdPos = HOLD[e.shooter];
    const aimAt = e.target === e.shooter
      ? (e.shooter === 'player' ? AIM.player : AIM.dealer)
      : AIM[e.target];
    // 자기 자신을 쏠 때는 총을 머리 옆으로 가져간다
    const from = e.target === e.shooter
      ? (e.shooter === 'player' ? new THREE.Vector3(0.0, 1.45, 1.05) : new THREE.Vector3(0.75, 1.95, -1.45))
      : holdPos;
    const q = aimQuat(from, aimAt);
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion();
    tween(t, 1, () => { p0.copy(gun.position); q0.copy(gun.quaternion); });
    tween(t, 380, (k) => {
      const e2 = easeInOut(k);
      gun.position.lerpVectors(p0, from, e2);
      gun.quaternion.slerpQuaternions(q0, q, e2);
    });
    const fireAt = t + 650;
    if (e.live) {
      tween(fireAt, 140, (k) => {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        gun.position.copy(from).addScaledVector(dir, 0.12 * (1 - k));
        muzzle.getWorldPosition(flash.position);
        flash.intensity = 14 * (1 - k);
        flashSprite.material.opacity = 1 - k;
        flashSprite.scale.setScalar(1 + k * 2);
      });
      if (e.target === 'player') tween(fireAt, 1, () => { shake = 0.12; hurtGlow = 1; onHurt?.(); });
    } else {
      tween(fireAt, 160, (k) => {
        gun.position.copy(from);
        gun.position.y += Math.sin(k * Math.PI * 4) * 0.01;
      });
    }
    tween(fireAt + 450, 420, (k) => {
      const e2 = easeOut(k);
      gun.position.lerpVectors(from, REST_POS, e2);
      gun.quaternion.slerpQuaternions(q, restQuat, e2);
    });
    return { fireAt, end: fireAt + 900 };
  }

  function animDealerHit(t) {
    tween(t, 600, (k) => {
      hitJolt.z = -Math.sin(k * Math.PI) * 0.25;
      hitJolt.x = -Math.sin(k * Math.PI) * 0.5;
      headMat.emissive.setRGB(0.8 * (1 - k), 0, 0);
    });
  }

  function animReload(t) {
    tween(t, 450, (k) => {
      shellsGroup.position.y = 0.5 * (1 - easeOut(k));
    });
  }

  function play(events) {
    let t = 0;
    let lastShot = null;
    for (const e of events) {
      if (e.type === 'shot') {
        lastShot = animShot(t, e);
        t = lastShot.end;
      } else if (e.type === 'damage' && e.who === 'dealer') {
        animDealerHit(lastShot ? lastShot.fireAt : t);
      } else if (e.type === 'reload') {
        animReload(t);
        t += 450;
      } else if (e.type === 'peek') {
        tween(t, 400, (k) => { shellsGroup.children[0] && (shellsGroup.children[0].position.y = 1.08 + Math.sin(k * Math.PI) * 0.12); });
      }
    }
    return t;
  }

  let ringing = false;
  function moveCamera(next) {
    const fromPos = camPos.clone(), fromLook = camLook.clone();
    const portrait = canvas.clientWidth / canvas.clientHeight < 0.8;
    // 세로 화면에서는 상점 패널이 아래에 깔리므로 진열장을 정면 위쪽에 둔다
    const to = next === 'shop' && portrait
      ? { pos: new THREE.Vector3(0.2, 1.75, 0.6), look: new THREE.Vector3(3.05, 0.95, 0.15) }
      : POSES[next];
    pose = next;
    tween(0, 1000, (k) => {
      const e = easeInOut(k);
      camPos.lerpVectors(fromPos, to.pos, e);
      camPos.y += Math.sin(k * Math.PI) * 0.15; // 일어서는 느낌
      camLook.lerpVectors(fromLook, to.look, e);
    });
  }

  function update(state, { selectedChip = null } = {}) {
    rebuildShells(state.duel);
    rebuildChips(state.player.pouch, selectedChip);
    drawMonitor(state);
    dealerTurn = state.phase === 'dealer';
    rebuildCharms(state.player.charms);
    const want = state.phase === 'call' ? 'phone'
      : state.phase === 'shop' ? 'shop'
      : state.phase === 'gameOver' && state.result?.reason === 'dead' ? 'dead' : 'table';
    if (want !== pose) moveCamera(want);
    ringing = state.phase === 'call';
  }

  // ── 입력: 칩 클릭 ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const look = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (ev) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(chipMeshes)[0];
    if (hit) onChipClick?.(hit.object.userData.index);
    else {
      const ch = raycaster.intersectObjects(charmMeshes)[0];
      if (ch) onHover?.(ch.object.userData, ev.clientX, ev.clientY);
    }
  });
  let hovered = null;
  window.addEventListener('pointermove', (ev) => {
    look.x = (ev.clientX / window.innerWidth) * 2 - 1;
    look.y = (ev.clientY / window.innerHeight) * 2 - 1;
    if (ev.target !== canvas) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...chipMeshes, ...charmMeshes])[0];
    const info = hit ? hit.object.userData : null;
    const key = info ? `${info.kind}:${info.index}` : null;
    if (key !== hovered) {
      hovered = key;
      canvas.style.cursor = info?.kind === 'chip' ? 'pointer' : 'default';
      onHover?.(info, ev.clientX, ev.clientY);
    }
  });

  // ── 크기 / 루프 ──
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(Math.max(1, Math.floor(w / PIXEL_SCALE)), Math.max(1, Math.floor(h / PIXEL_SCALE)), false);
    camera.aspect = w / h;
    // 세로 화면에서는 테이블이 다 보이도록 시야를 넓힌다
    camera.fov = w / h < 0.8 ? 75 : 52;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let flicker = 1;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    now += dt * 1000;
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = (now - a.start) / a.dur;
      if (k < 0) continue;
      a.fn(Math.min(1, k));
      if (k >= 1) anims.splice(i, 1);
    }
    // 전등 깜빡임
    if (Math.random() < 0.01) flicker = 0.4 + Math.random() * 0.4;
    flicker += (1 - flicker) * 0.15;
    lamp.intensity = 30 * flicker * (0.97 + Math.random() * 0.03);
    bulb.material.color.setScalar(0.6 + 0.4 * flicker);
    // 카메라: 숨쉬기 + 마우스 + 흔들림
    const tt = now / 1000;
    shake *= 0.9;
    hurtGlow *= 0.94;
    const sway = pose === 'table' ? 1 : 0.3;
    camera.position.set(
      camPos.x + look.x * 0.12 * sway + (Math.random() - 0.5) * shake,
      camPos.y + Math.sin(tt * 1.3) * 0.01 - look.y * 0.05 * sway + (Math.random() - 0.5) * shake,
      camPos.z,
    );
    camera.lookAt(camLook.x + look.x * 0.3 * sway, camLook.y - look.y * 0.15 * sway, camLook.z);
    // 전화벨: 수화기가 덜덜 떨리고 빨간 불이 깜빡인다
    if (ringing) {
      const on = Math.sin(tt * 30) > 0 && (tt % 1.2) < 0.8;
      handset.position.y = 0.05 + (on ? (Math.random() - 0.5) * 0.02 : 0);
      handset.rotation.x = on ? (Math.random() - 0.5) * 0.15 : 0;
      phoneLight.intensity = on ? 0.7 : 0.2;
      for (const b of bells) b.position.x = 0.07 + (on ? (Math.random() - 0.5) * 0.015 : 0);
      bell.material.color.setHex(on ? 0xff2010 : 0x330000);
    } else {
      phoneLight.intensity = 0;
      bell.material.color.setHex(0x330000);
    }
    // 딜러 숨쉬기
    // 갑자기 고개를 꺾는 경련 + 느린 숨쉬기
    if (Math.random() < 0.006) { twitch.z = (Math.random() - 0.5) * 0.7; twitch.y = (Math.random() - 0.5) * 0.6; twitch.t = 1; }
    twitch.t *= 0.965;
    head.rotation.z += ((twitch.z * twitch.t) - head.rotation.z) * 0.35;
    head.rotation.y = Math.sin(tt * 0.6) * 0.12 + twitch.y * twitch.t;
    head.position.y = 2.02 + Math.sin(tt * 1.1) * 0.012;
    const lean = dealerTurn ? 1 : 0;
    leanK += (lean - leanK) * 0.05;
    dealer.position.z = -1.55 + leanK * 0.22 + hitJolt.z;
    head.rotation.x = leanK * 0.25 + hitJolt.x;
    pupilMat.color.setRGB(1, 0.14 + Math.random() * 0.1 * leanK, 0.08);
    const pupilScale = 1 + leanK * 0.6 + (Math.random() < 0.02 ? 1 : 0);
    for (const pp of pupils) pp.scale.setScalar(pupilScale);
    renderer.render(scene, camera);
  });

  return { update, play, resize };
}
