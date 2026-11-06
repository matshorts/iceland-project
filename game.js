(function () {
"use strict";
const DEFAULTS = JSON.parse(JSON.stringify(window.GAME));
let G = JSON.parse(JSON.stringify(DEFAULTS));
const EDITABLE = ["serate", "lobby", "esempi", "briefing", "patto", "dilemmi", "lampo", "categorie", "budget", "missioni", "scadenzaMissioni", "nomi"];
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
let cfgKey = "";
function applyCfg(c) {
  const k = JSON.stringify(c || null); if (k === cfgKey) return; cfgKey = k;
  G = JSON.parse(JSON.stringify(DEFAULTS));
  if (c) EDITABLE.forEach(key => { if (c[key] !== undefined && c[key] !== null) G[key] = c[key]; });
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const DEMO = params.get("demo");            // "gm" oppure "giocatore": simulazione senza salvare nulla
const DUO = DEMO === "giocatore";
const SPEED = Math.max(1, +params.get("speed") || 1); // solo per i test              // telefono + schermo del Game Master affiancati
const IS_HOST = params.has("host") || DEMO === "gm";
const ADMIN = params.has("admin");
let CODE = (params.get("r") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const app = document.getElementById("app");
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a, seed) {
  a = a.slice();
  let s = 0; for (const ch of String(seed || Math.random())) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((seed ? r() : Math.random()) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ============================ STORE ============================
const Store = {
  uid: null, mock: false, listeners: [],
  async init() {
    if (DEMO) { this.mock = true; this.memory = true; this.mem = {}; this.uid = DEMO === "gm" ? "gm" : "me"; return; }
    const cfg = window.FIREBASE_CONFIG || {};
    if (cfg.apiKey && window.firebase && !LOCAL) {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      const auth = firebase.auth();
      // utente già collegato da una visita precedente?
      const existing = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
      if (existing) this.uid = existing.uid;
      else {
        let lastErr = null;
        for (let i = 0; i < 4 && !this.uid; i++) {
          try { const r = await auth.signInAnonymously(); this.uid = r.user.uid; }
          catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
        }
        if (!this.uid) throw lastErr || new Error("accesso non riuscito");
      }
      this.db = firebase.database();
      return;
    }
    this.mock = true;
    let id = sessionStorage.getItem("ip-uid");
    if (!id) { id = "u" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("ip-uid", id); }
    this.uid = id;
    this.bc = new BroadcastChannel("ip-mock");
    this.bc.onmessage = () => this.fire();
    window.addEventListener("storage", e => { if (e.key === "ip-mock") this.fire(); });
  },
  _save(d) { if (this.memory) { this.mem = d; } else { localStorage.setItem("ip-mock", JSON.stringify(d)); this.bc.postMessage(1); } this.fire(); },
  _data() { if (this.memory) return this.mem; try { return JSON.parse(localStorage.getItem("ip-mock") || "{}"); } catch (e) { return {}; } },
  _get(d, path) { return path.split("/").reduce((o, k) => (o == null ? undefined : o[k]), d); },
  _set(d, path, v) {
    const ks = path.split("/"); let o = d;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== "object" || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  },
  fire() { const d = this.memory ? JSON.parse(JSON.stringify(this.mem)) : this._data(); this.listeners.forEach(l => l.cb(this._get(d, l.path) ?? null)); },
  on(path, cb) {
    if (!this.mock) {
      const ref = this.db.ref(path);
      const h = s => cb(s.val());
      ref.on("value", h, err => console.warn("lettura negata", path, err && err.code));
      return () => ref.off("value", h);
    }
    const l = { path, cb }; this.listeners.push(l);
    setTimeout(() => { const d = this.memory ? JSON.parse(JSON.stringify(this.mem)) : this._data(); cb(this._get(d, path) ?? null); }, 0);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  },
  set(path, v) {
    if (!this.mock) return this.db.ref(path).set(v);
    const d = this._data(); this._set(d, path, v); this._save(d); return Promise.resolve();
  },
  update(path, obj) {
    if (!this.mock) return this.db.ref(path).update(obj);
    const d = this._data(); Object.entries(obj).forEach(([k, v]) => this._set(d, path + "/" + k, v));
    this._save(d); return Promise.resolve();
  },
  get(path) {
    if (!this.mock) return this.db.ref(path).get().then(s => s.val());
    return Promise.resolve(this._get(this._data(), path) ?? null);
  }
};

// ============================ DATA ============================
let ME = null;
let S = { state: {}, players: {}, ans: {} };
let SECRET = {};
const ui = { drafts: {}, focus: null, history: [], hold: null, spin: null };
const st = () => S.state || {};
const R = p => `rooms/${CODE}/${p}`;
const playerList = () => Object.entries(S.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const P = id => (S.players || {})[id];
const ans = key => (S.ans || {})[key] || {};
const mine = key => ans(key)[ME];
const nPlayers = () => playerList().length;
const answered = key => Object.keys(ans(key)).filter(u => P(u)).length;
const av = (id, cls = "") => P(id) ? `<img class="av ${cls}" src="assets/${esc(P(id).avatar)}.png" alt="${esc(P(id).name)}" title="${esc(P(id).name)}">` : "";
const avTile = id => P(id) ? `<div class="avt">${av(id)}<span>${esc(P(id).name)}</span></div>` : "";
const icon = (id, cls = "") => `<img class="ico ${cls}" src="assets/${esc(id)}.png" alt="">`;
const answer = (key, val) => Store.set(R(`pub/ans/${key}/${ME}`), val);
const catById = id => G.categorie.find(c => c.id === id);
const allDilemmi = () => [...G.dilemmi, ...G.lampo];
const dById = id => allDilemmi().find(d => d.id === id);

// ============================ CALCOLI ============================
function dres(id) {
  const r2 = ans("v_" + id + "_2");
  const round2 = Object.keys(r2).length > 0;
  const use = round2 ? r2 : ans("v_" + id);
  const c = { A: [], B: [], T: [] };
  Object.entries(use).forEach(([u, v]) => { if (c[v] && P(u)) c[v].push(u); });
  const a = c.A.length, b = c.B.length, tot = a + b;
  let label = "Indifferenti", winner = null;
  if (tot > 0) {
    if (a === b) label = "Spaccatura";
    else { winner = a > b ? "A" : "B"; label = Math.max(a, b) / tot >= 0.8 ? "Netta" : "Chiara"; }
  }
  return { c, a, b, t: c.T.length, tot: a + b + c.T.length, winner, label, round2 };
}
const LABEL_TXT = {
  Netta: "Decisione presa.",
  Chiara: "Tendenza chiara, salvo sorprese dalle missioni.",
  Spaccatura: "Un sostenitore per parte la difende in 30 secondi. Poi si rivota.",
  Indifferenti: "A tutti va bene tutto. Sospetto."
};

function points() {
  const pts = {}; const add = (u, n) => { if (P(u)) pts[u] = (pts[u] || 0) + n; };
  (st().list || []).forEach(author => {
    Object.entries(ans("chi_" + author)).forEach(([u, guess]) => {
      if (u === author) return;
      if (guess === author) add(u, 1); else add(author, 1);
    });
  });
  G.dilemmi.forEach(d => {
    const r = dres(d.id); if (!r.winner) return;
    Object.entries(ans("bet_" + d.id)).forEach(([u, b]) => { if (b === r.winner) add(u, 1); });
  });
  return pts;
}

function pres() {
  const all = {}; Object.entries(ans("punti")).forEach(([u, a]) => { if (P(u)) all[u] = a; });
  const n = Object.keys(all).length;
  const cats = G.categorie.map(c => {
    const vals = Object.values(all).map(a => +a[c.id] || 0);
    const tot = vals.reduce((x, y) => x + y, 0);
    const mean = n ? tot / n : 0;
    const sd = n ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n) : 0;
    const accordo = mean === 0 ? "a nessuno interessa" : (sd / mean < 0.6 ? "d'accordo" : "divisi");
    return { ...c, tot, accordo };
  }).sort((a, b) => b.tot - a.tot);
  let pass = null;
  Object.entries(all).forEach(([u, a]) => Object.entries(a).forEach(([cid, v]) => { v = +v; if (!pass || v > pass.v) pass = { u, cid, v }; }));
  const top3 = cats.slice(0, 3), sacr = cats.slice(-2);
  const passCat = pass ? catById(pass.cid) : null;
  const nonSacr = passCat && !top3.some(c => c.id === passCat.id) ? passCat : null;
  return { n, cats, top3, sacr, pass, passCat, nonSacr };
}

function bres() {
  const vals = Object.entries(SECRET || {}).filter(([u]) => P(u)).map(([, s]) => s && s.budget).filter(Boolean);
  if (!vals.length) return null;
  return { n: vals.length, obiettivo: Math.min(...vals.map(v => +v.comodo)), tetto: Math.min(...vals.map(v => +v.max)) };
}
function speseRes() {
  const cnt = {}; G.budget.voci.forEach(v => cnt[v] = { su: 0, giu: 0 });
  Object.entries(ans("spese")).forEach(([u, s]) => {
    if (!P(u) || !s) return;
    (s.spend || []).forEach(v => cnt[v] && cnt[v].su++);
    if (s.save && cnt[s.save]) cnt[s.save].giu++;
  });
  return G.budget.voci.map(v => ({ v, ...cnt[v] })).sort((a, b) => (b.su - b.giu) - (a.su - a.giu));
}
function folliaWinner() {
  const cnt = {}; Object.entries(ans("follia_vote")).forEach(([u, a]) => { if (P(u)) cnt[a] = (cnt[a] || 0) + 1; });
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  return { author: best[0], votes: best[1], testo: ans("follia")[best[0]] };
}
function makePairs() {
  const ids = shuffle(playerList().map(p => p.id).filter(id => id !== st().gm));
  const pairs = []; for (let i = 0; i < ids.length; i += 2) pairs.push(ids.slice(i, i + 2));
  if (pairs.length > 1 && pairs[pairs.length - 1].length === 1) pairs[pairs.length - 2].push(pairs.pop()[0]);
  return pairs;
}
function pairOrder(pairs) {
  const pts = points();
  return pairs.map((p, i) => ({ i, s: p.reduce((t, u) => t + (pts[u] || 0), 0), r: Math.random() }))
    .sort((a, b) => b.s - a.s || a.r - b.r).map(x => x.i);
}
function draft() {
  const order = st().order || [], pairs = st().pairs || [];
  const taken = {}, assign = {};
  for (let t = 0; t < order.length; t++) {
    const pi = order[t];
    const remaining = G.missioni.filter(m => !taken[m.id]);
    if (!remaining.length) return { assign, turn: order.length, done: true };
    if (remaining.length === 1 && t === order.length - 1) { assign[pi] = remaining[0].id; taken[remaining[0].id] = 1; continue; }
    const picks = Object.entries(ans("pick_" + pi)).filter(([u]) => (pairs[pi] || []).includes(u)).map(([, p]) => p);
    const valid = picks.filter(p => p && !taken[p.m]).sort((a, b) => a.at - b.at)[0];
    if (!valid) return { assign, turn: t, done: false, taken };
    assign[pi] = valid.m; taken[valid.m] = 1;
  }
  return { assign, turn: order.length, done: true, taken };
}
function myPair() { return (st().pairs || []).findIndex(p => p.includes(ME)); }

function missionCard(id) {
  const d1 = dres("D1"), d4 = dres("D4"), d5 = dres("D5"), d6 = dres("D6"), d14 = dres("D14");
  const p = pres(); const auroraTop = p.top3.some(c => c.id === "aurora");
  const b = st().budget;
  const bud = b ? `Obiettivo del gruppo: ${b.obiettivo} € a persona per tutta la settimana, voli esclusi.` : "";
  if (id === "mezzo") {
    const v = d1.winner === "A" ? "un furgone da 9 posti" : d1.winner === "B" ? "due auto" : "un furgone da 9 posti e due auto, da confrontare";
    return {
      obiettivo: `Trovate 2-3 preventivi reali per ${v}, dal 17 al 24 febbraio, con ritiro e riconsegna a Keflavík.`,
      portate: ["Prezzo totale con le assicurazioni", "Quanti conducenti sono inclusi", "Pneumatici invernali e trazione", "Quanti bagagli ci stanno davvero con 7 persone"],
      dove: "Noleggi islandesi e comparatori di noleggio", nota: bud
    };
  }
  if (id === "alloggi") {
    const tipo = d4.winner === "B" ? "due alloggi vicini" : "una casa per tutti e 7";
    const extra = [];
    if (d14.winner !== "B") extra.push("con cucina");
    if (auroraTop || d6.winner === "A") extra.push("lontano dalle luci, per l'aurora");
    const zone = d5.winner === "A" ? "lungo il percorso, 2 zone diverse" : "in 2 zone che possano fare da base fissa";
    return {
      obiettivo: `Trovate ${tipo}${extra.length ? ", " + extra.join(", ") : ""}, ${zone}.`,
      portate: ["3 opzioni per zona", "Prezzo a notte e totale", "Cancellazione gratuita sì o no", "Link"],
      dove: "Booking, Airbnb, guesthouse e cottage locali", nota: bud
    };
  }
  const perc = d5.winner === "A" ? "con spostamenti quasi ogni notte" : d5.winner === "B" ? "con 2-3 basi fisse" : "una con basi fisse e una con spostamenti";
  return {
    obiettivo: "Scoprite cosa ci sta davvero in 6 giorni d'inverno, partendo da Keflavík.",
    portate: ["Tempi di guida realistici verso le zone del sud", "Ore di luce a febbraio", "Dove e come si guarda l'aurora", `2 ipotesi di percorso, ${perc}`],
    dove: "road.is (strade) · safetravel.is (avvisi) · vedur.is (meteo e aurora)", nota: ""
  };
}

function nomeSpedizione(p) {
  const top = p.top3.map(c => c.id); const r = id => dres(id).winner; const b = st().budget;
  if (top.includes("aurora") && r("D9") === "A") return G.nomi.cacciatori;
  if (top.includes("aurora") && r("D6") === "A") return G.nomi.notturni;
  if (top.includes("terme")) return G.nomi.terme;
  if (r("D7") === "A" && r("D8") === "A") return G.nomi.mattinieri;
  if (b && b.obiettivo < 900 && r("D14") === "A") return G.nomi.lowcost;
  return G.nomi.comodi;
}
function computeDNA() {
  const p = pres(); const fw = folliaWinner(); const dr = draft();
  return {
    nome: nomeSpedizione(p), quando: G.serate[0].quando, budget: st().budget || null,
    top3: p.top3.map(c => c.id), nonSacr: p.nonSacr ? p.nonSacr.id : null, sacr: p.sacr.map(c => c.id),
    profilo: allDilemmi().map(d => { const x = dres(d.id); return { id: d.id, A: x.a, B: x.b, label: x.label, winner: x.winner }; }),
    follia: fw ? fw.testo : null,
    missioni: Object.entries(dr.assign).map(([pi, m]) => ({ pair: (st().pairs || [])[pi] || [], m })),
    giocatori: playerList().map(p => p.id)
  };
}

// ============================ HOST: FLUSSO ============================
const STEP_NAMES = { lobby: "Lobby", briefing: "Il briefing", patto: "Il patto", chi: "Chi l'ha detto?", wyr: "Would you rather", lampo: "Giro lampo", punti: "I 100 punti", budget: "Budget al buio", missioni: "Le missioni", dna: "Il Travel DNA" };
function setState(patch, push = true) {
  if (push) ui.history.push(JSON.stringify(st()));
  const ns = { ...st(), ...patch };
  Object.keys(ns).forEach(k => ns[k] === undefined && delete ns[k]);
  return Store.set(R("pub/state"), ns);
}
function go(step, extra = {}) { return setState({ step, sub: 0, k: 0, reveal: false, round: 1, t0: Date.now(), ...extra }); }
function chiList() { return shuffle(playerList().filter(p => ans("follia")[p.id]).map(p => p.id), CODE); }
function canNext() {
  const s = st();
  if (s.step === "missioni" && s.sub === "coppie") return !!s.pairs;
  if (s.step === "missioni" && s.sub === "draft") return draft().done;
  if (s.step === "dna") return false;
  return true;
}
function next() {
  const s = st(); if (!canNext()) return;
  switch (s.step) {
    case "lobby": return go("briefing");
    case "briefing": return s.sub < G.briefing.length - 1 ? setState({ sub: s.sub + 1 }) : go("patto");
    case "patto": { const list = chiList(); return list.length ? go("chi", { sub: "guess", list }) : go("wyr", { sub: "intro" }); }
    case "chi":
      if (s.sub === "guess") {
        if (!s.reveal) return setState({ reveal: true });
        if (s.k < s.list.length - 1) return setState({ k: s.k + 1, reveal: false });
        return setState({ sub: "vote" });
      }
      if (s.sub === "vote") return setState({ sub: "win" });
      return go("wyr", { sub: "intro" });
    case "wyr": case "lampo": {
      const list = s.step === "wyr" ? G.dilemmi : G.lampo;
      if (s.sub === "intro") return setState({ sub: "play", t0: Date.now() });
      if (s.sub === "play") return setState({ sub: "result" });
      if (s.k < list.length - 1) return setState({ k: s.k + 1, sub: "play", round: 1, t0: Date.now() });
      return s.step === "wyr" ? go("lampo", { sub: "intro" }) : go("punti", { sub: "collect" });
    }
    case "punti":
      if (s.sub === "collect") return setState({ sub: "reveal", k: 1 });
      if (s.sub === "reveal") return s.k < G.categorie.length ? setState({ k: s.k + 1 }) : setState({ sub: "passione" });
      if (s.sub === "passione") return setState({ sub: "sintesi" });
      return go("budget", { sub: "collect" });
    case "budget":
      if (s.sub === "collect") return setState({ sub: "reveal", budget: bres() });
      if (s.sub === "reveal") return setState({ sub: "mappa" });
      if (s.sub === "mappa") return setState({ sub: "souvenir" });
      return go("missioni", { sub: "coppie" });
    case "missioni":
      if (s.sub === "coppie") return setState({ sub: "draft", order: pairOrder(s.pairs) });
      if (s.sub === "draft") return setState({ sub: "carte" });
      return go("dna", { dna: computeDNA() });
  }
}
function back() {
  const prev = ui.history.pop(); if (!prev) return;
  Store.set(R("pub/state"), JSON.parse(prev));
}
function hostAction(act, el) {
  const s = st();
  if (act === "next") return next();
  if (act === "back") return back();
  if (act === "gm") { const id = el.dataset.id; return setState({ gm: s.gm === id ? null : id }, false); }
  if (act === "lampo-go") return setState({ sub: "play", t0: Date.now() });
  if (act === "rivota") return setState({ sub: "play", round: 2, t0: Date.now() });
  if (act === "ruota") {
    const pairs = makePairs();
    ui.spin = Date.now();
    render();
    setTimeout(() => { ui.spin = null; setState({ pairs }); }, 1800);
    return;
  }
  if (act === "newroom") {
    if (!confirm("Creare una stanza nuova? La partita in corso resta salvata ma nessuno ci entrerà più.")) return;
    localStorage.removeItem("ip-host-code"); location.reload();
  }
  if (act === "dna-refresh") return setState({ dna: computeDNA() }, false);
  if (act === "download") return downloadDNA();
  if (act === "fullscreen") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
}

// ============================ HOST: VISTE ============================
function progress(n, tot, label = "hanno risposto") {
  return `<div class="progress"><b>${n}/${tot}</b> ${label}<div class="pbar"><i style="width:${tot ? (n / tot) * 100 : 0}%"></i></div></div>`;
}
function whoAnswered(key, filter) {
  return `<div class="who">${playerList().filter(p => !filter || filter(p.id)).map(p => `<div class="who-i ${ans(key)[p.id] !== undefined ? "on" : ""}">${av(p.id)}</div>`).join("")}</div>`;
}
function spunti(title, list) {
  if (!list || !list.length) return "";
  return `<div class="spunti"><span>💡 ${esc(title)}</span>${list.map(x => `<em>${esc(x)}</em>`).join("")}</div>`;
}
function hostLobby() {
  const url = location.origin + location.pathname + "?r=" + CODE;
  let qr = "";
  try { const q = qrcode(0, "M"); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); } catch (e) { qr = ""; }
  const words = {}; Object.entries(ans("parola")).forEach(([u, w]) => { if (!P(u)) return; const k = String(w).trim().toLowerCase(); if (k) words[k] = (words[k] || 0) + 1; });
  const cloud = Object.entries(words).map(([w, n], i) => `<span class="w w${i % 5}" style="font-size:${2.2 + n * 1.4}rem">${esc(w)}</span>`).join("");
  const s = st();
  return `<div class="lobby">
    <div class="tile qrbox"><div class="qr">${qr}</div><div class="code">${CODE}</div><div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div></div>
    <div class="lobby-r">
      <h1 class="title">Inquadra il QR<br><span>e scegli il tuo animale</span></h1>
      <div class="players">${playerList().map(p => `<button class="pl ${s.gm === p.id ? "gm" : ""}" data-act="gm" data-id="${p.id}">${av(p.id)}<span>${esc(p.name)}</span>${s.gm === p.id ? '<em>Game Master</em>' : ""}${ans("follia")[p.id] ? '<i class="ok">✓</i>' : ""}</button>`).join("") || '<p class="muted">Ancora nessuno…</p>'}</div>
      <p class="hint">${nPlayers()}/${G.giocatoriAttesi} dentro. Tocca il tuo avatar per segnarti come Game Master: resti fuori dalle coppie.</p>
      <div class="cloud">${cloud || `<span class="muted">${esc(G.lobby.parola)}…</span>`}</div>
      ${spunti("Se non ti viene la follia, per esempio:", (G.esempi || {}).follia)}
    </div></div>`;
}
function mapStrip(conquered) {
  return `<div class="strip">${G.serate.map((x, i) => `<div class="tappa ${i < conquered ? "won" : i === conquered ? "now" : ""}">
      <div class="tile tnum">${i < conquered ? "✓" : x.n}</div><b>${esc(x.titolo)}</b><span>${esc(x.quando)}</span><small>${esc(x.cosa)}</small></div>`).join('<div class="road"></div>')}</div>`;
}
function hostBriefing() {
  const sl = G.briefing[st().sub] || G.briefing[0];
  if (sl.tipo === "mappa") return `<div class="slide"><h1 class="title">${esc(sl.titolo)}</h1>${mapStrip(0)}</div>`;
  if (sl.tipo === "ruoli") return `<div class="slide"><h1 class="title">${esc(sl.titolo)}</h1>
     <div class="roles">${sl.ruoli.map((r, i) => `<div class="tile role"><span class="rn">${i + 1}</span><b>${esc(r.nome)}</b><p>${esc(r.testo)}</p></div>`).join("")}</div>
     <p class="big-note">⚔ ${esc(sl.nota)}</p></div>`;
  return `<div class="slide"><h1 class="title">${esc(sl.titolo)}</h1>${sl.righe.map(r => `<p class="line">${esc(r)}</p>`).join("")}<p class="promise">${esc(sl.grande)}</p></div>`;
}
function hostPatto() {
  const signed = playerList().filter(p => ans("patto")[p.id]);
  const all = signed.length === nPlayers() && nPlayers() > 0;
  return `<div class="slide"><h1 class="title">Il patto della spedizione</h1>
    <ol class="patto">${G.patto.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <div class="seals">${signed.map(p => `<div class="seal">${av(p.id)}</div>`).join("")}</div>
    <p class="hint">${all ? "<b class='aur'>Patto firmato da tutti.</b>" : `${signed.length}/${nPlayers()} firme. Tieni premuto il dito sul telefono.`}</p></div>`;
}
function hostChi() {
  const s = st();
  if (s.sub === "guess") {
    const author = s.list[s.k]; const g = ans("chi_" + author);
    const guessers = playerList().filter(p => p.id !== author);
    const right = guessers.filter(p => g[p.id] === author);
    return `<div class="slide"><div class="kicker">Follia ${s.k + 1} di ${s.list.length}</div>
      <div class="tile quote">«${esc(ans("follia")[author])}»</div>
      ${s.reveal ? `<div class="reveal"><div class="flip">${av(author, "big")}</div><div><h2>L'ha scritta ${esc(P(author).name)}</h2>
        <p>${right.length ? `Indovinato da ${right.map(p => esc(p.name)).join(", ")} (+1)` : "Non l'ha indovinata nessuno."} ${guessers.length - right.length ? `${esc(P(author).name)} ne ha ingannati ${guessers.length - right.length} (+${guessers.length - right.length}).` : ""}</p>
        <p class="muted">Domanda veloce: davvero?</p></div></div>`
        : `${progress(answered("chi_" + author), nPlayers(), "hanno votato")}${whoAnswered("chi_" + author)}`}</div>`;
  }
  if (s.sub === "vote") {
    const cnt = {}; Object.values(ans("follia_vote")).forEach(a => cnt[a] = (cnt[a] || 0) + 1);
    return `<div class="slide"><h1 class="title">Quale follia facciamo davvero?</h1>
      <div class="follie">${s.list.map(a => `<div class="tile fol"><span>«${esc(ans("follia")[a])}»</span></div>`).join("")}</div>
      ${progress(answered("follia_vote"), nPlayers(), "hanno votato")}</div>`;
  }
  const w = folliaWinner();
  return `<div class="slide center"><div class="kicker">La follia scelta</div><div class="tile quote win">«${esc(w ? w.testo : "—")}»</div>
    <p class="line">${w ? `${w.votes} voti. Entra di diritto tra le candidate della serata 2.` : ""}</p></div>`;
}
function bar(r, showAv = true) {
  const tot = Math.max(1, r.tot);
  const seg = (k, cls) => r.c[k].length ? `<div class="seg ${cls}" style="flex:${r.c[k].length}"><b>${r.c[k].length}</b>${showAv ? `<div class="segav">${r.c[k].map(u => av(u)).join("")}</div>` : ""}</div>` : "";
  return `<div class="split">${seg("A", "sa")}${seg("T", "st")}${seg("B", "sb")}${r.tot === 0 ? '<div class="seg st" style="flex:1"><b>nessun voto</b></div>' : ""}</div>`;
}
function hostDilemma(lampo) {
  const s = st(); const list = lampo ? G.lampo : G.dilemmi; const d = list[s.k];
  if (lampo && s.sub === "intro") return `<div class="slide center"><div class="kicker">⚡</div><h1 class="title huge">Giro lampo</h1><p class="line">${G.lampo.length} dilemmi, 10 secondi l'uno. Niente sintonia, niente discussioni.</p></div>`;
  if (!lampo && s.sub === "intro") {
    const ex = G.dilemmi[0] || { a: "A", b: "B", domanda: "" };
    return `<div class="slide"><div class="kicker">Would you rather · come funziona</div><h1 class="title">Ogni dilemma, due domande</h1>
      <div class="howto-g"><div class="tile howto big"><span class="hn">1</span><div><b>🎯 Sintonia</b><p>Indovina cosa sceglierà <b>la maggioranza</b>. Se ci prendi, +1 punto vichingo.</p></div></div>
      <div class="tile howto big"><span class="hn">2</span><div><b>✋ Il tuo voto</b><p>Poi voti quello che vuoi <b>davvero</b>. Non dà punti: è il voto che decide il viaggio.</p></div></div></div>
      <p class="line ex">Esempio: pensi che il gruppo sceglierà «${esc(ex.a)}», ma tu preferisci «${esc(ex.b)}». Punti sulla prima per la sintonia, voti la seconda.</p></div>`;
  }
  const key = "v_" + d.id + (s.round === 2 ? "_2" : "");
  const head = `<div class="kicker">${lampo ? "⚡ Giro lampo" : (d.aurora ? "🌌 Aurora" : "Would you rather")} · ${s.k + 1}/${list.length}${s.round === 2 ? " · Rivoto" : ""}</div><h1 class="title q">${esc(d.domanda)}</h1>`;
  const cards = (r) => `<div class="ab"><div class="tile opt oa ${r && r.winner === "A" ? "win" : ""}"><span class="L">A</span>${esc(d.a)}</div><div class="vs">o</div><div class="tile opt ob ${r && r.winner === "B" ? "win" : ""}"><span class="L">B</span>${esc(d.b)}</div></div>`;
  if (s.sub === "play") {
    const bets = lampo || s.round === 2 ? "" : `<span class="muted">🎯 Sintonia: ${answered("bet_" + d.id)}/${nPlayers()}</span>`;
    return `<div class="slide">${head}${cards()}<div class="timer" data-t0="${s.t0}" data-dur="${lampo ? 10 : 20}"><i></i></div>
      ${progress(answered(key), nPlayers(), "hanno votato")} ${bets}${whoAnswered(key)}</div>`;
  }
  const r = dres(d.id);
  const betOk = lampo ? [] : playerList().filter(p => r.winner && ans("bet_" + d.id)[p.id] === r.winner);
  return `<div class="slide">${head}${cards(r)}${bar(r)}
    <div class="verdict v-${r.label.toLowerCase()}"><b>${r.label}</b> ${esc(LABEL_TXT[r.label])}</div>
    ${lampo ? "" : `<p class="hint sint-h">🎯 Sintonia ${betOk.length ? `+1: ${betOk.map(p => esc(p.name)).join(", ")}` : r.winner ? ": nessuno ci ha preso" : ": parità, nessun punto"}</p>`}</div>`;
}
function hostPunti() {
  const s = st(); const p = pres();
  if (s.sub === "collect") return `<div class="slide"><h1 class="title">Hai 100 punti. Dove li metti?</h1>
    <div class="cats">${G.categorie.map(c => `<div class="cat">${icon(c.id)}<b>${esc(c.nome)}</b></div>`).join("")}</div>
    ${progress(answered("punti"), nPlayers(), "hanno distribuito i punti")}${whoAnswered("punti")}</div>`;
  if (s.sub === "reveal") {
    const max = Math.max(1, ...p.cats.map(c => c.tot));
    const shown = p.cats.slice(G.categorie.length - s.k);
    const startRank = G.categorie.length - s.k;
    return `<div class="slide"><h1 class="title">La classifica del gruppo</h1><div class="rank">${shown.map((c, i) => `<div class="rk ${startRank + i < 3 ? "top" : ""}"><span class="pos">${startRank + i + 1}</span>${icon(c.id, "sm")}<b>${esc(c.nome)}</b><div class="rbar"><i style="width:${(c.tot / max) * 100}%"></i></div><span class="pts">${c.tot}</span><em class="acc ${c.accordo === "divisi" ? "div" : ""}">${esc(c.accordo)}</em></div>`).join("")}</div></div>`;
  }
  if (s.sub === "passione") return `<div class="slide center"><div class="kicker">La passione segreta</div>
    ${p.passCat ? `${icon(p.passCat.id, "hero")}<h1 class="title">Qualcuno ha messo ${p.pass.v} punti su ${esc(p.passCat.nome)}.</h1><p class="line">Vuoi svelarti?</p>` : "<p>Nessun dato.</p>"}</div>`;
  return `<div class="slide"><h1 class="title">Le priorità del viaggio</h1><div class="sint">
    <div class="tile sbox"><div class="kicker">Top 3</div>${p.top3.map(c => `<div class="srow">${icon(c.id, "sm")}<b>${esc(c.nome)}</b></div>`).join("")}</div>
    <div class="tile sbox"><div class="kicker">Da non sacrificare</div>${p.nonSacr ? `<div class="srow">${icon(p.nonSacr.id, "sm")}<b>${esc(p.nonSacr.nome)}</b></div><p class="muted">La passione di qualcuno, anche se è fuori dalla top 3.</p>` : '<p class="muted">La passione più forte è già in top 3.</p>'}</div>
    <div class="tile sbox"><div class="kicker">Qui si risparmia</div>${p.sacr.map(c => `<div class="srow dim">${icon(c.id, "sm")}<b>${esc(c.nome)}</b></div>`).join("")}</div></div></div>`;
}
function hostBudget() {
  const s = st();
  if (s.sub === "collect") return `<div class="slide"><h1 class="title">Budget al buio</h1>
    <p class="line">Quanto spendi per la settimana, voli esclusi? Nessuno vedrà le tue cifre: sullo schermo arriva solo il risultato del gruppo.</p>
    ${progress(Object.keys(SECRET || {}).filter(u => P(u)).length, nPlayers(), "hanno risposto")}
    ${spunti("Souvenir inutili, per esempio:", (G.esempi || {}).souvenir)}</div>`;
  if (s.sub === "reveal") {
    const b = s.budget;
    return `<div class="slide center"><h1 class="title">Il budget del gruppo</h1>${b ? `<div class="money">
      <div class="tile mbox"><div class="kicker">Obiettivo</div><b>${b.obiettivo} €</b><span>a persona, voli esclusi</span></div>
      <div class="tile mbox red"><div class="kicker">Tetto</div><b>${b.tetto} €</b><span>oltre non si va</span></div></div>
      <p class="hint">L'obiettivo è il "comodo" più basso, il tetto il "massimo" più basso: così nessuno resta fuori.</p>` : "<p>Nessuna risposta.</p>"}</div>`;
  }
  if (s.sub === "mappa") {
    const sr = speseRes(); const m = Math.max(1, ...sr.map(x => Math.max(x.su, x.giu)));
    return `<div class="slide"><h1 class="title">La mappa delle spese</h1><div class="spese">${sr.map(x => `<div class="sp"><b>${esc(x.v)}</b>
      <div class="sbar l"><i style="width:${(x.giu / m) * 100}%"></i><em>${x.giu || ""}</em></div><div class="sbar r"><i style="width:${(x.su / m) * 100}%"></i><em>${x.su || ""}</em></div></div>`).join("")}</div>
      <div class="legend"><span class="lg l">← qui risparmiamo</span><span class="lg r">qui spendiamo volentieri →</span></div></div>`;
  }
  const list = playerList().map(p => ans("souvenir")[p.id]).filter(Boolean);
  return `<div class="slide"><h1 class="title">Souvenir inutili che compreremo comunque</h1><div class="souv">${shuffle(list, CODE).map(t => `<div class="tile sv">${esc(t)}</div>`).join("")}</div></div>`;
}
function hostMissioni() {
  const s = st();
  if (s.sub === "coppie") {
    if (ui.spin) return `<div class="slide center"><h1 class="title">Formiamo le coppie…</h1><div class="spin">${shuffle(playerList().filter(p => p.id !== s.gm)).map(p => av(p.id)).join("")}</div></div>`;
    if (!s.pairs) return `<div class="slide center"><h1 class="title">Le coppie</h1><p class="line">${s.gm ? `${esc(P(s.gm)?.name || "")} è il Game Master e resta fuori.` : "Nessun Game Master segnato: entrano tutti."}</p><button class="btn big aur" data-act="ruota">Gira la ruota</button></div>`;
    const pts = points();
    return `<div class="slide"><h1 class="title">Le coppie di stasera</h1><div class="pairs">${s.pairs.map((p, i) => `<div class="tile pair"><div class="kicker">Coppia ${i + 1}</div><div class="pav">${p.map(u => avTile(u)).join("")}</div><span class="muted">⚔ ${p.reduce((t, u) => t + (pts[u] || 0), 0)} punti vichinghi</span></div>`).join("")}</div>
      <div><button class="btn ghost" data-act="ruota">Rigira</button></div></div>`;
  }
  if (s.sub === "draft") {
    const dr = draft();
    return `<div class="slide"><h1 class="title">Scegliete la missione</h1><p class="line">Sceglie per prima la coppia con più punti vichinghi.</p>
      <div class="draft">${s.order.map((pi, t) => { const m = dr.assign[pi] ? G.missioni.find(x => x.id === dr.assign[pi]) : null;
        return `<div class="tile drow ${t === dr.turn ? "now" : ""}"><span class="pos">${t + 1}</span><div class="pav">${s.pairs[pi].map(u => av(u)).join("")}</div>
          ${m ? `<div class="mpick">${icon(m.icona, "sm")}<b>${esc(m.nome)}</b></div>` : t === dr.turn ? '<em class="aur">sta scegliendo…</em>' : '<em class="muted">in attesa</em>'}</div>`; }).join("")}</div></div>`;
  }
  const dr = draft();
  return `<div class="slide"><h1 class="title">Le missioni</h1><p class="hint">Scadenza: ${esc(G.scadenzaMissioni)}.</p><div class="mcards">${Object.entries(dr.assign).map(([pi, mid]) => mcardHTML(mid, s.pairs[pi])).join("")}</div></div>`;
}
function mcardHTML(mid, pair) {
  const m = G.missioni.find(x => x.id === mid); const c = missionCard(mid);
  return `<div class="tile mcard"><div class="mhead">${icon(m.icona, "sm")}<b>${esc(m.nome)}</b></div>
    ${pair ? `<div class="pav small">${pair.map(u => av(u)).join("")}<span>${pair.map(u => esc(P(u)?.name)).join(" e ")}</span></div>` : ""}
    <p class="mobj">${esc(c.obiettivo)}</p><div class="kicker">Portate</div><ul>${c.portate.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="kicker">Dove cercare</div><p class="muted">${esc(c.dove)}</p>${c.nota ? `<p class="muted">${esc(c.nota)}</p>` : ""}
    <p class="due">Entro: ${esc(G.scadenzaMissioni)}</p></div>`;
}
function dnaHTML(d) {
  if (!d) return "";
  const cat = id => catById(id);
  const aperte = d.profilo.filter(x => x.label === "Spaccatura").map(x => dById(x.id));
  return `<div class="dna" id="dna">
    <div class="dna-h"><div><div class="kicker">The Iceland Project · ${esc(d.quando)}</div><h1>${esc(d.nome)}</h1></div>
      <div class="dna-av">${(d.giocatori || []).map(u => av(u)).join("")}</div></div>
    <div class="dna-g">
      <div class="tile dbox"><div class="kicker">Budget a persona · voli esclusi</div>${d.budget ? `<div class="dmoney"><span>Obiettivo <b>${d.budget.obiettivo} €</b></span><span>Tetto <b>${d.budget.tetto} €</b></span></div>` : '<p class="muted">—</p>'}
        <div class="kicker">Priorità</div><div class="dcats">${d.top3.map((id, i) => `<div class="dc">${icon(id, "xs")}<span>${i + 1}. ${esc(cat(id)?.nome)}</span></div>`).join("")}</div>
        ${d.nonSacr ? `<div class="dc keep">${icon(d.nonSacr, "xs")}<span>Da non sacrificare: ${esc(cat(d.nonSacr)?.nome)}</span></div>` : ""}
        <div class="dc dim"><span>Qui si risparmia: ${d.sacr.map(id => esc(cat(id)?.nome)).join(", ")}</span></div></div>
      <div class="tile dbox">${d.follia ? `<div class="kicker">La follia scelta</div><p class="dfol">«${esc(d.follia)}»</p>` : ""}
        <div class="kicker">Questioni aperte</div>${aperte.length ? `<ul>${aperte.map(x => `<li>${esc(x.domanda)} ${esc(x.a)} o ${esc(x.b)}?</li>`).join("")}</ul>` : '<p class="muted">Nessuna. Gruppo compatto.</p>'}</div>
      <div class="tile dbox"><div class="kicker">Missioni · entro ${esc(G.scadenzaMissioni)}</div>${(d.missioni || []).map(x => { const m = G.missioni.find(y => y.id === x.m); return `<div class="dm">${icon(m.icona, "xs")}<b>${esc(m.nome)}</b><span>${x.pair.map(u => esc(P(u)?.name || "")).join(" e ")}</span></div>`; }).join("")}
        <div class="kicker">Prossima serata</div><p><b>${esc(G.serate[1].titolo)}</b> · ${esc(G.serate[1].quando)}</p></div>
    </div>
    <div class="tile dbox dprof"><div class="kicker">Profilo di viaggio</div><div class="prof">${d.profilo.map(x => { const dd = dById(x.id); if (!dd) return ""; const tot = x.A + x.B; const pos = tot ? (x.B / tot) * 100 : 50;
        return `<div class="pf ${x.label === "Spaccatura" ? "open" : ""}"><span class="pa ${x.winner === "A" ? "w" : ""}">${esc(dd.a)}</span><div class="slider"><i style="left:${pos}%"></i></div><span class="pb ${x.winner === "B" ? "w" : ""}">${esc(dd.b)}</span></div>`; }).join("")}</div></div>
    </div>`;
}
function hostDNA() { return `<div class="slide">${dnaHTML(st().dna)}</div>`; }
function hostFooterExtra() {
  const s = st();
  if (s.step === "dna") return `<span class="won-chip">✓ Tappa 1 conquistata</span><button class="btn ghost" data-act="dna-refresh">Ricalcola</button><button class="btn aur" data-act="download">Scarica l'immagine</button>`;
  if ((s.step === "wyr" || s.step === "lampo") && s.sub === "result") { const list = s.step === "wyr" ? G.dilemmi : G.lampo; if (dres(list[s.k].id).label === "Spaccatura") return `<button class="btn red" data-act="rivota">Rivota</button>`; }
  if (s.step === "lampo" && s.sub === "intro") return `<button class="btn aur" data-act="lampo-go">Via!</button>`;
  return "";
}
function nextLabel() {
  const s = st();
  if (s.step === "chi" && s.sub === "guess" && !s.reveal) return "Svela";
  if ((s.step === "wyr" || s.step === "lampo") && s.sub === "play") return "Risultato";
  if (s.step === "wyr" && s.sub === "intro") return "Iniziamo";
  if (s.step === "punti" && s.sub === "collect") return "Svela la classifica";
  if (s.step === "budget" && s.sub === "collect") return "Svela il budget";
  if (s.step === "missioni" && s.sub === "carte") return "Travel DNA";
  return "Avanti";
}
function renderHost() {
  const s = st(); if (!s.step) return `<div class="center-msg">Preparo la stanza…</div>`;
  const views = { lobby: hostLobby, briefing: hostBriefing, patto: hostPatto, chi: hostChi, wyr: () => hostDilemma(false), lampo: () => hostDilemma(true), punti: hostPunti, budget: hostBudget, missioni: hostMissioni, dna: hostDNA };
  return `<div class="host">
    <header class="hbar"><div class="brand">${esc(G.titolo)} <span>· Serata 1 · ${esc(G.serate[0].titolo)}</span></div><div class="phase">${esc(STEP_NAMES[s.step] || "")}</div>
      <div class="room">${DEMO ? '<span class="mock">simulazione · non si salva nulla</span>' : Store.mock ? '<span class="mock">modalità prova</span>' : ""}<span>Stanza <b>${CODE}</b></span><span>${nPlayers()} 👤</span><button class="mini" data-act="fullscreen" title="Schermo intero">⛶</button>${DEMO ? "" : '<button class="mini" data-act="newroom" title="Nuova stanza">⟲</button>'}</div></header>
    <main class="stage">${(views[s.step] || hostLobby)()}</main>
    <footer class="hfoot"><button class="btn ghost" data-act="back" ${ui.history.length ? "" : "disabled"}>← Indietro</button><div class="fx">${hostFooterExtra()}</div>
      ${s.step === "dna" ? "" : `<button class="btn aur big" data-act="next" ${canNext() ? "" : "disabled"}>${nextLabel()} →</button>`}</footer></div>`;
}

// ============================ TELEFONO ============================
function phoneJoin() {
  const taken = new Set(playerList().map(p => p.avatar));
  const d = ui.drafts;
  return `<div class="ph-wrap"><h1 class="ptitle">${esc(G.titolo)}</h1><p class="muted">Stanza ${CODE}</p>
    <label class="lab">Come ti chiami?</label><input class="inp" id="f-name" maxlength="16" value="${esc(d.name || "")}" placeholder="Il tuo nome" autocomplete="off">
    <label class="lab">Scegli il tuo animale</label><div class="avpick">${G.avatar.map(a => `<button class="avb ${d.avatar === a.id ? "sel" : ""}" data-act="pick-av" data-id="${a.id}" ${taken.has(a.id) ? "disabled" : ""}><img src="assets/${a.id}.png" alt=""><span>${esc(a.nome)}</span></button>`).join("")}</div>
    <button class="btn aur full" data-act="join" ${d.name && d.avatar && !taken.has(d.avatar) ? "" : "disabled"}>Entra nella spedizione</button></div>`;
}
const watch = (t, sub = "") => `<div class="watch"><div class="eye">👀</div><h2>${esc(t)}</h2>${sub ? `<p class="muted">${sub}</p>` : ""}</div>`;
const done = (t = "Fatto!", sub = "Aspetta gli altri.") => `<div class="watch"><div class="eye ok">✓</div><h2>${esc(t)}</h2><p class="muted">${esc(sub)}</p></div>`;
function textQ(id, q, multi) {
  const v = ui.drafts[id] || "";
  const ex = ((G.esempi || {})[id] || [])[0]; const ph = ex ? ` placeholder="es. ${esc(ex)}"` : "";
  return `<div class="ph-wrap"><h2 class="pq">${esc(q)}</h2>${multi ? `<textarea class="inp" id="f-${id}" maxlength="140" rows="3"${ph}>${esc(v)}</textarea>` : `<input class="inp" id="f-${id}" maxlength="24" value="${esc(v)}" autocomplete="off"${ph}>`}
    <button class="btn aur full" data-act="send-text" data-id="${id}" ${v.trim() ? "" : "disabled"}>Invia</button></div>`;
}
function phoneLobby() {
  if (mine("parola") === undefined) return textQ("parola", G.lobby.parola, false);
  if (mine("follia") === undefined) return textQ("follia", G.lobby.follia, true) + `<p class="ph-note">Resta anonima: servirà per il primo gioco.</p>`;
  return done("Sei dentro!", "Aspetta che entrino tutti.");
}
function phonePatto() {
  if (mine("patto")) return done("Patto firmato", "Ora sei vincolato. Più o meno.");
  return `<div class="ph-wrap"><h2 class="pq">Il patto della spedizione</h2><ol class="patto sm">${G.patto.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <button class="hold" id="hold"><span class="ring"></span><b>Tieni premuto per firmare</b></button></div>`;
}
function phoneChi() {
  const s = st();
  if (s.sub === "guess") {
    const author = s.list[s.k]; const my = (ans("chi_" + author) || {})[ME];
    if (s.reveal) {
      if (author === ME) return done("Era la tua!", "Goditi lo svelamento.");
      return my === author ? done("Indovinato! +1", `Era di ${P(author)?.name}.`) : `<div class="watch"><div class="eye">✗</div><h2>Era di ${esc(P(author)?.name)}</h2><p class="muted">Ti ha fregato.</p></div>`;
    }
    return `<div class="ph-wrap"><div class="tile quote sm">«${esc(ans("follia")[author])}»</div>
      <h2 class="pq">${author === ME ? "È la tua! Vota qualcun altro per depistare." : "Chi l'ha scritta?"}</h2>
      <div class="avgrid">${playerList().filter(p => p.id !== ME).map(p => `<button class="avb ${my === p.id ? "sel" : ""}" data-act="ans" data-key="chi_${author}" data-v="${p.id}">${av(p.id)}<span>${esc(p.name)}</span></button>`).join("")}</div></div>`;
  }
  if (s.sub === "vote") {
    const my = mine("follia_vote");
    return `<div class="ph-wrap"><h2 class="pq">Quale follia facciamo davvero?</h2><div class="list">${s.list.map(a => `<button class="opt-b ${my === a ? "sel" : ""}" data-act="ans" data-key="follia_vote" data-v="${a}">«${esc(ans("follia")[a])}»</button>`).join("")}</div></div>`;
  }
  return watch("La follia scelta è sullo schermo");
}
function phoneDilemma(lampo) {
  const s = st(); const list = lampo ? G.lampo : G.dilemmi; const d = list[s.k];
  if (lampo && s.sub === "intro") return watch("Giro lampo!", "10 secondi a dilemma. Tieniti pronto.");
  if (!lampo && s.sub === "intro") return `<div class="ph-wrap"><h2 class="pq">Come funziona</h2>
    <div class="tile howto"><span class="hn">1</span><div><b>🎯 Sintonia</b><p>Indovina cosa sceglierà la maggioranza. Se ci prendi, <b>+1 punto vichingo</b>.</p></div></div>
    <div class="tile howto"><span class="hn">2</span><div><b>✋ Il tuo voto</b><p>Vota quello che vuoi <b>davvero</b>. Non dà punti: decide il viaggio.</p></div></div>
    <p class="ph-note">Guarda l'esempio sullo schermo.</p></div>`;
  const key = "v_" + d.id + (s.round === 2 ? "_2" : "");
  if (s.sub === "result") {
    const r = dres(d.id); const v = ans(key)[ME]; const bet = mine("bet_" + d.id);
    const sint = lampo || bet === undefined ? "" : r.winner ? (bet === r.winner ? '<div class="sint-ok">🎯 Sintonia! +1 punto vichingo</div>' : '<div class="sint-no">🎯 Sintonia mancata</div>') : '<div class="sint-no">🎯 Parità: nessun punto sintonia</div>';
    return `<div class="ph-wrap"><h2 class="pq">${esc(d.domanda)}</h2>${bar(r, false)}<div class="verdict v-${r.label.toLowerCase()}"><b>${r.label}</b></div>${sint}
      <p class="muted">Hai votato: ${v === "A" ? esc(d.a) : v === "B" ? esc(d.b) : v === "T" ? "mi va bene tutto" : "niente"}</p></div>`;
  }
  const needBet = !lampo && s.round !== 2 && mine("bet_" + d.id) === undefined;
  if (needBet) return `<div class="ph-wrap"><div class="kicker">${d.aurora ? "🌌 " : ""}${s.k + 1}/${list.length}</div><h2 class="pq">${esc(d.domanda)}</h2>
    <p class="bet-q">🎯 Sintonia: cosa sceglierà la maggioranza?</p><p class="ph-note" style="text-align:left;padding:0">Se indovini, +1 punto vichingo. Il tuo voto arriva dopo.</p>
    <button class="opt-b oa" data-act="ans" data-key="bet_${d.id}" data-v="A"><span class="L">A</span>${esc(d.a)}</button>
    <button class="opt-b ob" data-act="ans" data-key="bet_${d.id}" data-v="B"><span class="L">B</span>${esc(d.b)}</button></div>`;
  const v = ans(key)[ME];
  return `<div class="ph-wrap"><div class="kicker">${lampo ? "⚡ " : d.aurora ? "🌌 " : ""}${s.k + 1}/${list.length}${s.round === 2 ? " · Rivoto" : ""}</div><h2 class="pq">${esc(d.domanda)}</h2>
    ${!lampo && s.round !== 2 ? `<p class="bet-q">✋ E tu cosa vuoi davvero?</p><p class="ph-note" style="text-align:left;padding:0">Sintonia: hai puntato su ${mine("bet_" + d.id)}. Questo voto non dà punti, decide il viaggio.</p>` : ""}
    <button class="opt-b oa ${v === "A" ? "sel" : ""}" data-act="ans" data-key="${key}" data-v="A"><span class="L">A</span>${esc(d.a)}</button>
    <button class="opt-b ob ${v === "B" ? "sel" : ""}" data-act="ans" data-key="${key}" data-v="B"><span class="L">B</span>${esc(d.b)}</button>
    <button class="opt-b ot ${v === "T" ? "sel" : ""}" data-act="ans" data-key="${key}" data-v="T">Mi va bene tutto</button>
    ${v ? '<p class="ph-note">Votato. Puoi cambiare finché non arriva il risultato.</p>' : ""}</div>`;
}
function phonePunti() {
  const s = st();
  if (s.sub !== "collect") return watch("La classifica è sullo schermo");
  if (mine("punti") && !ui.editPunti) return `<div class="ph-wrap">${done("Punti inviati")}<button class="btn ghost full" data-act="edit-punti">Modifica</button></div>`;
  if (!ui.drafts.punti) ui.drafts.punti = mine("punti") ? { ...mine("punti") } : Object.fromEntries(G.categorie.map(c => [c.id, 0]));
  const a = ui.drafts.punti; const tot = Object.values(a).reduce((x, y) => x + (+y || 0), 0); const left = 100 - tot;
  return `<div class="ph-wrap"><h2 class="pq">Hai 100 punti. Dove li metti?</h2>
    <div class="left ${left === 0 ? "ok" : left < 0 ? "bad" : ""}">${left === 0 ? "Perfetto: 100 su 100" : left > 0 ? `Ne restano <b>${left}</b>` : `Sei oltre di ${-left}`}</div>
    <div class="alloc">${G.categorie.map(c => `<div class="al">${icon(c.id, "xs")}<div class="al-t"><b>${esc(c.nome)}</b><small>${esc(c.desc)}</small></div>
      <div class="stepper"><button data-act="pt" data-id="${c.id}" data-d="-5">−</button><span>${a[c.id] || 0}</span><button data-act="pt" data-id="${c.id}" data-d="5" ${left <= 0 ? "disabled" : ""}>+</button></div></div>`).join("")}</div>
    <button class="btn aur full" data-act="send-punti" ${left === 0 ? "" : "disabled"}>Invia</button></div>`;
}
function phoneBudget() {
  const s = st();
  if (s.sub !== "collect") return watch(s.sub === "souvenir" ? "Souvenir sullo schermo" : "Il budget del gruppo è sullo schermo");
  if ((ui.budgetSent || mine("spese")) && !ui.editBudget) return `<div class="ph-wrap">${done("Inviato", "Nessuno vedrà le tue cifre.")}<button class="btn ghost full" data-act="edit-budget">Modifica</button></div>`;
  const d = ui.drafts; d.spend = d.spend || [];
  const c = +d.comodo || 0, m = +d.max || 0;
  const ok = c > 0 && m >= c && d.spend.length === 2 && d.save && (d.souvenir || "").trim();
  return `<div class="ph-wrap"><h2 class="pq">Budget al buio</h2><p class="muted">Per tutta la settimana, voli esclusi: mezzo, benzina, alloggi, cibo, attività. Le cifre restano segrete.</p>
    <label class="lab">Quanto spendi senza pensarci?</label><div class="eur"><input class="inp" id="f-comodo" type="number" inputmode="numeric" min="0" step="50" value="${esc(d.comodo || "")}" placeholder="es. 900"><span>€</span></div>
    <label class="lab">Il limite oltre cui non vai</label><div class="eur"><input class="inp" id="f-max" type="number" inputmode="numeric" min="0" step="50" value="${esc(d.max || "")}" placeholder="es. 1200"><span>€</span></div>
    ${m && c && m < c ? '<p class="warn">Il limite deve essere almeno quanto il comodo.</p>' : ""}
    <label class="lab">Su cosa spenderesti volentieri? <small>(scegline 2)</small></label><div class="chips">${G.budget.voci.map(v => `<button class="chip ${d.spend.includes(v) ? "sel" : ""}" data-act="spend" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div>
    <label class="lab">Su cosa risparmieresti? <small>(scegline 1)</small></label><div class="chips">${G.budget.voci.map(v => `<button class="chip save ${d.save === v ? "sel" : ""}" data-act="save" data-v="${esc(v)}" ${d.spend.includes(v) ? "disabled" : ""}>${esc(v)}</button>`).join("")}</div>
    <label class="lab">${esc(G.budget.souvenir)}</label><input class="inp" id="f-souvenir" maxlength="60" value="${esc(d.souvenir || "")}" autocomplete="off"${((G.esempi || {}).souvenir || [])[0] ? ` placeholder="es. ${esc(G.esempi.souvenir[0])}"` : ""}>
    <button class="btn aur full" data-act="send-budget" ${ok ? "" : "disabled"}>Invia</button></div>`;
}
function phoneMissioni() {
  const s = st(); const pi = myPair();
  if (s.sub === "coppie") {
    if (!s.pairs) return watch(ME === s.gm ? "Sei il Game Master" : "Si formano le coppie…", ME === s.gm ? "Resti fuori dalle missioni." : "");
    if (pi < 0) return watch("Sei il Game Master", "Resti fuori dalle missioni.");
    const partner = s.pairs[pi].filter(u => u !== ME);
    return `<div class="watch">${partner.map(u => av(u, "big")).join("")}<h2>Sei in coppia con ${partner.map(u => esc(P(u)?.name)).join(" e ")}</h2></div>`;
  }
  const dr = draft();
  if (s.sub === "draft") {
    if (pi < 0) return watch("Le coppie scelgono le missioni");
    if (dr.assign[pi]) return done("Missione scelta", G.missioni.find(m => m.id === dr.assign[pi]).nome);
    const myTurn = s.order[dr.turn] === pi;
    if (!myTurn) { const pos = s.order.indexOf(pi); return watch(`Scegliete per ${pos + 1}ª`, "Aspettate il vostro turno."); }
    return `<div class="ph-wrap"><h2 class="pq">Tocca a voi: scegliete la missione</h2>${G.missioni.map(m => `<button class="opt-b mis" data-act="pick" data-id="${m.id}" ${dr.taken && dr.taken[m.id] ? "disabled" : ""}>${icon(m.icona, "xs")}<b>${esc(m.nome)}</b><small>${esc(missionCard(m.id).obiettivo)}</small></button>`).join("")}</div>`;
  }
  if (pi < 0 || !dr.assign[pi]) return watch("Le missioni sono sullo schermo");
  return `<div class="ph-wrap">${mcardHTML(dr.assign[pi], s.pairs[pi])}</div>`;
}
function phoneDNA() {
  return `<div class="ph-wrap">${dnaHTML(st().dna)}<button class="btn aur full" data-act="download">Salva l'immagine</button></div>`;
}
function renderPhone() {
  if (!Object.keys(S.state || {}).length && !P(ME)) { if (S._loaded) return `<div class="center-msg">Stanza ${esc(CODE)} non trovata.<br><small>Controlla il codice.</small></div>`; return `<div class="center-msg">Collegamento…</div>`; }
  if (!P(ME)) return phoneJoin();
  const s = st(); const pts = points()[ME] || 0;
  const views = { lobby: phoneLobby, briefing: () => watch(G.briefing[s.sub]?.titolo || "Guarda lo schermo", "Ascolta il Game Master."), patto: phonePatto, chi: phoneChi, wyr: () => phoneDilemma(false), lampo: () => phoneDilemma(true), punti: phonePunti, budget: phoneBudget, missioni: phoneMissioni, dna: phoneDNA };
  return `<div class="phone"><header class="phbar">${av(ME)}<b>${esc(P(ME).name)}</b><span class="pts">⚔ ${pts}</span></header>
    <main>${(views[s.step] || phoneLobby)()}</main></div>`;
}
function phoneAction(act, el) {
  const s = st(); const d = ui.drafts;
  if (act === "pick-av") { d.avatar = el.dataset.id; return render(); }
  if (act === "join") {
    if (!d.name || !d.avatar) return;
    if (playerList().some(p => p.avatar === d.avatar)) { d.avatar = null; return render(); }
    return Store.set(R(`pub/players/${ME}`), { name: d.name.trim().slice(0, 16), avatar: d.avatar, joinedAt: Date.now() });
  }
  if (act === "send-text") { const id = el.dataset.id; const v = (d[id] || "").trim(); if (v) { ui.focus = null; answer(id, v); } return; }
  if (act === "ans") return answer(el.dataset.key, el.dataset.v);
  if (act === "pt") { const a = d.punti; const tot = Object.values(a).reduce((x, y) => x + y, 0); const delta = +el.dataset.d; const nv = (a[el.dataset.id] || 0) + delta; if (nv < 0 || (delta > 0 && tot >= 100)) return; a[el.dataset.id] = nv; return render(); }
  if (act === "send-punti") { ui.editPunti = false; return answer("punti", d.punti); }
  if (act === "edit-punti") { ui.editPunti = true; d.punti = { ...mine("punti") }; return render(); }
  if (act === "spend") { const v = el.dataset.v; d.spend = d.spend || []; if (d.spend.includes(v)) d.spend = d.spend.filter(x => x !== v); else if (d.spend.length < 2) d.spend = [...d.spend, v]; else d.spend = [d.spend[1], v]; if (d.save === v) d.save = null; return render(); }
  if (act === "save") { d.save = el.dataset.v; return render(); }
  if (act === "send-budget") {
    ui.budgetSent = true; ui.editBudget = false; ui.focus = null;
    Store.set(R(`secret/${ME}`), { budget: { comodo: +d.comodo, max: +d.max } });
    answer("spese", { spend: d.spend, save: d.save });
    answer("souvenir", d.souvenir.trim());
    return render();
  }
  if (act === "edit-budget") { ui.editBudget = true; return render(); }
  if (act === "pick") { const pi = myPair(); if (pi < 0) return; return answer("pick_" + pi, { m: el.dataset.id, at: Date.now() }); }
  if (act === "download") return downloadDNA();
}

// ============================ DNA IMMAGINE ============================
function downloadDNA() {
  const el = document.getElementById("dna"); if (!el || !window.html2canvas) return;
  el.classList.add("shot");
  html2canvas(el, { backgroundColor: "#1F2633", scale: 2, useCORS: true }).then(c => {
    el.classList.remove("shot");
    const a = document.createElement("a"); a.download = "travel-dna.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
  }).catch(() => el.classList.remove("shot"));
}


// ============================ SIMULAZIONE: GIOCATORI FINTI ============================
const Bots = {
  nomi: ["Giulia", "Luca", "Marta", "Sara", "Tommi", "Ele"],
  parole: ["Aurora", "Freddo", "Avventura", "Ghiaccio", "Libertà", "Magia", "Vento", "Aurora"],
  follie: ["Fare il bagno in una pozza calda a -10°", "Assaggiare lo squalo fermentato senza fare facce", "Dormire nel furgone sotto l'aurora", "Imparare una canzone in islandese", "Cavalcare un cavallo islandese nella neve", "Toccare un iceberg sulla spiaggia nera"],
  souvenir: ["Un elmo vichingo di plastica", "Una calamita a forma di pulcinella", "Un barattolo di aria islandese", "Un troll di legno", "Sale nero vulcanico", "Una felpa «I survived Iceland»"],
  ids: [], done: new Set(), lean: {},
  start() {
    this.ids = this.nomi.map((_, i) => "bot" + (i + 1));
    this.ids.forEach((id, i) => setTimeout(() => {
      const taken = new Set(playerList().map(p => p.avatar));
      const free = G.avatar.filter(a => !taken.has(a.id));
      if (!free.length || P(id)) return;
      Store.set(R(`pub/players/${id}`), { name: this.nomi[i], avatar: free[rnd(free.length)].id, joinedAt: Date.now() });
    }, ((DUO ? 2500 : 1200) + i * (900 + Math.random() * 900)) / SPEED));
  },
  later(key, fn, min, max) {
    if (this.done.has(key)) return; this.done.add(key);
    setTimeout(() => { try { fn(); } catch (e) { console.warn(e); } }, (min + Math.random() * (max - min)) / SPEED);
  },
  ans(b, key, v) { return Store.set(R(`pub/ans/${key}/${b}`), v); },
  pick(arr) { return arr[rnd(arr.length)]; },
  tick() {
    const s = st(); if (!s.step) return;
    const joined = this.ids.filter(b => P(b));
    joined.forEach((b, i) => {
      const k = (x) => b + "|" + x;
      if (s.step === "lobby") {
        if (ans("parola")[b] === undefined) this.later(k("parola"), () => this.ans(b, "parola", this.pick(this.parole)), 1500, 5000);
        if (ans("follia")[b] === undefined) this.later(k("follia"), () => this.ans(b, "follia", this.follie[i % this.follie.length]), 4000, 10000);
      }
      if (s.step === "patto" && !ans("patto")[b]) this.later(k("patto"), () => this.ans(b, "patto", Date.now()), 1500, 6000);
      if (s.step === "chi" && s.sub === "guess" && !s.reveal) {
        const author = s.list[s.k];
        const others = playerList().map(p => p.id).filter(id => id !== b && id !== author);
        this.later(k("chi" + author), () => this.ans(b, "chi_" + author, b !== author && Math.random() < 0.35 ? author : this.pick(others.length ? others : [author])), 2000, 7000);
      }
      if (s.step === "chi" && s.sub === "vote") this.later(k("fv"), () => this.ans(b, "follia_vote", this.pick(s.list)), 1500, 5000);
      if ((s.step === "wyr" || s.step === "lampo") && s.sub === "play") {
        const d = (s.step === "wyr" ? G.dilemmi : G.lampo)[s.k]; if (!d) return;
        if (this.lean[d.id] === undefined) this.lean[d.id] = Math.random();
        const L = this.lean[d.id]; const fast = s.step === "lampo";
        const vote = () => Math.random() < 0.1 ? "T" : (Math.random() < L ? "A" : "B");
        if (s.round === 2) { this.later(k("v2" + d.id), () => this.ans(b, "v_" + d.id + "_2", Math.random() < 0.5 + (L - 0.5) * 1.6 ? "A" : "B"), 1500, 5000); return; }
        if (!fast) this.later(k("bet" + d.id), () => this.ans(b, "bet_" + d.id, Math.random() < L ? "A" : "B"), 1000, 4000);
        this.later(k("v" + d.id), () => this.ans(b, "v_" + d.id, vote()), fast ? 1000 : 4000, fast ? 5000 : 11000);
      }
      if (s.step === "punti" && s.sub === "collect") this.later(k("punti"), () => {
        const w = G.categorie.map(c => (c.id === "aurora" ? 3 : 0.3 + Math.random() * 1.7));
        const a = Object.fromEntries(G.categorie.map(c => [c.id, 0]));
        for (let n = 0; n < 20; n++) { let r = Math.random() * w.reduce((x, y) => x + y, 0), j = 0; while ((r -= w[j]) > 0) j++; a[G.categorie[j].id] += 5; }
        this.ans(b, "punti", a);
      }, 4000, 12000);
      if (s.step === "budget" && s.sub === "collect") this.later(k("budget"), () => {
        const comodo = 700 + rnd(9) * 50, max = comodo + 200 + rnd(7) * 50;
        Store.set(R(`secret/${b}`), { budget: { comodo, max } });
        const voci = shuffle(G.budget.voci); this.ans(b, "spese", { spend: voci.slice(0, 2), save: voci[2] });
        this.ans(b, "souvenir", this.souvenir[i % this.souvenir.length]);
      }, 4000, 12000);
      if (s.step === "missioni" && s.sub === "draft") {
        const dr = draft(); if (dr.done) return;
        const pi = s.order[dr.turn]; const pair = (s.pairs || [])[pi] || [];
        if (pair.includes(ME) || pair[0] !== b) return;
        this.later(k("pick" + dr.turn), () => {
          const d2 = draft(); const taken = new Set(Object.values(d2.assign));
          const free = G.missioni.filter(m => !taken.has(m.id));
          if (free.length) this.ans(b, "pick_" + pi, { m: this.pick(free).id, at: Date.now() });
        }, 2500, 5000);
      }
    });
  }
};


// ============================ TESTI SALVATI (pagina admin) ============================
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
async function loadSavedCfg() {
  try {
    if (LOCAL) { const d = JSON.parse(localStorage.getItem("ip-mock") || "{}"); return (d.cfg && d.cfg.game) || null; }
    const fc = window.FIREBASE_CONFIG || {};
    if (!fc.apiKey || !window.firebase) return null;
    if (!firebase.apps.length) firebase.initializeApp(fc);
    const auth = firebase.auth();
    if (!auth.currentUser) {
      const u = await withTimeout(new Promise(r => { const off = auth.onAuthStateChanged(x => { off(); r(x); }); }), 6000);
      if (!u) await withTimeout(auth.signInAnonymously(), 8000);
    }
    const snap = await withTimeout(firebase.database().ref("cfg/game").get(), 8000);
    return snap.val();
  } catch (e) { console.warn("testi salvati non caricati, uso quelli di base", e); return null; }
}

const LINKED = { D1: "decide il mezzo nella missione", D4: "decide l'alloggio nella missione", D5: "basi o spostamenti nelle missioni", D6: "alloggio e nome spedizione", D14: "cucina nella missione alloggi", D7: "nome spedizione", D8: "nome spedizione", D9: "nome spedizione" };
const NOMI_LABEL = { cacciatori: "Aurora in top 3 + sveglia per tutti", notturni: "Aurora in top 3 + cottage isolato", terme: "Terme in top 3", mattinieri: "Sveglia alle 7 + più posti", lowcost: "Budget basso + cucinare insieme", comodi: "Tutti gli altri casi" };
const newId = () => "X" + Date.now().toString(36) + rnd(1000);
const ADMIN_SCHEMA = [
  { key: "serate", title: "Le 4 serate", kind: "list", fixed: true, item: i => `Serata ${i + 1}`, fields: () => [["titolo", "Titolo"], ["quando", "Quando"], ["cosa", "Cosa si decide"]] },
  { key: "lobby", title: "Lobby: le due domande d'ingresso", kind: "obj", fields: () => [["parola", "Domanda «in una parola»"], ["follia", "Domanda nascosta (per «Chi l'ha detto?»)"]] },
  { key: "esempi", title: "Spunti per le domande aperte", hint: "Uno per riga. Compaiono sullo schermo del Game Master; il primo anche come esempio in grigio sul telefono.", kind: "obj", fields: () => [["parola", "Spunti: in una parola", "lines"], ["follia", "Spunti: la cosa più folle", "lines"], ["souvenir", "Spunti: souvenir inutili", "lines"]] },
  { key: "briefing", title: "Il briefing (slide iniziali)", kind: "list", fixed: true, item: (i, x) => `Slide ${i + 1}` + (x.tipo === "mappa" ? " · mappa delle serate" : x.tipo === "ruoli" ? " · i ruoli" : ""),
    fields: x => x.tipo === "mappa" ? [["titolo", "Titolo"]] : x.tipo === "ruoli" ? [["titolo", "Titolo"], ["nota", "Nota in fondo", "area"]] : [["titolo", "Titolo"], ["righe", "Righe (una per riga)", "lines"], ["grande", "Frase finale grande"]],
    sub: x => x.tipo === "ruoli" ? { key: "ruoli", fields: [["nome", "Ruolo"], ["testo", "Descrizione"]] } : null },
  { key: "patto", title: "Il patto", hint: "Una regola per riga.", kind: "lines" },
  { key: "dilemmi", title: "Would you rather (con sintonia)", hint: "🔗 = il risultato viene usato anche per compilare le missioni o il nome della spedizione: puoi cambiare le parole, ma tieni lo stesso significato.", kind: "list",
    add: () => ({ id: newId(), aurora: false, domanda: "", a: "", b: "" }), item: (i, x) => `${i + 1}.` + (LINKED[x.id] ? ` 🔗 ${LINKED[x.id]}` : ""),
    fields: () => [["domanda", "Domanda"], ["a", "Opzione A"], ["b", "Opzione B"], ["aurora", "Dilemma sull'aurora 🌌", "check"]] },
  { key: "lampo", title: "Giro lampo", kind: "list", add: () => ({ id: newId(), domanda: "", a: "", b: "" }), item: (i, x) => `${i + 1}.` + (LINKED[x.id] ? ` 🔗 ${LINKED[x.id]}` : ""), fields: () => [["domanda", "Domanda"], ["a", "Opzione A"], ["b", "Opzione B"]] },
  { key: "categorie", title: "I 100 punti: le 8 categorie", hint: "Le icone restano quelle: puoi cambiare nome e descrizione.", kind: "list", fixed: true, item: (i, x) => `${i + 1}. ${x.id}`, fields: () => [["nome", "Nome"], ["desc", "Descrizione"]] },
  { key: "budget", title: "Budget al buio", kind: "obj", fields: () => [["voci", "Voci di spesa (una per riga)", "lines"], ["souvenir", "Domanda sul souvenir"]] },
  { key: "missioni", title: "Le missioni", hint: "Il contenuto delle carte si compila da solo con le scelte del gruppo; qui cambi il nome.", kind: "list", fixed: true, item: (i, x) => x.id, fields: () => [["nome", "Nome"]] },
  { key: "scadenzaMissioni", title: "Scadenza delle missioni", kind: "text" },
  { key: "nomi", title: "Nomi della spedizione (Travel DNA)", kind: "obj", fields: () => Object.keys(DEFAULTS.nomi).map(k => [k, NOMI_LABEL[k] || k]) }
];
const adm = { data: null, state: "loading", msg: "", dirty: false, open: new Set(["dilemmi"]) };
const getPath = (o, path) => path.split(".").reduce((x, k) => x == null ? x : x[k], o);
function setPath(o, path, v) { const ks = path.split("."); let x = o; ks.slice(0, -1).forEach(k => x = x[k]); x[ks[ks.length - 1]] = v; }
function admField(path, label, type, val) {
  const id = "a-" + path.replace(/\./g, "_");
  if (type === "check") return `<label class="af chk"><input type="checkbox" data-adm="${path}" data-t="check" ${val ? "checked" : ""}> ${esc(label)}</label>`;
  if (type === "lines") { const arr = Array.isArray(val) ? val : []; return `<label class="af"><span>${esc(label)}</span><textarea id="${id}" data-adm="${path}" data-t="lines" rows="${Math.max(3, arr.length + 1)}">${esc(arr.join("\n"))}</textarea></label>`; }
  if (type === "area") return `<label class="af"><span>${esc(label)}</span><textarea id="${id}" data-adm="${path}" rows="2">${esc(val || "")}</textarea></label>`;
  return `<label class="af"><span>${esc(label)}</span><input id="${id}" data-adm="${path}" value="${esc(val || "")}"></label>`;
}
function admSection(sec) {
  const v = adm.data[sec.key]; let body = "";
  if (sec.kind === "text") body = admField(sec.key, sec.title, "text", v);
  else if (sec.kind === "lines") body = admField(sec.key, "Testo", "lines", v);
  else if (sec.kind === "obj") body = sec.fields().map(([k, l, t]) => admField(`${sec.key}.${k}`, l, t, (v || {})[k])).join("");
  else {
    const arr = v || [];
    body = arr.map((x, i) => {
      const sub = sec.sub && sec.sub(x);
      return `<div class="ai"><div class="ai-h"><b>${esc(sec.item(i, x))}</b>${sec.fixed ? "" : `<span class="ai-b"><button data-act="adm-up" data-key="${sec.key}" data-i="${i}" ${i ? "" : "disabled"} title="Su">↑</button><button data-act="adm-down" data-key="${sec.key}" data-i="${i}" ${i < arr.length - 1 ? "" : "disabled"} title="Giù">↓</button><button data-act="adm-del" data-key="${sec.key}" data-i="${i}" title="Elimina">✕</button></span>`}</div>
        <div class="ai-f">${sec.fields(x).map(([k, l, t]) => admField(`${sec.key}.${i}.${k}`, l, t, x[k])).join("")}
        ${sub ? (x[sub.key] || []).map((y, j) => `<div class="ai-sub">${sub.fields.map(([k, l]) => admField(`${sec.key}.${i}.${sub.key}.${j}.${k}`, l, "text", y[k])).join("")}</div>`).join("") : ""}</div></div>`;
    }).join("") + (sec.add ? `<button class="btn ghost" data-act="adm-add" data-key="${sec.key}">+ Aggiungi</button>` : "");
  }
  const count = Array.isArray(v) && sec.kind === "list" ? ` <small>(${v.length})</small>` : "";
  return `<details data-sec="${sec.key}" ${adm.open.has(sec.key) ? "open" : ""}><summary>${esc(sec.title)}${count}</summary>${sec.hint ? `<p class="ah">${esc(sec.hint)}</p>` : ""}${body}</details>`;
}
function renderAdmin() {
  if (adm.state === "loading") return `<div class="center-msg">Carico i testi…</div>`;
  if (adm.state === "claim") return `<div class="center-msg"><div><h1 class="ptitle">Pagina admin</h1><p class="muted">Nessun amministratore ancora. Il computer da cui premi il pulsante diventa l'unico che può modificare i testi.</p><br><button class="btn aur" data-act="adm-claim">Diventa amministratore</button></div></div>`;
  if (adm.state === "denied") return `<div class="center-msg"><div><h1 class="ptitle">Pagina admin</h1><p class="muted">Solo il computer dell'amministratore può modificare i testi.</p></div></div>`;
  const n = (adm.data.dilemmi || []).length, l = (adm.data.lampo || []).length;
  return `<div class="admin"><header class="adm-h"><div><h1>Testi del gioco</h1><p class="muted">${n} dilemmi + ${l} lampo · ${(adm.data.patto || []).length} regole del patto. Le modifiche valgono dalla prossima stanza creata (o simulazione).</p></div>
    <div class="adm-btns"><a class="btn ghost" href="?demo=gm" target="_blank">Prova (simulazione)</a><button class="btn ghost" data-act="adm-reset">Ripristina originali</button><button class="btn aur" id="adm-save" data-act="adm-save">${adm.dirty ? "Salva" : "Salvato ✓"}</button></div></header>
    ${adm.msg ? `<div class="adm-msg">${adm.msg}</div>` : ""}
    <div class="adm-body">${ADMIN_SCHEMA.map(admSection).join("")}</div></div>`;
}
function admValidate() {
  const errs = [];
  ["dilemmi", "lampo"].forEach(k => (adm.data[k] || []).forEach((d, i) => { if (!String(d.domanda || "").trim() || !String(d.a || "").trim() || !String(d.b || "").trim()) errs.push(`${k === "dilemmi" ? "Dilemma" : "Lampo"} ${i + 1}: mancano domanda o opzioni`); }));
  if (!(adm.data.dilemmi || []).length) errs.push("Serve almeno un dilemma");
  if ((adm.data.budget?.voci || []).length < 3) errs.push("Servono almeno 3 voci di spesa");
  return errs;
}
async function adminAction(act, el) {
  const key = el.dataset.key, i = +el.dataset.i;
  const arr = key ? adm.data[key] : null;
  if (act === "adm-claim") { await Store.set("cfg/admin", ME); return startAdmin(); }
  if (act === "adm-add") { const sec = ADMIN_SCHEMA.find(x => x.key === key); arr.push(sec.add()); adm.dirty = true; adm.open.add(key); return renderA(); }
  if (act === "adm-del") { if (!confirm("Eliminare questa voce?")) return; arr.splice(i, 1); adm.dirty = true; return renderA(); }
  if (act === "adm-up" && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; adm.dirty = true; return renderA(); }
  if (act === "adm-down" && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; adm.dirty = true; return renderA(); }
  if (act === "adm-save") {
    const errs = admValidate();
    if (errs.length) { adm.msg = "Non salvato: " + errs.map(esc).join(" · "); return renderA(); }
    const out = {}; EDITABLE.forEach(k => out[k] = adm.data[k]);
    try { await Store.set("cfg/game", JSON.parse(JSON.stringify(out))); adm.dirty = false; adm.msg = "Salvato. Le prossime stanze useranno questi testi."; }
    catch (e) { adm.msg = "Errore nel salvataggio: " + esc(e.code || e.message || e); }
    return renderA();
  }
  if (act === "adm-reset") {
    if (!confirm("Tornare ai testi originali? Le tue modifiche salvate verranno cancellate.")) return;
    try { await Store.set("cfg/game", null); } catch (e) {}
    adm.data = JSON.parse(JSON.stringify(DEFAULTS)); adm.dirty = false; adm.msg = "Testi originali ripristinati."; return renderA();
  }
}
function renderA() { app.innerHTML = renderAdmin(); }
async function startAdmin() {
  document.documentElement.classList.add("is-admin");
  const owner = await Store.get("cfg/admin");
  if (!owner) { adm.state = "claim"; return renderA(); }
  if (owner !== ME) { adm.state = "denied"; return renderA(); }
  const saved = await Store.get("cfg/game");
  adm.data = JSON.parse(JSON.stringify(DEFAULTS));
  if (saved) EDITABLE.forEach(k => { if (saved[k] !== undefined && saved[k] !== null) adm.data[k] = saved[k]; });
  adm.state = "ready"; renderA();
}
document.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.sec) d.open ? adm.open.add(d.dataset.sec) : adm.open.delete(d.dataset.sec); }, true);
document.addEventListener("input", e => {
  const path = e.target.dataset && e.target.dataset.adm; if (!path || !adm.data) return;
  const t = e.target.dataset.t;
  const v = t === "check" ? e.target.checked : t === "lines" ? e.target.value.split("\n").map(x => x.trim()).filter(Boolean) : e.target.value;
  setPath(adm.data, path, v); adm.dirty = true;
  const b = document.getElementById("adm-save"); if (b) b.textContent = "Salva";
});
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.t === "check" && e.target.dataset.adm) { setPath(adm.data, e.target.dataset.adm, e.target.checked); adm.dirty = true; const b = document.getElementById("adm-save"); if (b) b.textContent = "Salva"; } });
window.addEventListener("beforeunload", e => { if (ADMIN && adm.dirty) { e.preventDefault(); e.returnValue = ""; } });

