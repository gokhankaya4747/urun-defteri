/* Ürün Defteri — bildirim alıcısı + ağ öncelikli sayfa yükleme.
   Uygulama dosyaları her açılışta önce sunucudan istenir (güncelleme hemen gelir); başarılı her yanıtın kopyası saklanır,
   internet yoksa bu kopyayla açılır (kayıtlar telefonda bekler, bağlantı gelince gönderilir). */
const SHELL = "ud-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (r.mode === "navigate" || /\.(js|css|webmanifest|png|svg|json)$/.test(u.pathname)) {
    const nav = r.mode === "navigate";
    // navigate isteği init ile kopyalanamaz; adresi yeniden iste
    const fresh = nav ? fetch(u.href, { cache: "no-cache", credentials: "same-origin" }) : fetch(r, { cache: "no-cache" });
    e.respondWith(fresh.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(nav ? new URL("./", self.registration.scope).href : r, copy)).catch(() => {}); }
      return res;
    }).catch(async () => (await caches.match(nav ? new URL("./", self.registration.scope).href : r, { ignoreSearch: false })) || (await caches.match(r, { ignoreSearch: true })) || fetch(r)));
  }
});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: "Ürün Defteri", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Ürün Defteri", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag, renotify: !!d.tag, data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.postMessage({ open: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
