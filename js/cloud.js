/* מסע · the account: sign in with Google, the traveler's trips on every device, a backup, a profile,
   and trips shared live with family.
   Built on Firebase (Auth + Firestore). The Firebase code is self-hosted and loaded only for travelers who sign in.
   Sign-in is a plain redirect to Google (no Google script on the page); the returned token is checked here
   (state and nonce) and then handed to Firebase.
   Who may read and write what is enforced on the server by firestore.rules; everything read back is cleaned
   by the app (cleanShared) because other members of a shared trip can write to it. */
window.Masa = window.Masa || {};
Masa.cloud = (() => {
  "use strict";
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const EMU = isLocal && (() => { try { return localStorage.getItem("masa-cloud-emu") === "1"; } catch { return false; } })();
  const CFG = EMU ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-masa", appId: "demo", googleClientId: "demo" } : window.MASA_CLOUD || null;
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

  const S = { status: "off", user: null, error: null };
  let F = null, app = null, auth = null, db = null, hooks = null, unsubTrips = null, loading = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(S); } catch {} });

  const configured = () => !!(CFG && CFG.apiKey && CFG.projectId && (EMU || /\.apps\.googleusercontent\.com$/.test(CFG.googleClientId || "")));
  const rand = (n = 32) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join(""); };

  /* ---------- loading Firebase only when needed ---------- */
  function load() {
    if (loading) return loading;
    loading = new Promise((ok, no) => {
      if (window.MasaFire) return ok();
      const s = document.createElement("script");
      s.src = "vendor/firebase/masa-firebase.js";
      s.onload = () => ok(); s.onerror = () => no(new Error("load"));
      document.head.appendChild(s);
    }).then(() => {
      F = window.MasaFire;
      app = F.initializeApp({ apiKey: CFG.apiKey, authDomain: CFG.authDomain, projectId: CFG.projectId, appId: CFG.appId });
      auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
      db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
      if (EMU) { F.connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true }); F.connectFirestoreEmulator(db, "localhost", 8080); }
      return new Promise(ok => {
        let first = true;
        F.onAuthStateChanged(auth, u => { onUser(u); if (first) { first = false; ok(); } });
      });
    }).catch(e => { loading = null; S.status = "error"; S.error = "load"; emit(); throw e; });
    return loading;
  }

  /* ---------- signing in ---------- */
  function signIn() {
    if (!configured()) return;
    if (EMU) return emuSignIn();
    const state = rand(24), nonce = rand(24);
    ss.set("masa-oauth", JSON.stringify({ state, nonce }));
    const p = new URLSearchParams({ client_id: CFG.googleClientId, redirect_uri: location.origin + location.pathname.replace(/index\.html$/, ""), response_type: "id_token", scope: "openid email profile", nonce, state, prompt: "select_account" });
    location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + p.toString());
  }
  /* tests only: the Firebase emulator accepts a plain token */
  async function emuSignIn(sub, name) {
    await load();
    sub = sub || ls.get("masa-cloud-emu-user") || "tester";
    const tok = JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name: name || sub });
    await F.signInWithCredential(auth, F.GoogleAuthProvider.credential(tok));
  }
  const b64json = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
  /* back from Google: the token is in the address; check it belongs to the sign-in we started */
  async function finishRedirect() {
    if (!/^#(id_token|error|state)=|[#&]id_token=/.test(location.hash)) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const saved = (() => { try { return JSON.parse(ss.get("masa-oauth") || "null"); } catch { return null; } })();
    ss.set("masa-oauth", null);
    history.replaceState(null, "", location.pathname + location.search);
    if (p.get("error")) { S.error = "cancelled"; emit(); return true; }
    const tok = p.get("id_token") || "";
    if (!saved || p.get("state") !== saved.state) { S.error = "state"; emit(); return true; }
    try {
      const claims = b64json(tok.split(".")[1] || "");
      if (claims.nonce !== saved.nonce || claims.aud !== CFG.googleClientId) throw new Error("token");
      await load();
      S.status = "loading"; emit();
      await F.signInWithCredential(auth, F.GoogleAuthProvider.credential(tok));
      ls.set("masa-cloud-on", "1");
    } catch { S.status = "off"; S.error = "token"; emit(); }
    return true;
  }
  async function signOut() {
    if (!auth) return;
    unsubTrips?.(); unsubTrips = null;
    await F.signOut(auth);
    ls.set("masa-cloud-on", null);
  }

  /* ---------- the signed-in traveler ---------- */
  async function onUser(u) {
    unsubTrips?.(); unsubTrips = null;
    if (!u) { S.user = null; S.status = "off"; emit(); return; }
    ls.set("masa-cloud-on", "1");
    S.user = { uid: u.uid, name: (u.displayName || "").split(" ")[0] || "", fullName: u.displayName || "", photo: u.photoURL || "", email: u.email || "" };
    S.status = "in"; S.error = null;
    emit();
    try { await syncProfile(); } catch {}
    watchTrips();
    // a pending invite (the traveler opened an invite before signing in)
    const code = ss.get("masa-join");
    if (code) { ss.set("masa-join", null); hooks?.joinLink ? hooks.joinLink(code) : join(code).catch(() => {}); }
  }
  async function syncProfile() {
    const ref = F.doc(db, "users", S.user.uid);
    const snap = await F.getDoc(ref);
    const remote = snap.exists() ? snap.data() : null;
    let prefs = null;
    try { prefs = remote?.prefs ? JSON.parse(remote.prefs) : null; } catch {}
    hooks?.profile?.({ name: String(remote?.name || "").slice(0, 80), prefs });
    await saveProfile();
  }
  async function saveProfile() {
    if (S.status !== "in") return;
    const p = hooks?.myProfile?.() || {};
    const data = { name: String(p.name || S.user.name || "").slice(0, 80) || "מטייל", updatedAt: F.serverTimestamp() };
    if (S.user.photo) data.photo = S.user.photo.slice(0, 500);
    if (p.prefs) { const j = JSON.stringify(p.prefs); if (j.length <= 4000) data.prefs = j; }
    await F.setDoc(F.doc(db, "users", S.user.uid), data);
  }

  /* ---------- trips ---------- */
  const lastSent = new Map(); // cloudId -> data string we know the server has
  function watchTrips() {
    const q = F.query(F.collection(db, "trips"), F.where("members", "array-contains", S.user.uid));
    unsubTrips = F.onSnapshot(q, snap => {
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id, d = ch.doc.data();
        if (ch.type === "removed") { hooks?.removed?.(id); return; }
        lastSent.set(id, d.data);
        let trip = null;
        try { trip = JSON.parse(d.data); } catch { return; }
        const fam = {};
        for (const [uid, j] of Object.entries(d.fam || {})) { if (uid === S.user.uid) continue; try { fam[uid] = JSON.parse(j); } catch {} }
        hooks?.remote?.({ id, owner: d.owner, members: d.members || [], names: d.names || {}, trip, othersFam: Object.values(fam), mine: d.owner === S.user.uid });
      });
      // first time on this device: put the trips saved here into the account
      if (!ls.get("masa-cloud-uploaded-" + S.user.uid)) {
        ls.set("masa-cloud-uploaded-" + S.user.uid, "1");
        (hooks?.localTrips?.() || []).forEach(t => pushTrip(t, true));
      }
    }, () => { S.error = "sync"; emit(); });
  }
  const timers = new Map();
  /* save a trip to the account (a moment later, once per burst of changes) */
  function pushTrip(t, now) {
    if (S.status !== "in" || !t || t.source === "sample") return;
    clearTimeout(timers.get(t));
    timers.set(t, setTimeout(() => upload(t).catch(() => { S.error = "sync"; emit(); }), now ? 0 : 1500));
  }
  async function upload(t) {
    const pack = hooks.pack(t); // { data: string, fam: object (only my own marks and notes) }
    if (pack.data.length > 400000) return;
    const name = (hooks?.myProfile?.().name || S.user.name || "מטייל").slice(0, 40);
    const famJ = JSON.stringify(pack.fam || {});
    if (!t.cloudId) {
      t.cloudId = rand(20);
      hooks.saved(t);
      await F.setDoc(F.doc(db, "trips", t.cloudId), { owner: S.user.uid, members: [S.user.uid], names: { [S.user.uid]: name }, data: pack.data, fam: { [S.user.uid]: famJ }, updatedAt: F.serverTimestamp(), v: 1 });
      lastSent.set(t.cloudId, pack.data);
      return;
    }
    const upd = { [`fam.${S.user.uid}`]: famJ, [`names.${S.user.uid}`]: name, updatedAt: F.serverTimestamp() };
    if (lastSent.get(t.cloudId) !== pack.data) upd.data = pack.data;
    await F.updateDoc(F.doc(db, "trips", t.cloudId), upd);
    if (upd.data) lastSent.set(t.cloudId, pack.data);
  }

  /* ---------- sharing a trip live ---------- */
  async function invite(t) {
    if (S.status !== "in") throw new Error("signin");
    if (!t.cloudId) await upload(t);
    const code = rand(24);
    await F.setDoc(F.doc(db, "invites", code), { tripId: t.cloudId, owner: S.user.uid, createdAt: F.serverTimestamp() });
    return `${location.origin}${location.pathname}#j=${code}`;
  }
  async function join(code) {
    if (!/^[A-Za-z0-9]{20,64}$/.test(code)) throw new Error("code");
    if (S.status !== "in") { ss.set("masa-join", code); throw new Error("signin"); }
    const inv = await F.getDoc(F.doc(db, "invites", code));
    if (!inv.exists()) throw new Error("gone");
    const tripId = inv.data().tripId;
    const name = (hooks?.myProfile?.().name || S.user.name || "מטייל").slice(0, 40);
    try {
      await F.updateDoc(F.doc(db, "trips", tripId), { members: F.arrayUnion(S.user.uid), [`names.${S.user.uid}`]: name, joinCode: code, updatedAt: F.serverTimestamp() });
    } catch (e) {
      // already a member: nothing to do
      const snap = await F.getDoc(F.doc(db, "trips", tripId)).catch(() => null);
      if (!snap?.exists()) throw e;
    }
    return tripId;
  }
  async function leave(t) {
    if (S.status !== "in" || !t.cloudId) return;
    const ref = F.doc(db, "trips", t.cloudId);
    const snap = await F.getDoc(ref);
    if (!snap.exists()) return;
    if (snap.data().owner === S.user.uid) await F.deleteDoc(ref);
    else await F.updateDoc(ref, { members: F.arrayRemove(S.user.uid), [`names.${S.user.uid}`]: F.deleteField(), [`fam.${S.user.uid}`]: F.deleteField(), updatedAt: F.serverTimestamp() });
  }
  async function removeMember(t, uid) {
    if (S.status !== "in" || !t.cloudId) return;
    await F.updateDoc(F.doc(db, "trips", t.cloudId), { members: F.arrayRemove(uid), [`names.${uid}`]: F.deleteField(), [`fam.${uid}`]: F.deleteField(), updatedAt: F.serverTimestamp() });
  }

  /* ---------- deleting everything ---------- */
  async function deleteAccount() {
    if (S.status !== "in") return;
    unsubTrips?.(); unsubTrips = null;
    const q = F.query(F.collection(db, "trips"), F.where("members", "array-contains", S.user.uid));
    const all = await F.getDocs(q);
    for (const d of all.docs) {
      if (d.data().owner === S.user.uid) await F.deleteDoc(d.ref);
      else await F.updateDoc(d.ref, { members: F.arrayRemove(S.user.uid), [`names.${S.user.uid}`]: F.deleteField(), [`fam.${S.user.uid}`]: F.deleteField(), updatedAt: F.serverTimestamp() });
    }
    await F.deleteDoc(F.doc(db, "users", S.user.uid));
    ls.set("masa-cloud-uploaded-" + S.user.uid, null);
    try { await F.deleteUser(auth.currentUser); }
    catch { await F.signOut(auth); throw new Error("relogin"); } // Google asks for a fresh sign-in before an account is removed
    ls.set("masa-cloud-on", null);
  }

  /* ---------- start ---------- */
  async function init(h) {
    hooks = h;
    if (!configured()) return;
    if (location.hash.startsWith("#j=")) {
      const c = location.hash.slice(3);
      if (/^[A-Za-z0-9]{20,64}$/.test(c)) ss.set("masa-join", c);
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (await finishRedirect()) return;
    if (ls.get("masa-cloud-on") || EMU) { S.status = "loading"; emit(); load().catch(() => {}); }
  }

  return {
    get state() { return S; }, configured, pendingInvite: () => !!ss.get("masa-join"), init, signIn, signOut, deleteAccount, pushTrip, saveProfile, invite, join, leave, removeMember,
    on: f => { listeners.add(f); return () => listeners.delete(f); }, _emuSignIn: emuSignIn
  };
})();
