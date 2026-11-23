// 온라인 연결: WebRTC P2P (PeerJS). 서버 운영 없이 GitHub Pages 같은 정적 사이트에서 동작한다.
// - 서로를 찾을 때만 PeerJS 공개 중계 서버(0.peerjs.com)를 쓰고, 게임 데이터는 두 브라우저가 직접 주고받는다.
// - online.js가 쓰는 room 인터페이스(presence / onPeers / peers)를 그대로 흉내 낸다.
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

/**
 * 방을 열거나(host) 코드로 들어간다(guest). 연결 준비가 되면 room 객체로 resolve.
 * room: { code, presence(patch), onPeers(fn), peers(), onClose(fn), leave() }
 */
export async function openPeerRoom({ code, host }) {
  const Peer = await loadPeerJs();
  const id = ID_PREFIX + code;
  const peer = host ? new Peer(id, peerOptions()) : new Peer(peerOptions());

  let mine = {};
  let theirs = null;
  let conn = null;
  const peerHandlers = new Set();
  const closeHandlers = new Set();

  const snapshot = () => {
    const list = [{ peer: 'me', isMe: true, sameTab: true, presence: mine }];
    if (theirs) list.push({ peer: 'them', isMe: false, sameTab: false, presence: theirs });
    return list;
  };
  const notify = () => { const peers = snapshot(); for (const h of peerHandlers) h({ peers }); };
  const send = () => { if (conn?.open) conn.send({ t: 'p', p: mine }); };

  const attach = (c) => {
    if (conn && conn.open) { c.on('open', () => c.close()); return; } // 1:1만 받는다
    conn = c;
    c.on('open', () => { send(); notify(); });
    c.on('data', (msg) => {
      if (msg && msg.t === 'p' && typeof msg.p === 'object') { theirs = msg.p; notify(); }
    });
    const gone = () => {
      if (conn !== c) return;
      conn = null;
      theirs = null;
      notify();
      for (const h of closeHandlers) h();
    };
    c.on('close', gone);
    c.on('error', gone);
  };

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('연결 시간이 초과됐다. 다시 시도하자.')), 15000);
    peer.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(ERRORS[e.type] ?? `연결 오류 (${e.type ?? e.message})`));
    });
    peer.on('open', () => {
      if (host) {
        peer.on('connection', attach);
        clearTimeout(timer);
        resolve();
      } else {
        const c = peer.connect(id, { reliable: true, serialization: 'json' });
        attach(c);
        c.on('open', () => { clearTimeout(timer); resolve(); });
      }
    });
  });

  return {
    code,
    presence(patch) {
      mine = { ...mine, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === null) delete mine[k];
      send();
      queueMicrotask(notify);
      return Promise.resolve();
    },
    onPeers(h) { peerHandlers.add(h); queueMicrotask(() => h({ peers: snapshot() })); return () => peerHandlers.delete(h); },
    peers: snapshot,
    onClose(h) { closeHandlers.add(h); return () => closeHandlers.delete(h); },
    leave() { try { conn?.close(); peer.destroy(); } catch { /* 이미 닫힘 */ } },
  };
}
