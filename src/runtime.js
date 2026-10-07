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
  const email = $("a_email")?.value || "";
  const T = {
    login: ["Giriş yap", "Ürün Defteri'ne e-postan ve şifrenle gir."],
    signup: ["Hesap oluştur", "Defterin sahibi seni Kullanıcılar listesine eklediyse, aynı e-postayla burada şifreni belirle."],
    reset: ["Şifremi unuttum", "E-postanı yaz, şifre yenileme bağlantısı gönderelim."],
    newpass: ["Yeni şifre", "Yeni şifreni belirle."],
  };
  if (m === "denied" || m === "setup" || m === "sent") {
    box.innerHTML = `<h1>Ürün Defteri</h1><p class="a-sub">${info}</p>${m === "denied" ? `<button class="btn" type="button" id="a_out">Çıkış yap</button>` : m === "sent" ? `<button class="btn" type="button" id="a_back">Giriş ekranına dön</button>` : ""}`;
    $("a_out")?.addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
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
  setTimeout(() => (m === "newpass" ? $("a_pass") : $("a_email"))?.focus(), 30);
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
    if (mode === "login") { const { error } = await sb.auth.signInWithPassword({ email, password: p1 }); if (error) throw error; }
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
const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
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
const schedule = c => { pending.add(c); if (pending.size === 1) setTimeout(() => { const cs = [...pending]; pending.clear(); cs.forEach(emit); }, 0); };
async function loadAll() {
  const rows = []; const step = 1000;
  for (let from = 0; ; from += step) { const { data, error } = await sb.from("docs").select("col,id,data").range(from, from + step - 1); if (error) throw error; rows.push(...data); if (data.length < step) break; }
  const cols = new Set([...cache.keys()]); cache.clear();
  for (const r of rows) { colMap(r.col).set(r.id, r.data); cols.add(r.col); }
  cols.forEach(schedule);
}
async function writeDoc(col, id, data) {
  const clean = JSON.parse(JSON.stringify(data));
  const { error } = await sb.from("docs").upsert({ col, id, data: clean, updated_at: new Date().toISOString() });
  if (error) throw dbErr(error);
  colMap(col).set(id, clean); schedule(col);
}
const docRef = (col, id) => ({
  id, path: col + "/" + id,
  async get() { const d = colMap(col).get(id); return { id, exists: !!d, data: () => d }; },
  set: data => writeDoc(col, id, data),
  async update(patch) { const cur = colMap(col).get(id); if (!cur) throw { code: "invalid_argument", message: "yok" }; return writeDoc(col, id, deepMerge(cur, patch)); },
  async delete() { const { error } = await sb.from("docs").delete().eq("col", col).eq("id", id); if (error) throw dbErr(error); colMap(col).delete(id); schedule(col); },
});
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
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return authView("login");
  if (recovering) return authView("newpass");
  const email = (session.user.email || "").toLowerCase();
  const { data: mem, error } = await sb.from("members").select("email,role,name");
  if (error) return authView("login", errText(error));
  const me = mem.find(m => m.email.toLowerCase() === email);
  if (!me) return authView("denied", `<b>${email}</b> hesabı bu deftere ekli değil. Defterin sahibinden, Ayarlar → Kullanıcılar bölümünden bu e-postayı eklemesini iste; sonra sayfayı yenile.`);
  booted = true;
  const names = Object.fromEntries(mem.map(m => [m.email.toLowerCase(), m.name || m.email.split("@")[0]]));
  const user = {
    id: async () => email,
    can: async () => me.role !== "viewer",
    canEdit: async () => me.role !== "viewer",
    isOwner: async () => me.role === "owner",
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: names[String(i).toLowerCase()] || (String(i).includes("@") ? String(i).split("@")[0] : ""), isMe: i === email }])),
  };
  window.__members = {
    me: { email, role: me.role, name: me.name },
    async list() { const { data, error } = await sb.from("members").select("email,role,name,created_at").order("created_at"); if (error) throw error; data.forEach(m => (names[m.email.toLowerCase()] = m.name || m.email.split("@")[0])); return data; },
    async add(em, role, name) { const { error } = await sb.from("members").insert({ email: em, role, name }); if (error) throw new Error(error.code === "23505" ? "Bu e-posta zaten listede." : error.message); },
    async remove(em) { const { error } = await sb.from("members").delete().eq("email", em); if (error) throw error; },
    async logout() { await sb.auth.signOut(); location.reload(); },
  };
  $("auth").hidden = true;
  try { await loadAll(); } catch (e) { console.error(e); }
  if (me.role === "owner" && ![...cache.values()].some(m => m.size)) {
    try { const rows = await fetch("baslangic.json", { cache: "no-store" }).then(r => r.json());
      const { error } = await sb.from("docs").upsert(rows, { onConflict: "col,id", ignoreDuplicates: true }); if (!error) await loadAll(); } catch (e) { console.error(e); }
  }
  sb.channel("docs-rt").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
    const r = p.eventType === "DELETE" ? p.old : p.new; if (!r?.col || !r?.id) return;
    if (p.eventType === "DELETE") colMap(r.col).delete(r.id); else colMap(r.col).set(r.id, r.data);
    schedule(r.col);
  }).subscribe();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadAll().catch(() => {}); });
  resolveRT({ db, user: me.role === "viewer" ? { ...user, can: async () => false } : user, downloads, assets: me.role === "viewer" ? null : assets });
}
sb.auth.onAuthStateChange((ev) => {
  if (ev === "PASSWORD_RECOVERY") { recovering = true; authView("newpass"); }
  else if (ev === "SIGNED_IN" && !booted && !recovering) bootOnce().catch(e => authView("login", errText(e)));
  else if (ev === "SIGNED_OUT" && booted) location.reload();
});
document.addEventListener("DOMContentLoaded", () => { bootOnce().catch(e => authView("login", errText(e))); });
})();
