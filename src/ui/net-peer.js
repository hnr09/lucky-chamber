// 온라인 연결: WebRTC P2P (PeerJS). 서버 운영 없이 GitHub Pages 같은 정적 사이트에서 동작한다.
// - 서로를 찾을 때만 PeerJS 공개 중계 서버(0.peerjs.com)를 쓰고, 게임 데이터는 두 브라우저가 직접 주고받는다.
// - 방장은 여러 참가자(최대 3명)의 연결을 받는다(hub), 참가자는 방장에게 연결한다(link).
// - 테스트용: ?peerhost=localhost&peerport=9000 으로 로컬 PeerServer를 쓸 수 있다.

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'luckychamber-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외

export function randomCode() {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

export function normalizeCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

let loading = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.async = true;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS를 불러오지 못했다')));
    s.onerror = () => { loading = null; reject(new Error('PeerJS를 불러오지 못했다 (인터넷 연결 확인)')); };
    document.head.appendChild(s);
  });
  return loading;
}

function peerOptions() {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return { debug: 0 };
  return { host, port: Number(q.get('peerport') || 9000), path: q.get('peerpath') || '/', secure: false, debug: 0 };
}

const ERRORS = {
  'unavailable-id': '이미 쓰이는 방 코드다. 다시 만들어 보자.',
  'peer-unavailable': '그 코드의 방을 찾을 수 없다. 코드를 확인하자.',
  network: '중계 서버에 연결하지 못했다. 인터넷 연결을 확인하자.',
  'server-error': '중계 서버 오류. 잠시 뒤 다시 시도하자.',
  'browser-incompatible': '이 브라우저는 온라인 대전을 지원하지 않는다.',
};

function connectPeer(id, host) {
  return loadPeerJs().then((Peer) => new Promise((resolve, reject) => {
    const peer = host ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('연결 시간이 초과됐다. 다시 시도하자.')); }, 15000);
    peer.on('error', (e) => { clearTimeout(timer); reject(new Error(ERRORS[e.type] ?? `연결 오류 (${e.type ?? e.message})`)); });
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
  }));
}

/** 방장: 방을 연다. hub: { code, onJoin, onLeave, onMessage, send, close } (online.js의 hub) */
export async function openPeerHub(code) {
  const peer = await connectPeer(ID_PREFIX + code, true);
  const conns = new Map();
  const h = { join: [], leave: [], msg: [] };
  peer.on('connection', (c) => {
    c.on('open', () => { conns.set(c.peer, c); h.join.forEach((f) => f(c.peer)); });
    c.on('data', (m) => h.msg.forEach((f) => f(c.peer, m)));
    const gone = () => { if (conns.delete(c.peer)) h.leave.forEach((f) => f(c.peer)); };
    c.on('close', gone);
    c.on('error', gone);
  });
  return {
    code,
    onJoin: (f) => h.join.push(f),
    onLeave: (f) => h.leave.push(f),
    onMessage: (f) => h.msg.push(f),
    send: (id, m) => { const c = conns.get(id); if (c?.open) c.send(m); },
    close: () => { try { peer.destroy(); } catch { /* 이미 닫힘 */ } },
  };
}

/** 참가자: 코드로 방에 들어간다. link: { onMessage, send, onClose, close } (online.js의 link) */
export async function openPeerLink(code) {
  const peer = await connectPeer(null, false);
  const c = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
  const h = { msg: [], close: [] };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(ERRORS['peer-unavailable'])), 10000);
    peer.on('error', (e) => { clearTimeout(timer); reject(new Error(ERRORS[e.type] ?? `연결 오류 (${e.type})`)); });
    c.on('open', () => { clearTimeout(timer); resolve(); });
  });
  c.on('data', (m) => h.msg.forEach((f) => f(m)));
  const gone = () => h.close.forEach((f) => f());
  c.on('close', gone);
  c.on('error', gone);
  return {
    code,
    onMessage: (f) => h.msg.push(f),
    onClose: (f) => h.close.push(f),
    send: (m) => { if (c.open) c.send(m); },
    close: () => { try { c.close(); peer.destroy(); } catch { /* 이미 닫힘 */ } },
  };
}
