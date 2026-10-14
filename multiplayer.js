const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_PREFIX = 'son-vardiya-';
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }
];
const PEER_OPTIONS = { debug: 0, config: { iceServers: ICE_SERVERS, sdpSemantics: 'unified-plan' } };

function peerClass() {
  const Peer = globalThis.Peer;
  if (typeof Peer !== 'function') throw new Error('PeerJS yüklenemedi. İnternet bağlantını kontrol et.');
  return Peer;
}

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

function normalizeCode(value) {
  const code = String(value ?? '').toUpperCase().replace(/[\s_-]+/g, '');
  return code.length === 4 && [...code].every(character => CODE_ALPHABET.includes(character)) ? code : null;
}

function waitForPeer(peer, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, new Error('Eşleştirme servisine ulaşılamadı. İnternet bağlantını kontrol et.')), timeoutMs);
    const onOpen = id => finish(resolve, id);
    const onError = error => finish(reject, error);
    const finish = (callback, value) => {
      clearTimeout(timer);
      peer.off?.('open', onOpen);
      peer.off?.('error', onError);
      callback(value);
    };
    peer.on('open', onOpen);
    peer.on('error', onError);
  });
}

class DataLink {
  constructor(connection, peer) {
    this.connection = connection;
    this.peer = peer;
    this.onMessage = null;
    this.onClose = null;
    this.closed = false;
    this.lastReceived = Date.now();
    this.timer = setInterval(() => this.tick(), 1500);
    connection.on('data', data => {
      this.lastReceived = Date.now();
      if (data?.type !== 'ping') this.onMessage?.(data);
    });
    connection.on('close', () => this.close(false));
    connection.on('error', () => this.close(false));
  }

  get open() { return !this.closed && this.connection.open; }

  send(payload) {
    if (!this.open) return false;
    try { this.connection.send(payload); return true; }
    catch { this.close(); return false; }
  }

  tick() {
    if (this.closed) return;
    if (Date.now() - this.lastReceived > 10000) { this.close(); return; }
    this.send({ type: 'ping' });
  }

  close(closePeer = true) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    if (closePeer) {
      try { this.connection.close(); } catch { /* already closed */ }
    }
    this.onClose?.();
  }
}

export async function hostRoom({ onConnection } = {}) {
  const Peer = peerClass();
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const peer = new Peer(`${ROOM_PREFIX}${code}`, PEER_OPTIONS);
    try {
      await waitForPeer(peer);
      const links = new Set();
      const room = {
        code,
        links,
        broadcast(message) { for (const link of links) link.send(message); },
        close() {
          for (const link of [...links]) link.close();
          links.clear();
          try { peer.destroy(); } catch { /* already closed */ }
        }
      };
      peer.on('connection', connection => {
        const link = new DataLink(connection, peer);
        links.add(link);
        link.onClose = () => links.delete(link);
        onConnection?.(link);
      });
      return room;
    } catch (error) {
      lastError = error;
      try { peer.destroy(); } catch { /* already closed */ }
      if (error?.type !== 'unavailable-id') throw error;
    }
  }
  throw lastError ?? new Error('Oda kodu oluşturulamadı. Tekrar dene.');
}

export async function joinRoom(value) {
  const code = normalizeCode(value);
  if (!code) throw new Error('Oda kodu dört karakter olmalı.');
  const Peer = peerClass();
  const peer = new Peer(PEER_OPTIONS);
  let link = null;
  try {
    await waitForPeer(peer);
    const connection = peer.connect(`${ROOM_PREFIX}${code}`, { reliable: true, serialization: 'json', label: 'son-vardiya' });
    if (!connection) throw new Error('Bağlantı başlatılamadı.');
    link = new DataLink(connection, peer);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, new Error('Oda yanıt vermedi. Kodu kontrol edip tekrar dene.')), 20000);
      const finish = (callback, value) => {
        clearTimeout(timer);
        connection.off?.('open', onOpen);
        connection.off?.('error', onError);
        peer.off?.('error', onPeerError);
        link.onClose = null;
        callback(value);
      };
      const onOpen = () => finish(resolve);
      const onError = error => finish(reject, error);
      const onPeerError = error => finish(reject, error);
      connection.on('open', onOpen);
      connection.on('error', onError);
      peer.on('error', onPeerError);
      link.onClose = () => finish(reject, new Error('Oda bulunamadı veya bağlantı koptu.'));
      if (connection.open) onOpen();
    });
    return {
      code,
      link,
      close() {
        link.close();
        try { peer.destroy(); } catch { /* already closed */ }
      }
    };
  } catch (error) {
    link?.close();
    try { peer.destroy(); } catch { /* already closed */ }
    throw error;
  }
}

export function inviteUrl(code) {
  const url = new URL(globalThis.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('oda', normalizeCode(code) ?? '');
  return url.toString();
}

export function roomCodeFromUrl() {
  try { return normalizeCode(new URL(globalThis.location.href).searchParams.get('oda')); }
  catch { return null; }
}