// ============================ RENDER ============================
let lastHTML = "";
let lastPhone = "";
function render() {
  if (DUO) lastPhone = renderPhone();
  const html = DUO ? `<div class="duo"><div class="duo-host">${renderHost()}</div><div class="duo-phone"><div class="duo-label">Il tuo telefono</div><div class="phone-frame">${lastPhone}</div></div></div>` : IS_HOST ? renderHost() : renderPhone();
  if (html === lastHTML) return;
  const fid = document.activeElement && document.activeElement.id;
  const sel = fid && document.activeElement.selectionStart;
  app.innerHTML = html; lastHTML = html;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} } }
  bindHold();
}
function tick() {
  document.querySelectorAll(".timer").forEach(t => {
    const t0 = +t.dataset.t0, dur = +t.dataset.dur * 1000; const left = Math.max(0, 1 - (Date.now() - t0) / dur);
    t.firstElementChild.style.width = left * 100 + "%"; t.classList.toggle("end", left === 0);
  });
  requestAnimationFrame(tick);
}
function bindHold() {
  const h = document.getElementById("hold"); if (!h) return;
  const start = e => { e.preventDefault(); h.classList.add("on"); ui.hold = setTimeout(() => { h.classList.add("signed"); if (navigator.vibrate) navigator.vibrate(60); answer("patto", Date.now()); }, 1300); };
  const stop = () => { h.classList.remove("on"); clearTimeout(ui.hold); };
  h.addEventListener("pointerdown", start); h.addEventListener("pointerup", stop); h.addEventListener("pointerleave", stop); h.addEventListener("pointercancel", stop);
  h.addEventListener("contextmenu", e => e.preventDefault());
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === "host-start") { location.search = "?host"; return; }
  if (act === "code-go") { const c = (document.getElementById("f-code").value || "").toUpperCase().trim(); if (c) location.search = "?r=" + c; return; }
  if (ADMIN) return adminAction(act, el);
  if (DUO) return el.closest(".duo-host") ? hostAction(act, el) : phoneAction(act, el);
  IS_HOST ? hostAction(act, el) : phoneAction(act, el);
});
document.addEventListener("input", e => {
  const id = e.target.id; if (ADMIN || !id || !id.startsWith("f-")) return;
  const k = id.slice(2); ui.drafts[k] = e.target.value;
  if (!IS_HOST) {
    const html = renderPhone();
    const root = DUO ? document.querySelector(".phone-frame") : document;
    if (html !== (DUO ? lastPhone : lastHTML)) { // aggiorna solo i pulsanti senza perdere il focus
      const tmp = document.createElement("div"); tmp.innerHTML = html;
      root.querySelectorAll("button[data-act]").forEach((b, i) => { const nb = tmp.querySelectorAll("button[data-act]")[i]; if (nb) b.disabled = nb.disabled; });
      const w = root.querySelector(".warn"), nw = tmp.querySelector(".warn");
      if (!!w !== !!nw) { lastHTML = ""; render(); }
    }
  }
});
document.addEventListener("keydown", e => {
  if (ADMIN || (!IS_HOST && !DUO) || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
  if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); back(); }
});

