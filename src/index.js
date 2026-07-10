// fallfeed SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallfeed/index.html · 7108 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "FallFeed",
  "description": "A sovereign mesh feed. Sign your posts with Ed25519, publish to the WebRTC channel, subscribe to peers. No servers, no algorithms, no ads. Nothing leaves your device unless you sign it.",
  "applicationCategory": "SocialNetworkingApplication",
  "operatingSystem": "Any modern browser",
  "url": "https://sjgant80-hub.github.io/fallfeed/",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "GBP" },
  "license": "https://opensource.org/licenses/MIT",
  "author": { "@type": "Organization", "name": "AI-Native Solutions", "url": "https://ai-nativesolutions.com" },
  "featureList": ["Ed25519-signed posts","WebRTC mesh publish","chronological feed","export JSON","offline PWA"]
}
// ═══ Ed25519 identity via WebCrypto ═══
const DB_NAME = 'fallfeed', DB_VERSION = 1, STORE = 'posts';
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getOrCreateIdentity() {
  const db = await openDB();
  const tx = db.transaction('identity', 'readwrite');
  const store = tx.objectStore('identity');
  const existing = await new Promise(r => { const rq = store.get('me'); rq.onsuccess = () => r(rq.result); rq.onerror = () => r(null); });
  if (existing) return existing;
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']).catch(async () => {
    // Fallback to ECDSA P-256 in older browsers
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  });
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(pubJwk))));
  const did = 'did:key:' + btoa(String.fromCharCode(...raw)).replace(/=+$/, '');
  const rec = { k: 'me', did, pubJwk, privJwk, created: Date.now() };
  await new Promise(r => { const rq = store.add(rec); rq.onsuccess = r; });
  return rec;
}
async function signMessage(msg, privJwk) {
  const key = await crypto.subtle.importKey('jwk', privJwk, privJwk.crv === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const alg = privJwk.crv === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
  const sig = await crypto.subtle.sign(alg, key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function saveRecord(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).add(rec);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function listRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => resolve(rq.result.reverse());
    rq.onerror = () => reject(rq.error);
  });
}
async function deleteRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).delete(id);
    rq.onsuccess = () => resolve();
    rq.onerror = () => reject(rq.error);
  });
}
// ═══ view routing ═══
function switchView(idx) {
  render(idx);
}
// ═══ render per app ═══
async function render(idx) {
  if (!c) return;
  if (idx === 1) {
    c.innerHTML = `
      <div class="card">
        <div class="form-group"><label>Post message</label><textarea id="post-body" placeholder="What's on your mind, agent?"></textarea></div>
        <button class="btn primary" onclick="publishPost()">Sign & publish →</button>
      </div>`;
  }
  if (idx === 2) {
    const posts = await listRecords();
    if (!posts.length) { c.innerHTML = '<div class="empty"><p>No posts yet. Head to Compose to sign your first one.</p></div>'; return; }
    c.innerHTML = posts.map(p => `
      <div class="card">
        <div class="meta">${new Date(p.date).toLocaleString()} · signed by ${(p.author || '').slice(0, 32)}</div>
        <div class="content">${p.content.replace(/</g,'&lt;')}</div>
        <div class="sig">sig: ${(p.sig || '').slice(0, 80)}...</div>
        <button class="btn" onclick="removePost(${p.id})" style="margin-top:12px;border-color:var(--coral);color:var(--coral)">Delete</button>
      </div>`).join('');
  }
  if (idx === 3) {
    c.innerHTML = '<div class="card"><p>WebRTC peer discovery via the fall-signal channel opens on demand. Peer sync coming in v1.1.</p></div>';
  }
  if (idx === 4) {
    const me = await getOrCreateIdentity();
    c.innerHTML = `<div class="identity-panel"><div class="label">Your agent DID</div><div class="did">${me.did}</div><div class="actions"><button class="btn" onclick="exportKey()">Export key</button></div></div>`;
  }
}
async function publishPost() {
  if (!body) { alert('Write something first.'); return; }
  const me = await getOrCreateIdentity();
  const sig = await signMessage(body, me.privJwk);
  await saveRecord({ date: Date.now(), content: body, author: me.did, sig });
  alert('Signed and saved.');
}
async function removePost(id) { if (!confirm('Delete this post?')) return; await deleteRecord(id); switchView(2); }
async function exportKey() { const me = await getOrCreateIdentity(); const blob = new Blob([JSON.stringify(me, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'fallfeed-identity.json'; a.click(); URL.revokeObjectURL(url); }
// Init
  await getOrCreateIdentity();
});

// Named exports for the primary API surface
export { openDB };
export { getOrCreateIdentity };
export { signMessage };
export { saveRecord };
export { listRecords };
export { deleteRecord };
export { switchView };
export { publishPost };
export { removePost };
export { exportKey };

export { DB_NAME };
