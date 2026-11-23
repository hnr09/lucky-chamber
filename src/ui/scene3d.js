// 3D 테이블 씬 (Three.js). 게임 규칙은 모르고, 상태를 그리고 이벤트를 연출만 한다.
// 레트로 로우폴리 스타일: 저해상도 렌더 → 픽셀 확대, 플랫 셰이딩, 안개, 흔들리는 전등.
import * as THREE from 'three';
import { CHIPS } from '../core/chips.js?v=mwsx9ehs';
import { CHARMS } from '../core/charms.js?v=mwsx9ehs';
import { CONFIG } from '../core/config.js?v=mwsx9ehs';

const PIXEL_SCALE = 3; // 클수록 더 도트처럼 보인다
// 좌석: player(앞, 카메라) · dealer(맞은편) · left · right
const HOLD = {
  player: new THREE.Vector3(0.32, 1.3, 1.1),
  dealer: new THREE.Vector3(-0.25, 1.28, -1.05),
  left: new THREE.Vector3(-1.0, 1.28, 0.15),
  right: new THREE.Vector3(1.0, 1.28, -0.45),
};
const AIM = {
  dealer: new THREE.Vector3(0, 1.95, -1.55),   // 딜러 머리
  player: new THREE.Vector3(0, 1.75, 2.3),     // 카메라(나)
  left: new THREE.Vector3(-1.75, 1.95, -0.2),
  right: new THREE.Vector3(1.75, 1.95, -0.2),
};
// 자기 자신을 쏠 때 총을 드는 위치
const SELF_FROM = {
  player: new THREE.Vector3(0.0, 1.45, 1.05),
  dealer: new THREE.Vector3(0.75, 1.95, -1.45),
  left: new THREE.Vector3(-1.65, 1.95, 0.55),
  right: new THREE.Vector3(1.65, 1.95, 0.15),
};
const REST_POS = new THREE.Vector3(0.1, 0.99, -0.3);
const REST_LOOK = new THREE.Vector3(1.5, 0.99, -0.45);