function landing() {
  app.innerHTML = `<div class="landing"><img class="lg-av" src="assets/pulcinella.png" alt=""><h1 class="ptitle">${esc(G.titolo)}</h1>
    <p class="muted">Inserisci il codice della stanza</p><input class="inp code-in" id="f-code" maxlength="6" autocomplete="off" placeholder="CODICE">
    <button class="btn aur full" data-act="code-go">Entra</button><button class="btn ghost full" data-act="host-start">Sono il Game Master</button>
    <p class="muted" style="margin-top:1.4em">Simulazione (non salva nulla)</p>
    <a class="btn ghost full" href="?demo=gm">Prova come Game Master</a><a class="btn ghost full" href="?demo=giocatore">Prova come giocatore</a></div>`;
}

// ============================ AVVIO ============================
async function start() {
  if (!IS_HOST && !CODE && !DEMO && !ADMIN) return landing();
  try { await Store.init(); } catch (e) {
    app.innerHTML = `<div class="center-msg"><div>Non riesco a collegarmi.<br><br><small class="muted">Controlla la connessione. Se usi un blocco pubblicità o una VPN, prova a disattivarli per questa pagina.</small><br><br><button class="btn aur" onclick="location.reload()">Riprova</button><br><br><small class="muted" style="font-size:.7em">${esc(e.code || e.message || e)}</small></div></div>`;
    return;
  }
  ME = Store.uid;
  if (ADMIN) return startAdmin();
  if (DEMO) {
    document.documentElement.classList.add(DUO ? "is-duo" : "is-host");
    CODE = "DEMO";
    const saved = await loadSavedCfg();
    await Store.set(R("host"), ME);
    if (saved) await Store.set(R("pub/cfg"), saved);
    await Store.set(R("pub/state"), { step: "lobby", sub: 0, k: 0, t0: Date.now() });
    Store.on(R("secret"), v => { SECRET = v || {}; render(); });
    Store.on(R("pub"), v => { S = v || {}; S.state = S.state || {}; S._loaded = true; applyCfg(S.cfg); render(); Bots.tick(); });
    Bots.start();
    render(); tick();
    return;
  }
  if (IS_HOST) {
    document.documentElement.classList.add("is-host");
    CODE = localStorage.getItem("ip-host-code") || "";
    if (CODE) { const h = await Store.get(R("host")); if (h && h !== ME) CODE = ""; }
    if (!CODE) {
      const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      CODE = Array.from({ length: 4 }, () => L[rnd(L.length)]).join("");
      await Store.set(R("host"), ME);
      localStorage.setItem("ip-host-code", CODE);
      const saved = await loadSavedCfg();
      if (saved) await Store.set(R("pub/cfg"), saved);
    }
    const cur = await Store.get(R("pub/state"));
    if (!cur) await Store.set(R("pub/state"), { step: "lobby", sub: 0, k: 0, t0: Date.now() });
    Store.on(R("secret"), v => { SECRET = v || {}; render(); });
  } else {
    document.documentElement.classList.add("is-phone");
  }
  Store.on(R("pub"), v => { S = v || {}; S.state = S.state || {}; S._loaded = true; applyCfg(S.cfg); render(); });
  render(); tick();
}
start();
})();
