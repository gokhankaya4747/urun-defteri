/* Ürün Defteri — bağımsız sürüm çalışma katmanı.
   Supabase'i, uygulamanın beklediği küçük belge-veritabanı arayüzüne (collection/doc/onSnapshot)
   uyarlar; giriş ekranını ve kullanıcı yetkisini yönetir. */
(() => {
"use strict";
const CFG = window.UD_CONFIG || {};
const $ = id => document.getElementById(id);
const BUCKET = "belgeler";
let resolveRT; const rtReady = new Promise(r => (resolveRT = r));
window.claude = { use: async name => { const rt = await rtReady; return rt[name] ?? null; } };

/* ---------- giriş ekranı ---------- */
const MSG = {
  "Invalid login credentials": "E-posta ya da şifre yanlış.",
  "Email not confirmed": "E-postanı henüz doğrulamadın. Gelen kutundaki (gerekirse gereksiz/spam klasöründeki) bağlantıya dokun, sonra burada giriş yap.",
  "User already registered": "Bu e-postayla zaten hesap var. Giriş yap ya da şifreni yenile.",
};
const errText = e => {
  const m = e?.message || String(e || "");
  if (MSG[m]) return MSG[m];
  if (/rate limit|too many/i.test(m)) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  if (/at least 6|password should/i.test(m)) return "Şifre en az 6 karakter olmalı.";
  if (/fetch|network/i.test(m)) return "İnternet bağlantısı yok gibi görünüyor.";
  return "Bir sorun oldu: " + m;
};
let mode = "login";
function authView(m, info) {
  mode = m; const box = $("authbox"); $("auth").hidden = false;
  const email = $("a_email")?.value || savedEmail();
  const T = {
    login: ["Giriş yap", "Ürün Defteri'ne e-postan ve şifrenle gir."],
    signup: ["Hesap oluştur", "Defterin sahibi seni Kullanıcılar listesine eklediyse, aynı e-postayla burada şifreni belirle."],
    reset: ["Şifremi unuttum", "E-postanı yaz, şifre yenileme bağlantısı gönderelim."],
    newpass: ["Yeni şifre", "Yeni şifreni belirle."],
  };
  if (m === "mfa") {
    box.innerHTML = `<h1>Doğrulama kodu</h1><p class="a-sub">Telefonundaki doğrulama uygulamasında (Google Authenticator vb.) Ürün Defteri için görünen 6 haneli kodu yaz.</p>
      <form id="a_form" novalidate><label class="fld"><span class="lbl">Kod</span><input id="a_code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <div class="a-err" id="a_err" ${info ? "" : "hidden"}>${info || ""}</div><button class="btn pri" type="submit" id="a_go">Doğrula</button></form>
      <div class="a-links"><button type="button" id="a_out">Çıkış yap</button></div>`;
    $("a_out").addEventListener("click", async () => { setRT(""); await sb.auth.signOut(); location.reload(); });
    $("a_form").addEventListener("submit", async ev => {
      ev.preventDefault(); const code = $("a_code").value.replace(/\D/g, ""); if (code.length !== 6) return authErr("6 haneli kodu yaz.");
      const go = $("a_go"); go.disabled = true;
      try { const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw error; const f = (data.totp || []).find(x => x.status === "verified"); if (!f) throw new Error("Doğrulama uygulaması bulunamadı.");
        const r = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code }); if (r.error) throw r.error;
        const s = (await sb.auth.getSession()).data.session; if (s) setRT(s.refresh_token); await bootOnce(); }
      catch (e) { authErr(/invalid|expired|code/i.test(e?.message || "") ? "Kod yanlış ya da süresi geçti; uygulamadaki güncel kodu yaz." : errText(e)); }
      finally { if ($("a_go")) go.disabled = false; }
    });
    setTimeout(() => $("a_code")?.focus(), 30); return;
  }
  if (m === "offline") {
    box.innerHTML = `<h1>Bağlantı yok</h1><p class="a-sub">Oturumun açık; sadece sunucuya şu an ulaşılamıyor. İnternet gelince otomatik bağlanacak.</p><button class="btn pri" type="button" id="a_retry">Tekrar dene</button>`;
    $("a_retry").addEventListener("click", () => location.reload());
    const on = () => { window.removeEventListener("online", on); location.reload(); }; window.addEventListener("online", on);
    return;
  }
  if (m === "denied" || m === "setup" || m === "sent") {
    box.innerHTML = `<h1>Ürün Defteri</h1><p class="a-sub">${info}</p>${m === "denied" ? `<button class="btn" type="button" id="a_out">Çıkış yap</button>` : m === "sent" ? `<button class="btn" type="button" id="a_back">Giriş ekranına dön</button>` : ""}`;
    $("a_out")?.addEventListener("click", async () => { setRT(""); await sb.auth.signOut(); location.reload(); });
    $("a_back")?.addEventListener("click", () => authView("login"));
    return;
  }
  const [title, sub] = T[m];
  box.innerHTML = `<h1>${title}</h1><p class="a-sub">${sub}</p>
    <form id="a_form" novalidate>
      ${m !== "newpass" ? `<label class="fld"><span class="lbl">E-posta</span><input id="a_email" type="email" inputmode="email" autocomplete="email" required value="${email.replace(/"/g, "&quot;")}"></label>` : ""}
      ${m !== "reset" ? `<label class="fld"><span class="lbl">${m === "login" ? "Şifre" : "Yeni şifre (en az 6 karakter)"}</span><input id="a_pass" type="password" autocomplete="${m === "login" ? "current-password" : "new-password"}" required></label>` : ""}
      ${m === "signup" || m === "newpass" ? `<label class="fld"><span class="lbl">Şifre tekrar</span><input id="a_pass2" type="password" autocomplete="new-password" required></label>` : ""}
      <div class="a-err" id="a_err" ${info ? "" : "hidden"}>${info || ""}</div>
      <button class="btn pri" type="submit" id="a_go">${title}</button>
    </form>
    <div class="a-links">${m === "login" ? `<button type="button" data-m="signup">Hesap oluştur</button><button type="button" data-m="reset">Şifremi unuttum</button>` : m !== "newpass" ? `<button type="button" data-m="login">Giriş ekranına dön</button>` : ""}</div>`;
  box.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => authView(b.dataset.m)));
  $("a_form").addEventListener("submit", onAuthSubmit);
  setTimeout(() => (m === "newpass" || ($("a_email")?.value && m === "login") ? $("a_pass") : $("a_email"))?.focus(), 30);
}
const authErr = t => { const e = $("a_err"); e.textContent = t; e.hidden = false; };
async function onAuthSubmit(ev) {
  ev.preventDefault();
  const go = $("a_go"); const email = ($("a_email")?.value || "").trim().toLowerCase(); const p1 = $("a_pass")?.value || ""; const p2 = $("a_pass2")?.value;
  if (mode !== "newpass" && !/^\S+@\S+\.\S+$/.test(email)) return authErr("Geçerli bir e-posta yaz.");
  if ((mode === "signup" || mode === "newpass") && p1 !== p2) return authErr("İki şifre aynı değil.");
  if (mode !== "reset" && p1.length < 6) return authErr("Şifre en az 6 karakter olmalı.");
  go.disabled = true; const old = go.textContent; go.textContent = "Bekle…";
  try {
    const back = location.origin + location.pathname;
    if (mode === "login") { const { error } = await sb.auth.signInWithPassword({ email, password: p1 }); if (error) throw error; rememberEmail(email); }
    else if (mode === "signup") { const { error } = await sb.auth.signUp({ email, password: p1, options: { emailRedirectTo: back } }); if (error) throw error;
      return authView("sent", `<b>${email}</b> adresine bir doğrulama bağlantısı gönderdik. E-postadaki bağlantıya dokun, sonra buradan giriş yap. E-posta birkaç dakika içinde gelmezse gereksiz (spam) klasörüne bak.`); }
    else if (mode === "reset") { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back }); if (error) throw error;
      return authView("sent", `<b>${email}</b> adresine şifre yenileme bağlantısı gönderdik. Bağlantıya dokununca yeni şifreni belirleyeceğin ekran açılır.`); }
    else if (mode === "newpass") { const { error } = await sb.auth.updateUser({ password: p1 }); if (error) throw error; recovering = false; await bootOnce(); }
  } catch (e) { authErr(errText(e)); }
  finally { if ($("a_go")) { go.disabled = false; go.textContent = old; } }
}

/* ---------- Supabase ---------- */
if (!CFG.url || !CFG.key || !window.supabase) {
  document.addEventListener("DOMContentLoaded", () => authView("setup", "Kurulum henüz tamamlanmadı: veritabanı bağlantı bilgileri eklenmedi."));
  return;
}
const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "urun-defteri-oturum" } });
/* Oturum, çıkış yapılana kadar kalır. Ana oturum localStorage'da; yenileme anahtarı ayrıca uzun ömürlü bir
   çerezde yedeklenir. Telefon uygulamayı kapatıp açınca bağlantı geç gelirse giriş ekranı gösterilmez, tekrar denenir. */
const RT = "ud_rt";
const setRT = t => { try { document.cookie = t ? `${RT}=${encodeURIComponent(t)}; Max-Age=34560000; Path=/; Secure; SameSite=Strict` : `${RT}=; Max-Age=0; Path=/; Secure; SameSite=Strict`; } catch (_) {} };
const getRT = () => { const m = document.cookie.match(/(?:^|; )ud_rt=([^;]*)/); return m ? decodeURIComponent(m[1]) : ""; };
const isNet = e => !!e && (e.name === "AuthRetryableFetchError" || e.status === 0 || /fetch|network|load failed|timeout|offline/i.test(e.message || ""));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function restoreSession() {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.auth.getSession();
    if (data?.session) return { session: data.session };
    const rt = getRT();
    if (rt) {
      const r = await sb.auth.refreshSession({ refresh_token: rt });
      if (r.data?.session) return { session: r.data.session };
      if (r.error && !isNet(r.error)) { setRT(""); return { session: null }; }
    } else if (!isNet(error)) return { session: null };
    if (!navigator.onLine) return { session: null, offline: true };
    await sleep(700 * (i + 1));
  }
  return { session: null, offline: true };
}
const rememberEmail = e => { try { localStorage.setItem("ud.email", e); } catch (_) {} };
const savedEmail = () => { try { return localStorage.getItem("ud.email") || ""; } catch (_) { return ""; } };
/* sunucu fonksiyonu: oturumdaki kullanıcının kimliğiyle çağrılır */
window.__fn = async (action, body) => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Oturum kapanmış, tekrar giriş yap.");
  let r;
  try { r = await fetch(`${CFG.url}/functions/v1/defter?action=${encodeURIComponent(action)}`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: CFG.key, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); }
  catch (e) { throw new Error("Sunucuya ulaşılamadı. İnterneti kontrol et."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Sunucu hatası (${r.status})`);
  return j;
};
let recovering = /type=recovery/.test(location.hash);
let booted = false;

