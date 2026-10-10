/* Ürün Defteri — bildirim alıcısı + güncellemeleri hemen almak için ağ öncelikli sayfa yükleme (önbellek tutmaz) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  // sayfa ve uygulama dosyaları: önce sunucuya sor (değişmediyse 304, hızlı); internet yoksa tarayıcının elindeki kopya
  if (r.mode === "navigate" || /\.(js|css|webmanifest)$/.test(u.pathname)) {
    // navigate isteği init ile kopyalanamaz; adresi yeniden iste
    const fresh = r.mode === "navigate" ? fetch(u.href, { cache: "no-cache", credentials: "same-origin" }) : fetch(r, { cache: "no-cache" });
    e.respondWith(fresh.catch(() => fetch(r)));
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