// 카메라 위치: 테이블에 앉음 / 일어나서 왼쪽 벽 전화 / 오른쪽 상점 진열장 / 사망
const POSES = {
  table: { pos: new THREE.Vector3(0, 1.78, 2.2), look: new THREE.Vector3(0, 1.16, -1.2) },
  // 세로 화면 + 옆자리 상대가 있을 때: 뒤로 물러나 높이서 내려다본다 (모든 자리가 보이게)
  tableWide: { pos: new THREE.Vector3(0, 2.75, 3.6), look: new THREE.Vector3(0, 1.05, -0.5) },
  phone: { pos: new THREE.Vector3(-1.2, 1.85, 1.9), look: new THREE.Vector3(-3.3, 1.25, 0.7) },
  shop:  { pos: new THREE.Vector3(0.9, 1.85, 1.9), look: new THREE.Vector3(3.1, 1.3, 1.25) },
  dead:  { pos: new THREE.Vector3(0.5, 1.05, 2.0), look: new THREE.Vector3(-0.4, 1.6, 0.3) },
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

export function createScene(canvas, { onChipClick, onHurt, onHover, onAim, onFire } = {}) {
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

  // ── 옆자리 상대 (3~4인 결투용): 딜러를 단순화한 인물, 좌석마다 옷 색이 다르다 ──
  function makeFigure(coatColor, eyeColor) {
    const g = new THREE.Group();
    const cm = mat(coatColor);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.15, 6), cm);
    body.position.y = 1.12;
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 0.34), cm);
    sh.position.y = 1.66;
    const hd = new THREE.Group();
    hd.position.y = 1.98;
    const bm = mat(0xb2ab96, { emissive: 0x000000 });
    const sk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 1), bm);
    sk.scale.set(0.88, 1.32, 0.95);
    const em = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eyesF = [-0.08, 0.08].map((x) => {
      const so = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), voidMat);
      so.position.set(x, 0.05, 0.17);
      so.scale.set(1, 1.2, 0.55);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), em);
      pu.position.set(x, 0.045, 0.205);
      hd.add(so, pu);
      return pu;
    });
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), voidMat);
    mo.position.set(0, -0.18, 0.18);
    const hood2 = new THREE.Mesh(new THREE.SphereGeometry(0.33, 7, 6, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.62), cm);
    hood2.scale.set(1, 1.35, 1.05);
    hood2.position.set(0, 0.05, -0.05);
    hd.add(sk, mo, hood2);
    g.add(body, sh, hd);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false;
    scene.add(g);
    return { group: g, head: hd, boneMat: bm, eyeMat: em, eyes: eyesF, jolt: 0, slump: 0, alive: true, aimed: 0 };
  }
  const sideFigures = {
    left: makeFigure(0x1a2a1a, 0x7dff6a),
    right: makeFigure(0x2a1a2e, 0x6ab8ff),
  };
  sideFigures.left.group.position.set(-1.75, 0, -0.2);
  sideFigures.left.group.rotation.y = Math.PI / 2;
  sideFigures.right.group.position.set(1.75, 0, -0.2);
  sideFigures.right.group.rotation.y = -Math.PI / 2;
  // 맞은편 딜러도 같은 방식으로 조준/탈락 표시를 하기 위한 상태
  const dealerFx = { alive: true, aimed: 0, slump: 0 };

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

  const chipGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.04, 20);
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

  // 베팅 자리: 칸 수만큼 펠트 위에 원을 그린다. 고른 칩은 고른 순서대로 자리로 밀려 나간다.
  const ringGeo = new THREE.RingGeometry(0.095, 0.11, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc9a24a, transparent: true, opacity: 0.45 });
  const BET_Z = 0.27;
  const betX = (k, n) => (k - (n - 1) / 2) * 0.25;
  function rebuildChips(pouch, selected, slots) {
    chipsGroup.clear();
    chipMeshes = [];
    for (let k = 0; k < slots; k++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(betX(k, slots), 0.943, BET_Z);
      chipsGroup.add(ring);
    }
    const hand = pouch.hand;
    const spacing = 0.22;
    const x0 = -((hand.length - 1) * spacing) / 2;
    hand.forEach((chip, i) => {
      const m = new THREE.Mesh(chipGeo, chipMaterials(chip.type));
      const order = selected.indexOf(i);
      if (order >= 0) m.position.set(betX(order, slots), 0.965, BET_Z);
      else m.position.set(x0 + i * spacing, 0.96, 0.45);
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
  let peekGlow = 0;
  let leanK = 0;
  const hitJolt = { z: 0, x: 0 };
  let hurtGlow = 0;

  function animShot(t, e) {
    const aimAt = AIM[e.target] ?? AIM.dealer;
    // 자기 자신을 쏠 때는 총을 머리 옆으로 가져간다
    const from = e.target === e.shooter ? (SELF_FROM[e.shooter] ?? SELF_FROM.dealer) : (HOLD[e.shooter] ?? HOLD.dealer);
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
      } else if (e.type === 'damage' && sideFigures[e.who]) {
        const f = sideFigures[e.who];
        tween(lastShot ? lastShot.fireAt : t, 600, (k) => { f.jolt = Math.sin(k * Math.PI); f.boneMat.emissive.setRGB(0.8 * (1 - k), 0, 0); });
      } else if (e.type === 'reload') {
        animReload(t);
        t += 450;
      } else if (e.type === 'dealerPeek') {
        // 딜러가 약실을 들여다본다: 눈동자가 커지고 붉게 타오른다
        tween(t, 700, (k) => { peekGlow = Math.sin(k * Math.PI); });
        t += 500;
      } else if (e.type === 'dealerSaw') {
        tween(t, 400, (k) => { under.intensity = 0.9 + Math.sin(k * Math.PI) * 4; });
        t += 300;
      } else if (e.type === 'peek') {
        tween(t, 400, (k) => { shellsGroup.children[0] && (shellsGroup.children[0].position.y = 1.08 + Math.sin(k * Math.PI) * 0.12); });
      }
    }
    return t;
  }

  let ringing = false;
  function moveCamera(next, delay = 0) {
    const fromPos = camPos.clone(), fromLook = camLook.clone();
    tween(delay, 1, () => { fromPos.copy(camPos); fromLook.copy(camLook); });
    const portrait = canvas.clientWidth / canvas.clientHeight < 0.8;
    // 세로 화면에서는 상점 패널이 아래에 깔리므로 진열장을 정면 위쪽에 둔다
    const to = next === 'shop' && portrait
      ? { pos: new THREE.Vector3(0.2, 1.75, 0.6), look: new THREE.Vector3(3.05, 0.95, 0.15) }
      : POSES[next];
    pose = next;
    tween(delay, 1000, (k) => {
      const e = easeInOut(k);
      camPos.lerpVectors(fromPos, to.pos, e);
      camPos.y += Math.sin(k * Math.PI) * 0.15; // 일어서는 느낌
      camLook.lerpVectors(fromLook, to.look, e);
    });
  }

  // seats: { dealer: {visible, alive}, left: {...}, right: {...} } (생략하면 혼자 하기: 딜러만)
  function setSeats(seats) {
    const d = seats?.dealer ?? { visible: true, alive: true };
    dealer.visible = d.visible !== false;
    dealerFx.alive = d.alive !== false;
    for (const k of ['left', 'right']) {
      const conf = seats?.[k];
      sideFigures[k].group.visible = !!conf?.visible;
      sideFigures[k].alive = conf?.alive !== false;
    }
  }

  function update(state, { selectedChips = [], betSlots = 3, seats = null } = {}) {
    setSeats(seats);
    rebuildShells(state.duel);
    rebuildChips(state.player.pouch, selectedChips, betSlots);
    drawMonitor(state);
    dealerTurn = state.phase === 'dealer';
    rebuildCharms(state.player.charms);
    const want = state.phase === 'call' ? 'phone'
      : state.phase === 'shop' ? 'shop'
      : state.phase === 'gameOver' && state.result?.reason === 'dead' ? 'dead'
      : (seats?.left?.visible || seats?.right?.visible) && canvas.clientWidth / canvas.clientHeight < 1 ? 'tableWide' : 'table';
    // 클리어 연출을 먼저 보여주고 일어난다 / 사망은 잠깐 뒤에 쓰러진다
    if (want !== pose) moveCamera(want, want === 'phone' ? 1900 : want === 'dead' ? 900 : 0);
    if (state.phase === 'call' && !ringing) tween(1900, 1, () => { ringing = state.phase === 'call'; });
    if (state.phase !== 'call') ringing = false;
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
    else if (aim && aimTarget !== null && pose.startsWith('table') && ev.button === 0) onFire?.(aimTarget);
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

  // ── 시선: 차례인 사람이 누구를 노리는지 모두에게 보여준다 ──
  // setGaze({ shooter: 좌석, target: 좌석 }) — 총을 들어 겨누고, 총구에서 대상 머리로 붉은 레이저.
  // setGaze(null) 은 총을 내려놓는다. { keepGun: true } 면 레이저만 끈다 (바로 사격 연출이 이어질 때).
  const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const laserMat = new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.75 });
  const laser = new THREE.Line(laserGeo, laserMat);
  laser.visible = false;
  scene.add(laser);
  const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
  laserDot.visible = false;
  scene.add(laserDot);
  const muzzlePos = new THREE.Vector3();
  let gaze = null;
  let gazeKey = null;
  function setGaze(g, { keepGun = false } = {}) {
    const key = g ? `${g.shooter}>${g.target}` : null;
    if (key === gazeKey) return;
    gazeKey = key;
    gaze = g;
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion();
    if (!g) {
      laser.visible = false;
      laserDot.visible = false;
      if (keepGun) return;
      tween(0, 1, () => { p0.copy(gun.position); q0.copy(gun.quaternion); });
      tween(0, 380, (k) => { const e = easeOut(k); gun.position.lerpVectors(p0, REST_POS, e); gun.quaternion.slerpQuaternions(q0, restQuat, e); });
      return;
    }
    const from = g.target === g.shooter ? (SELF_FROM[g.shooter] ?? SELF_FROM.dealer) : (HOLD[g.shooter] ?? HOLD.dealer);
    const q = aimQuat(from, AIM[g.target] ?? AIM.dealer);
    tween(0, 1, () => { p0.copy(gun.position); q0.copy(gun.quaternion); });
    tween(0, 350, (k) => { const e = easeInOut(k); gun.position.lerpVectors(p0, from, e); gun.quaternion.slerpQuaternions(q0, q, e); });
  }
  // 고개를 대상 쪽으로 돌릴 각도 (인물 좌표계 기준 yaw)
  const tmpV = new THREE.Vector3();
  function yawToward(group, target) {
    tmpV.copy(target);
    group.worldToLocal(tmpV);
    return Math.atan2(tmpV.x, tmpV.z);
  }

  // ── 조준 (PC): 마우스로 고개를 돌려 바라보는 사람을 쏜다 ──
  // setAim({ targets: [{ seat, id }], self: id }) — id는 호출하는 쪽 값(플레이어 번호 등). null이면 끈다.
  let aim = null;
  let aimTarget = null;
  const aimDir = new THREE.Vector3();
  const toHead = new THREE.Vector3();
  function setAim(conf) {
    aim = conf;
    if (!conf && aimTarget !== null) { aimTarget = null; onAim?.(null); }
  }
  function updateAim() {
    if (!aim || !pose.startsWith('table')) return;
    let best = null, bestAng = 0.38;
    for (const t of aim.targets) {
      toHead.copy(AIM[t.seat]).sub(camera.position).normalize();
      const ang = aimDir.angleTo(toHead);
      if (ang < bestAng) { bestAng = ang; best = t.id; }
    }
    // 아래(내 쪽 테이블 끝)를 내려다보면 나 자신
    if (best === null && aim.self !== undefined && look.y > 0.72) best = aim.self;
    if (best !== aimTarget) { aimTarget = best; onAim?.(best); }
    // 조준된 인물: 눈이 밝아진다
    const seatOf = (id) => aim.targets.find((t) => t.id === id)?.seat;
    const s = seatOf(aimTarget);
    dealerFx.aimed += ((s === 'dealer' ? 1 : 0) - dealerFx.aimed) * 0.2;
    for (const k of ['left', 'right']) sideFigures[k].aimed += ((s === k ? 1 : 0) - sideFigures[k].aimed) * 0.2;
  }

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
    const sway = pose.startsWith('table') ? 1 : 0.3;
    if (aim && pose.startsWith('table')) {
      // 조준 모드: 마우스 좌우로 크게 고개를 돌리고, 아래로 내리면 내 쪽을 본다
      const yaw = look.x * 0.95;
      const pitch = -0.18 - look.y * 0.5;
      camera.position.set(camPos.x + (Math.random() - 0.5) * shake, camPos.y + Math.sin(tt * 1.3) * 0.01 + (Math.random() - 0.5) * shake, camPos.z);
      aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(camera.position.x + aimDir.x, camera.position.y + aimDir.y, camera.position.z + aimDir.z);
      updateAim();
    } else {
      camera.position.set(
        camPos.x + look.x * 0.12 * sway + (Math.random() - 0.5) * shake,
        camPos.y + Math.sin(tt * 1.3) * 0.01 - look.y * 0.05 * sway + (Math.random() - 0.5) * shake,
        camPos.z,
      );
      camera.lookAt(camLook.x + look.x * 0.3 * sway, camLook.y - look.y * 0.15 * sway, camLook.z);
    }
    // 옆자리 인물: 숨쉬기, 맞으면 움찔, 탈락하면 고개를 떨군다, 조준되면 눈이 커진다
    for (const k of ['left', 'right']) {
      const f = sideFigures[k];
      if (!f.group.visible) continue;
      f.slump += ((f.alive ? 0 : 1) - f.slump) * 0.05;
      f.head.position.y = 1.98 + Math.sin(tt * 1.2 + (k === 'left' ? 1 : 2)) * 0.012 - f.slump * 0.25;
      f.head.rotation.x = -f.jolt * 0.5 + f.slump * 0.9;
      f.group.children[0].rotation.x = f.slump * 0.3;
      f.jolt *= 0.9;
      for (const e of f.eyes) e.scale.setScalar(f.alive ? 1 + f.aimed * 1.6 : 0.01);
    }
    dealerFx.slump += ((dealerFx.alive ? 0 : 1) - dealerFx.slump) * 0.05;
    // 시선: 레이저와 고개 돌리기
    if (gaze) {
      muzzle.getWorldPosition(muzzlePos);
      const tgt = AIM[gaze.target] ?? AIM.dealer;
      const pos = laser.geometry.attributes.position;
      pos.setXYZ(0, muzzlePos.x, muzzlePos.y, muzzlePos.z);
      pos.setXYZ(1, tgt.x, tgt.y, tgt.z);
      pos.needsUpdate = true;
      laser.geometry.computeBoundingSphere();
      laser.visible = true;
      laserMat.opacity = 0.55 + Math.sin(tt * 12) * 0.2;
      laserDot.position.copy(tgt);
      laserDot.visible = gaze.target !== 'player';
    }
    for (const k of ['left', 'right']) {
      const f = sideFigures[k];
      const want = gaze && gaze.shooter === k && gaze.target !== k ? yawToward(f.group, AIM[gaze.target]) : 0;
      f.head.rotation.y += (want - f.head.rotation.y) * 0.12;
    }
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
    const dealerGazeYaw = gaze && gaze.shooter === 'dealer' && gaze.target !== 'dealer' ? yawToward(dealer, AIM[gaze.target]) : 0;
    dealerFx.gazeYaw = (dealerFx.gazeYaw ?? 0) + (dealerGazeYaw - (dealerFx.gazeYaw ?? 0)) * 0.12;
    head.rotation.y = Math.sin(tt * 0.6) * 0.12 + twitch.y * twitch.t + dealerFx.gazeYaw;
    head.position.y = 2.02 + Math.sin(tt * 1.1) * 0.012 - dealerFx.slump * 0.3;
    const lean = dealerTurn ? 1 : 0;
    leanK += (lean - leanK) * 0.05;
    dealer.position.z = -1.55 + leanK * 0.22 + hitJolt.z;
    head.rotation.x = leanK * 0.25 + hitJolt.x + dealerFx.slump * 0.9;
    pupilMat.color.setRGB(1, 0.14 + Math.random() * 0.1 * leanK, 0.08);
    const pupilScale = dealerFx.alive ? 1 + leanK * 0.6 + peekGlow * 2.5 + dealerFx.aimed * 1.6 + (Math.random() < 0.02 ? 1 : 0) : 0.01;
    if (peekGlow > 0.01) pupilMat.color.setRGB(1, 0.35 * peekGlow, 0.1 * peekGlow);
    for (const pp of pupils) pp.scale.setScalar(pupilScale);
    renderer.render(scene, camera);
  });

  // 잭팟 연출: 레벨이 클수록 금화가 많이 쏟아지고 화면이 흔들린다
  const coinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10);
  const coinMat = mat(0xffcf4a, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 });
  const gold = new THREE.PointLight(0xffc040, 0, 6, 1.2);
  gold.position.set(0, 2.0, 0.4);
  scene.add(gold);
  function celebrate(level, delay = 0) {
    const n = Math.min(60, 8 + level * 10);
    tween(delay, 1, () => { shake = Math.max(shake, 0.04 * level); });
    tween(delay, 1400, (k) => { gold.intensity = 10 * level * (1 - k); });
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(coinGeo, coinMat);
      const x = (Math.random() - 0.5) * 1.8, z = -0.4 + Math.random() * 1.0;
      const spin = (Math.random() - 0.5) * 20;
      const start = 2.4 + Math.random() * 0.8;
      c.visible = false;
      scene.add(c);
      tween(delay + i * 18, 900, (k) => {
        c.visible = true;
        const y = start - (start - 0.96) * Math.min(1, k * k * 1.3);
        c.position.set(x, Math.max(0.96, y), z);
        c.rotation.set(spin * k, spin * k * 0.5, 0);
      });
      tween(delay + i * 18 + 2200, 500, (k) => {
        c.position.y = 0.96 - k * 0.05;
        if (k >= 1) { scene.remove(c); }
      });
    }
  }

  return { update, play, resize, celebrate, setAim, setGaze };
}