const genId = () => { const a = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; const r = crypto.getRandomValues(new Uint8Array(20)); return [...r].map(x => a[x % 62]).join(""); };
const dbErr = e => { const c = e?.code || ""; if (c === "42501" || /row-level security|permission/i.test(e?.message || "")) return { code: "invalid_argument", message: e.message }; if (/fetch|network/i.test(e?.message || "")) return { code: "unavailable", message: e.message }; return { code: "unavailable", message: e?.message || "" }; };
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const deepMerge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a?.[k]) ? deepMerge(a[k], v) : v; return o; };

const cache = new Map(), listeners = new Map(), pending = new Set();
const colMap = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
const snap = c => { const m = colMap(c); const docs = [...m].map(([id, d]) => ({ id, exists: true, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
const emit = c => { const s = snap(c); for (const f of listeners.get(c) || []) try { f(s); } catch (e) { console.error(e); } };
const schedule = c => { saveSnap(); pending.add(c); if (pending.size === 1) setTimeout(() => { const cs = [...pending]; pending.clear(); cs.forEach(emit); }, 0); };

/* ---- aynı anda yazma güvenliği ----
   Her kayıtta sürüm (_v) tutulur. Yazarken "okuduğum sürüm hâlâ aynı mı?" diye koşullu yazılır; değilse güncel kayıt
   çekilir ve değişiklik onun üstüne yeniden uygulanır. Böylece iki kişi aynı kayda dokununca kimsenin girdiği kaybolmaz.
   update() içinde dizilere ekleme/çıkarma işlem olarak gelir ({$push:[..]}, {$pull:{k:"id",v:[..]}}) ve güncel dizi üstünde yapılır.
   set() ile tüm kayıt yazılırken (düzenleme formu) araya başka değişiklik girdiyse üç yollu birleştirilir:
   formda değiştirilen alanlar yazılır, başkasının değiştirdiği diğer alanlar korunur; id'li dizilerde eklenen/silinen öğeler birleşir. */
const vOf = d => (d && Number.isInteger(d._v) ? d._v : 0); // sürümsüz eski kayıt = 0
const prevV = new Map(); // "col/id@v" → o sürümün içeriği (birleştirmede taban)
const remember = (col, id, d) => { if (!d) return; prevV.set(`${col}/${id}@${vOf(d)}`, d); if (prevV.size > 600) prevV.delete(prevV.keys().next().value); };
const setCache = (col, id, d) => { const m = colMap(col), old = m.get(id); if (old && vOf(old) !== vOf(d)) remember(col, id, old); if (d === undefined) m.delete(id); else m.set(id, d); schedule(col); };
const isOp = v => isObj(v) && ("$push" in v || "$pull" in v);
function applyPatch(cur, patch) {
  const o = { ...(cur || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (isOp(v)) { let a = Array.isArray(cur?.[k]) ? [...cur[k]] : [];
      if (v.$pull) { const { k: key, v: vals } = v.$pull; a = a.filter((x, j) => !vals.includes(key === "$i" ? j : x?.[key])); }
      if (v.$push) a = [...a, ...v.$push];
      if (v.$keep) a = a.slice(-v.$keep);
      o[k] = a; }
    else o[k] = isObj(v) && isObj(cur?.[k]) ? applyPatch(cur[k], v) : v;
  }
  return o;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = x => (isObj(x) ? x.id ?? x.k ?? x.t ?? null : null); // id (kayıt), k (alım kalemi), t (geçmiş satırı)
function mergeArr(base, mine, theirs) {
  const all = [base, mine, theirs].every(a => Array.isArray(a) && a.every(x => keyOf(x) != null));
  if (!all) return mine;
  const B = new Map(base.map(x => [keyOf(x), x])), M = new Map(mine.map(x => [keyOf(x), x]));
  const out = [];
  for (const x of theirs) { const k = keyOf(x); if (B.has(k) && !M.has(k)) continue; /* bende silindi */ out.push(M.has(k) && !same(M.get(k), B.get(k)) ? M.get(k) : x); }
  for (const x of mine) if (!B.has(keyOf(x)) && !out.some(y => keyOf(y) === keyOf(x))) out.push(x); // bende eklendi
  return out;
}
function merge3(base, mine, theirs) {
  const o = { ...theirs };
  for (const k of new Set([...Object.keys(mine), ...Object.keys(base || {})])) {
    if (k === "_v" || same(mine[k], base?.[k])) continue; // bu alanı ben değiştirmedim → güncel hali kalsın
    if (!(k in mine)) { delete o[k]; continue; }
    o[k] = Array.isArray(mine[k]) && base ? mergeArr(base[k] || [], mine[k], theirs[k] || []) : isObj(mine[k]) && isObj(theirs[k]) && isObj(base?.[k]) ? merge3(base[k], mine[k], theirs[k]) : mine[k];
  }
  return o;
}
async function fetchFresh(col, id) {
  const { data, error } = await sb.from("docs").select("data").eq("col", col).eq("id", id).maybeSingle();
  if (error) throw dbErr(error);
  setCache(col, id, data ? data.data : undefined);
  return data ? data.data : undefined;
}
/* expect: undefined = yeni kayıt, 0 = sürümsüz eski kayıt, sayı = beklenen sürüm */
async function rawWrite(col, id, data, expect) {
  const clean = JSON.parse(JSON.stringify(data)); clean._v = (expect || 0) + 1;
  const at = new Date().toISOString();
  if (expect === undefined) {
    const { error } = await sb.from("docs").insert({ col, id, data: clean, updated_at: at });
    if (error) { if (error.code === "23505") return false; throw dbErr(error); }
  } else {
    let q = sb.from("docs").update({ data: clean, updated_at: at }).eq("col", col).eq("id", id);
    q = expect === 0 ? q.is("data->_v", null) : q.eq("data->>_v", String(expect));
    const { data: rs, error } = await q.select("id");
    if (error) throw dbErr(error);
    if (!rs || !rs.length) return false;
  }
  setCache(col, id, clean);
  return true;
}
async function commit(col, id, make) {
  for (let i = 0; i < 4; i++) {
    const cur = colMap(col).get(id);
    if (await rawWrite(col, id, make(cur), cur === undefined ? undefined : vOf(cur))) return;
    await fetchFresh(col, id); // araya başka yazma girdi: güncelini al, değişikliği onun üstüne yeniden uygula
  }
  throw { code: "unavailable", message: "Kayıt aynı anda değiştiriliyor; birazdan tekrar dene." };
}
async function loadAll() {
  const rows = []; const step = 1000;
  for (let from = 0; ; from += step) { const { data, error } = await sb.from("docs").select("col,id,data").range(from, from + step - 1); if (error) throw error; rows.push(...data); if (data.length < step) break; }
  const cols = new Set([...cache.keys()]);
  const fresh = new Map(); for (const r of rows) { if (!fresh.has(r.col)) fresh.set(r.col, new Map()); fresh.get(r.col).set(r.id, r.data); cols.add(r.col); }
  for (const [c, m] of cache) for (const [id, d] of m) { const n = fresh.get(c)?.get(id); if (n && vOf(n) !== vOf(d)) remember(c, id, d); }
  cache.clear(); for (const [c, m] of fresh) cache.set(c, m);
  for (const op of queue) localApply(op); // henüz gönderilmemiş kayıtlar ekranda kalsın
  cols.forEach(schedule);
}
const setMaker = (data, base) => cur => {
  if (!cur) { const d = { ...data }; delete d._v; return d; }
  if (base && vOf(data) !== vOf(cur)) return merge3(base, data, cur);
  return { ...data };
};
async function rawDelete(col, id) { const { error } = await sb.from("docs").delete().eq("col", col).eq("id", id); if (error) throw dbErr(error); setCache(col, id, undefined); }
// internet yokken (ya da sırada bekleyen kayıt varken) yazma kuyruğa girer, ekranda hemen görünür
const tryOrQueue = async (op, run) => { if (queue.length || !navigator.onLine) return enqueue(op); try { return await run(); } catch (e) { if (offlineErr(e)) return enqueue(op); throw e; } };
const docRef = (col, id) => ({
  id, path: col + "/" + id,
  async get() { const d = colMap(col).get(id); return { id, exists: !!d, data: () => d }; },
  // tüm kayıt: formun dayandığı sürümden sonra değişiklik olduysa üç yollu birleştir
  set: data => {
    const now = colMap(col).get(id);
    const base = now && vOf(now) === vOf(data) ? now : prevV.get(`${col}/${id}@${vOf(data)}`);
    return tryOrQueue({ kind: "set", col, id, data, base }, () => commit(col, id, setMaker(data, base)));
  },
  async update(patch) { if (!colMap(col).get(id)) throw { code: "invalid_argument", message: "yok" }; return tryOrQueue({ kind: "update", col, id, patch }, () => commit(col, id, cur => applyPatch(cur, patch))); },
  delete: () => tryOrQueue({ kind: "delete", col, id }, () => rawDelete(col, id)),
});

/* ---- internetsiz çalışma: kuyruk + son verinin telefonda saklanması ---- */
const Q_KEY = "ud.q";
let queue = (() => { try { return JSON.parse(localStorage.getItem(Q_KEY) || "[]"); } catch (_) { return []; } })();
const qSave = () => { try { localStorage.setItem(Q_KEY, JSON.stringify(queue)); } catch (_) {} window.dispatchEvent(new CustomEvent("ud-queue", { detail: { n: queue.length } })); };
const offlineErr = e => !navigator.onLine || isNet(e) || (e?.code === "unavailable" && /fetch|network|load failed|offline|timeout/i.test(e?.message || ""));
function localApply(op) {
  const cur = colMap(op.col).get(op.id);
  if (op.kind === "set") { const d = cur ? setMaker(op.data, op.base)(cur) : { ...op.data }; d._v = vOf(cur); setCache(op.col, op.id, d); }
  else if (op.kind === "update") { if (cur) setCache(op.col, op.id, { ...applyPatch(cur, op.patch), _v: vOf(cur) }); }
  else setCache(op.col, op.id, undefined);
}
function enqueue(op) {
  const o = JSON.parse(JSON.stringify({ ...op, qid: genId(), at: new Date().toISOString() }));
  localApply(o); queue.push(o); qSave(); saveSnap(); setTimeout(flush, 3000);
}
let flushing = false;
async function replay(op) {
  const fresh = await fetchFresh(op.col, op.id);
  if (op.kind === "delete") { if (fresh) await rawDelete(op.col, op.id); return; }
  if (op.kind === "update") { if (!fresh) return; return commit(op.col, op.id, cur => applyPatch(cur, op.patch)); }
  return commit(op.col, op.id, setMaker(op.data, op.base));
}
async function flush() {
  if (flushing || !queue.length || !navigator.onLine || window.__offline) return;
  flushing = true; let sent = 0;
  try {
    while (queue.length) {
      const op = queue[0];
      try { await replay(op); sent++; }
      catch (e) { if (offlineErr(e)) break; window.dispatchEvent(new CustomEvent("ud-qfail", { detail: { col: op.col, msg: e?.message || "" } })); }
      queue.shift(); qSave();
    }
  } finally { flushing = false; for (const op of queue) localApply(op); if (sent) window.dispatchEvent(new CustomEvent("ud-qsent", { detail: { n: sent } })); }
}
setInterval(() => flush(), 20000);
window.addEventListener("online", () => setTimeout(flush, 1500));
window.__queue = { n: () => queue.length, flush };

const idb = (() => {
  let p; const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open("urun-defteri", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = (mode, f) => open().then(d => new Promise((res, rej) => { const t = d.transaction("kv", mode); const q = f(t.objectStore("kv")); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }));
  return { get: k => tx("readonly", s => s.get(k)).catch(() => null), set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => {}), del: k => tx("readwrite", s => s.delete(k)).catch(() => {}) };
})();
let snapT = null;
const saveSnap = () => { if (!booted) return; clearTimeout(snapT); snapT = setTimeout(() => {
  const rows = []; for (const [c, m] of cache) for (const [id, d] of m) rows.push({ col: c, id, data: d });
  idb.set("snap", { at: new Date().toISOString(), rows });
}, 2500); };
const db = {
  doc(path) { const [c, i] = path.split("/"); return docRef(c, i); },
  collection(col) {
    return {
      path: col,
      doc: id => docRef(col, id || genId()),
      async add(d) { const r = docRef(col, genId()); await r.set(d); return r; },
      onSnapshot(next) { if (!listeners.has(col)) listeners.set(col, new Set()); listeners.get(col).add(next); setTimeout(() => next(snap(col)), 0); return () => listeners.get(col)?.delete(next); },
    };
  },
};
window.__dbtest = { applyPatch, merge3, mergeArr };
/* değişiklik geçmişi (veritabanı tetikleyicisi docs_hist'e yazar; burası sadece okur) */
/* iki adımlı giriş (TOTP: Google Authenticator vb.) */
window.__mfa = sb.auth.mfa ? {
  async status() { const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw error; return (data.totp || []).filter(f => f.status === "verified"); },
  async enroll() {
    const { data: l } = await sb.auth.mfa.listFactors(); for (const f of (l?.all || []).filter(f => f.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Ürün Defteri " + new Date().toISOString().slice(0, 16) }); if (error) throw error;
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  },
  async verify(id, code) { const r = await sb.auth.mfa.challengeAndVerify({ factorId: id, code }); if (r.error) throw r.error; const s = (await sb.auth.getSession()).data.session; if (s) setRT(s.refresh_token); },
  async remove(id) { const r = await sb.auth.mfa.unenroll({ factorId: id }); if (r.error) throw r.error; },
} : null;
window.__hist = {
  async of(col, id) { const { data, error } = await sb.from("docs_hist").select("hid,col,id,op,old_data,new_data,by_email,at").eq("col", col).eq("id", id).order("at", { ascending: false }).limit(100); if (error) throw dbErr(error); return data || []; },
  async recent(op, limit = 150) { let q = sb.from("docs_hist").select("hid,col,id,op,old_data,new_data,by_email,at"); if (op) q = q.eq("op", op); const { data, error } = await q.order("at", { ascending: false }).limit(limit); if (error) throw dbErr(error); return data || []; },
};

/* belgeler: Supabase Storage (özel kova, imzalı adresler) */
const urlCache = new Map();
const assets = {
  async upload(blob, o) {
    const type = o?.type || blob.type || "application/octet-stream";
    const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${new Date().toISOString().slice(0, 7)}/${genId()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
    if (error) throw { code: /size|large|exceed/i.test(error.message) ? "too_large" : /mime|type/i.test(error.message) ? "unsupported_type" : "upstream_error", message: error.message };
    return { id: path, url: "", contentType: type, sizeBytes: blob.size };
  },
  async delete(id) { await sb.storage.from(BUCKET).remove([id]); urlCache.delete(id); return { deleted: true }; },
};
window.__blobUrl = async id => {
  const c = urlCache.get(id); if (c?.exp > Date.now()) return c.url;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(id, 3600);
  if (data?.signedUrl) { urlCache.set(id, { url: data.signedUrl, exp: Date.now() + 3300e3 }); return data.signedUrl; }
  return "";
};
window.__blobHook = async root => {
  const els = [...root.querySelectorAll("[data-blob],[data-blob-href]")]; if (!els.length) return;
  const idOf = e => e.dataset.blob ?? e.dataset.blobHref;
  const need = [...new Set(els.map(idOf))].filter(id => !(urlCache.get(id)?.exp > Date.now()));
  if (need.length) { try { const { data } = await sb.storage.from(BUCKET).createSignedUrls(need, 3600); for (const r of data || []) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: Date.now() + 3300e3 }); } catch (e) {} }
  for (const e of els) { const u = urlCache.get(idOf(e))?.url; if (!u) continue; if (e.dataset.blob !== undefined) { if (e.getAttribute("src") !== u) e.src = u; } else e.href = u; }
};
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]); const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5000); return { status: "saved" };
  },
};

let bootP = null;
const bootOnce = () => bootP || (bootP = boot().finally(() => { if (!booted) bootP = null; }));
async function boot() {
  if (booted) return;
  $("authbox").innerHTML = `<p class="a-sub">Bağlanıyor…</p>`;
  const { session, offline } = await restoreSession();
  if (!session) { if (offline && await bootOffline()) return; return offline ? authView("offline") : authView("login"); }
  setRT(session.refresh_token);
  try { navigator.storage?.persist?.(); } catch (_) {}
  if (recovering) return authView("newpass");
  // iki adımlı giriş açıksa ve bu oturumda kod girilmediyse önce kod (veritabanı da kodsuz oturuma veri vermez)
  try { const r = await sb.auth.mfa?.getAuthenticatorAssuranceLevel?.(); const aal = r?.data; if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return authView("mfa"); } catch (_) {}
  const email = (session.user.email || "").toLowerCase(); rememberEmail(email);
  let mem = null, error = null;
  for (let i = 0; i < 5 && !mem; i++) { let r = await sb.from("members").select("email,role,name,gizle"); if (r.error && /gizle/.test(r.error.message || "")) r = await sb.from("members").select("email,role,name"); if (!r.error) mem = r.data; else { error = r.error; if (isNet(r.error) && await bootOffline()) return; await sleep(700 * (i + 1)); } }
  if (!mem) return (await bootOffline()) || authView("offline", errText(error));
  const me = mem.find(m => m.email.toLowerCase() === email);
  if (!me) return authView("denied", `<b>${email}</b> hesabı bu deftere ekli değil. Defterin sahibinden, Ayarlar → Kullanıcılar bölümünden bu e-postayı eklemesini iste; sonra sayfayı yenile.`);
  const names = Object.fromEntries(mem.map(m => [m.email.toLowerCase(), m.name || m.email.split("@")[0]]));
  idb.set("me", { email, role: me.role, name: me.name, gizle: me.gizle || {}, names });
  await startApp(email, me, names, false);
}
/* internet yok ama bu telefonda daha önce giriş yapılmış: son saklanan verilerle aç; kayıtlar kuyrukta bekler */
async function bootOffline() {
  if (booted) return true;
  const [snap, m] = await Promise.all([idb.get("snap"), idb.get("me")]);
  if (!snap?.rows || !m?.email) return false;
  cache.clear(); for (const r of snap.rows) colMap(r.col).set(r.id, r.data);
  window.__offline = { since: snap.at };
  await startApp(m.email, { role: m.role, name: m.name, gizle: m.gizle || {} }, m.names || {}, true);
  return true;
}
let live = false;
function goLive() {
  if (live) return; live = true;
  sb.channel("docs-rt").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
    const r = p.eventType === "DELETE" ? p.old : p.new; if (!r?.col || !r?.id) return;
    setCache(r.col, r.id, p.eventType === "DELETE" ? undefined : r.data);
    for (const op of queue) if (op.col === r.col && op.id === r.id) localApply(op);
  }).subscribe();
}
let reconnecting = false;
async function reconnect() {
  if (!window.__offline || reconnecting || !navigator.onLine) return; reconnecting = true;
  try {
    const { session, offline } = await restoreSession();
    if (!session) { if (!offline) { $("auth").hidden = false; authView("login", "Bağlantı geldi; kayıtların gönderilmesi için tekrar giriş yap."); } return; }
    setRT(session.refresh_token);
    window.__offline = null; await flush(); await loadAll(); goLive();
    window.dispatchEvent(new CustomEvent("ud-online"));
  } catch (e) { console.error(e); } finally { reconnecting = false; }
}
window.addEventListener("online", () => setTimeout(reconnect, 1000));
setInterval(reconnect, 30000);
async function startApp(email, me, names, offlineMode) {
  booted = true;
  const user = {
    id: async () => email,
    can: async () => me.role !== "viewer",
    canEdit: async () => me.role !== "viewer",
    isOwner: async () => me.role === "owner",
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: names[String(i).toLowerCase()] || (String(i).includes("@") ? String(i).split("@")[0] : ""), isMe: i === email }])),
  };
  window.__members = {
    me: { email, role: me.role, name: me.name, gizle: me.gizle || {} },
    async list() { let { data, error } = await sb.from("members").select("email,role,name,gizle,created_at").order("created_at"); if (error && /gizle/.test(error.message || "")) ({ data, error } = await sb.from("members").select("email,role,name,created_at").order("created_at")); if (error) throw error; data.forEach(m => (names[m.email.toLowerCase()] = m.name || m.email.split("@")[0])); return data; },
    async add(em, role, name) { const { error } = await sb.from("members").insert({ email: em, role, name }); if (error) throw new Error(error.code === "23505" ? "Bu e-posta zaten listede." : error.message); },
    async setGizle(em, gizle) { const { error } = await sb.from("members").update({ gizle }).eq("email", em); if (error) throw new Error(/gizle/.test(error.message || "") ? "Bu ayar için veritabanı güncellemesi henüz yapılmadı." : error.message); },
    async remove(em) { const { error } = await sb.from("members").delete().eq("email", em); if (error) throw error; },
    async logout() { setRT(""); queue = []; qSave(); await Promise.all([idb.del("snap"), idb.del("me")]); await sb.auth.signOut().catch(() => {}); location.reload(); },
  };
  $("auth").hidden = true;
  if (!offlineMode) {
    try { await loadAll(); } catch (e) { console.error(e); }
    if (me.role === "owner" && ![...cache.values()].some(m => m.size)) {
      try { const rows = await fetch("baslangic.json", { cache: "no-store" }).then(r => r.json());
        const { error } = await sb.from("docs").upsert(rows, { onConflict: "col,id", ignoreDuplicates: true }); if (!error) await loadAll(); } catch (e) { console.error(e); }
    }
    goLive(); flush();
  } else { [...cache.keys()].forEach(schedule); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { if (window.__offline) reconnect(); else { flush(); loadAll().catch(() => {}); } } });
  const ro = me.role === "viewer";
  resolveRT({ db, user: ro ? { ...user, can: async () => false } : user, downloads, assets: ro ? null : assets });
}
sb.auth.onAuthStateChange((ev, sess) => {
  if (sess?.refresh_token && (ev === "SIGNED_IN" || ev === "TOKEN_REFRESHED" || ev === "INITIAL_SESSION")) setRT(sess.refresh_token);
  if (ev === "PASSWORD_RECOVERY") { recovering = true; authView("newpass"); }
  else if (ev === "SIGNED_IN" && !booted && !recovering) bootOnce().catch(e => authView("login", errText(e)));
  else if (ev === "SIGNED_IN" && booted && window.__offline) { $("auth").hidden = true; reconnect(); }
  else if (ev === "SIGNED_OUT" && booted) location.reload();
});
document.addEventListener("DOMContentLoaded", () => { bootOnce().catch(e => authView("login", errText(e))); });
})();
