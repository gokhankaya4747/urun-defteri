// @ts-nocheck — gömülü calc.js düz JavaScript
// Ürün Defteri — sunucu fonksiyonu (Supabase Edge Function, Deno)
//   ?action=kur       TCMB USD/EUR kurlarını çeker, settings/kurlar belgesine yazar (pg_cron her iş günü)
//   ?action=haftalik  Haftalık özet (tüm kullanıcılara) + yedek (sahibe) e-postası (pg_cron pazartesi)
//   ?action=oku       Fatura / dekont / makbuz görselini Claude ile okuyup forma doldurulacak bilgiyi döndürür
//   ?action=cumle     "Ahmet'e 6 ton W320 sattım kilosu 8,6$" gibi tek cümleyi satış / ödeme / masraf formuna çevirir
//   ?action=olay      Kapama, konsinye "satıldı", iade/kayıp, Irak sevki girilince diğer kullanıcılara bildirim
// Gizli anahtarlar (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY, GMAIL_APP_PASSWORD (veya RESEND_API_KEY)
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://defter.asyacerez.com";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "asyacerezcilik@gmail.com";
const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const action = new URL(req.url).searchParams.get("action");
  try {
    if (action === "kur") return json(await doKur(req));
    if (action === "haftalik") return json(await doHaftalik(req));
    if (action === "oku") return json(await doOku(req));
    if (action === "cumle") return json(await doCumle(req));
    if (action === "push-key") return json({ key: (await vapid()).pub });
    if (action === "push-test") return json(await doPushTest(req));
    if (action === "push-kayit") return json(await doPushKayit(req));
    if (action === "bildirim") return json(await doBildirim());
    if (action === "yeni") return json(await doYeni(req));
    if (action === "olay") return json(await doOlay(req));
    return json({ error: "bilinmeyen işlem" }, 400);
  } catch (e) {
    console.error(action, e);
    const status = (e as { status?: number })?.status || 500;
    return json({ error: (e as Error)?.message || String(e) }, status);
  }
});

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/* ---------- kimlik ---------- */
async function caller(req: Request) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok || tok.startsWith("sb_")) return null;
  const { data } = await admin.auth.getUser(tok);
  const email = data?.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: m } = await admin.from("members").select("email,role,name").ilike("email", email).maybeSingle();
  return m ? { ...m, email } : null;
}
async function getDoc(col: string, id: string) {
  const { data } = await admin.from("docs").select("data").eq("col", col).eq("id", id).maybeSingle();
  return (data?.data ?? null) as Record<string, any> | null;
}
const putDoc = (col: string, id: string, data: unknown) =>
  admin.from("docs").upsert({ col, id, data, updated_at: new Date().toISOString() });
async function allDocs() {
  const rows: { col: string; id: string; data: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("docs").select("col,id,data").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/* ---------- 1) TCMB kuru ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
async function tcmb(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "UrunDefteri/1.0" } });
  if (!r.ok) return null;
  const x = await r.text();
  const t = x.match(/Tarih="(\d\d)\.(\d\d)\.(\d{4})"/);
  if (!t) return null;
  const cur = (k: string) => {
    const b = x.match(new RegExp(`CurrencyCode="${k}"[\\s\\S]*?<ForexBuying>([\\d.]+)</ForexBuying>[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>`));
    return b ? { a: +b[1], s: +b[2] } : null;
  };
  return { date: `${t[3]}-${t[2]}-${t[1]}`, usd: cur("USD"), eur: cur("EUR") };
}
async function doKur(req: Request) {
  const body = await req.json().catch(() => ({}));
  const doc = (await getDoc("settings", "kurlar")) || { usd: {}, eur: {} };
  doc.usd ||= {}; doc.eur ||= {};
  const add = (k: Awaited<ReturnType<typeof tcmb>>) => { if (!k) return 0; if (k.usd) doc.usd[k.date] = k.usd; if (k.eur) doc.eur[k.date] = k.eur; return 1; };
  let n = add(await tcmb("https://www.tcmb.gov.tr/kurlar/today.xml"));
  // Geçmiş: ilk kurulumda (ya da sahip isterse) son N günü doldur
  const days = Math.min(+body.backfill || (Object.keys(doc.usd).length < 30 ? 400 : 10), 400);
  if (days > 10 && !(Object.keys(doc.usd).length < 30)) { const c = await caller(req); if (c?.role !== "owner") throw new HttpError(403, "yetki yok"); }
  const want: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() - i * 864e5); const wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || doc.usd[iso(d)]) continue;
    want.push(`https://www.tcmb.gov.tr/kurlar/${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}.xml`);
  }
  for (let i = 0; i < want.length; i += 8) n += (await Promise.all(want.slice(i, i + 8).map(tcmb))).reduce((a, k) => a + add(k), 0);
  doc.updatedAt = new Date().toISOString();
  doc.source = "TCMB döviz alış/satış";
  const { error } = await putDoc("settings", "kurlar", doc);
  if (error) throw error;
  return { ok: true, eklenen: n, gunSayisi: Object.keys(doc.usd).length };
}

/* ---------- hesaplar: uygulamayla AYNI motor (src/calc.js, build.py buraya gömer) ---------- */
// <calc.js> (build.py gömer; elle düzenleme)
/* Ürün Defteri — ortak hesap motoru.
   Uygulama (tarayıcı) ve sunucu (haftalık özet, yedek, bildirim) AYNI dosyayı kullanır; rakamlar her yerde aynı çıkar.
   Saf hesap: ekran, veritabanı, tarih/dil yok. Girdi: kayıt dizileri. Çıktı: kalem/alım/satış/firma özetleri + kâr olayları.

   Kâr olayları (events) tek kaynaktır: satış sayfası, alım sayfası, Rapor ve Excel aynı olayları toplar.
     sale      : satılan mal (normal satış: satış günü; konsinye: "satıldı" girildiği gün) → gelir + malın maliyeti (kg × kg maliyeti)
     ret       : müşteri iadesi (normal satış) → gelir ve maliyet geri alınır
     lost      : konsinyede kaybolan mal → kayıp (kg × kg maliyeti)
     sexp      : satışa bağlı masraf (alıcının yerimize ödedikleri dahil) → masraf
     kap       : kapama → kur farkı (dinar kurları girildiyse kurdan) + kesinti (beklenenden az gelen kısım)
     fire      : fire / numune / sayım farkı → kayıp (kg × kg maliyeti; fazla çıkarsa kazanç)
     supret    : tedarikçiye mal iadesi → alacak dekontu − malın maliyeti
     ovh       : genel gider (hiçbir işe bağlı olmayan masraf)
   kg maliyeti (landed) = alış fiyatı + (alıma bağlı masraflar − tedarikçi indirimleri) / alınan kg  (kur farkı ayrı "kap" olayıdır)
   Ortak alımda olaylar "share" (kâr payımız) ile çarpılarak bizim kârımız bulunur. */
const CALC = (() => {
  const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
  // TL ve Irak dinarı (IQD) tutarları girilen kurla (1 $ = kur) dolara çevrilir
  const usd = (a, c, k) => (c === "TL" || c === "IQD" ? (+k > 0 ? (+a || 0) / +k : 0) : +a || 0);
  const key = (s) => String(s || "").trim().toLocaleLowerCase("tr");
  const isIrakDest = (l) => l?.dest === "irak";
  const isElden = (id) => id === "x";
  const isCashPay = (p) => { const b = key(p.bank); return isElden(p.firmId) || b === "kasa (nakit)" || b === "nakit" || b === "kasa" || b === "elden kasa" || b.endsWith(":kasa (nakit)") || (!p.bank && key(p.method) === "nakit"); };
  const expUSD = (x) => usd(x.amount, x.cur, x.kur);

  /* --- stok yardımcıları (ci = alım kalemi) --- */
  const itemStock = (ci) => (+ci.it.kg || 0) - ci.consumed - (ci.adjKg || 0) - (ci.supRetKg || 0);
  const irakLeft = (ci) => (isIrakDest(ci.lot) ? 0 : (ci.irakIn || 0) - (ci.soldIrak || 0) - (ci.adjIrak || 0));
  const hereLeft = (ci) => itemStock(ci) - irakLeft(ci);
  const landedOf = (ci) => ci?.landed ?? ci?.cu ?? 0;
  // Irak deposundaki malın kg maliyeti: Mersin maliyeti + o sevklere ait navlun / gönderilen kg
  const landedIrakOf = (ci) => landedOf(ci) + (ci?.irakIn > 0 ? (ci.sevkExp || 0) / ci.irakIn : 0);
  const costAt = (ci, loc) => (loc === "irak" ? landedIrakOf(ci) : landedOf(ci));

  /* kapama: elden USD nakit (out) alıcıya/ortağa verilir, çarşıda dinara bozulur (cRate). Bu dinarın bir kısmı bankaya yatırılıp
     resmi USD havale (ins) olarak döner (bRate: banka 1 $ için kaç dinar istedi); kalan dinar alıcıda kalır, Irak masrafları ondan ödenir.
       kur farkı kârı = gelen resmi $ − bankaya giden dinarın çarşıdaki dolar maliyeti (inn·b/c)
       alıcıda kalan  = elden giden − bankaya giden dinarın çarşı maliyeti (kalan dinar ÷ çarşı kuru) → alıcının/ortağın hesabına yazılır
     Kur girilmediyse alıcıda kalanı elle yazılabilir (k.left); kur farkı = gelen + kalan − giden. Havale gelmeden / "devamı gelecek" iken hesaba girmez. */
  function kapCalc(k) {
    const out = +k.out || 0, inn = sum(k.ins || [], (x) => +x.amt || 0);
    const last = (k.ins || []).map((x) => x.date).sort().pop() || "";
    const c = +k.cRate || 0, b = +k.bRate || 0, rates = c > 0 && b > 0;
    if (!(inn > 0) || k.done === false) return { out, inn, gain: 0, kur: 0, kes: 0, left: 0, wait: true, part: inn > 0, date: "", rates, c, b };
    const bankCost = rates ? inn * b / c : null;              // bankaya giden dinarın çarşıdaki dolar karşılığı
    const left = rates ? out - bankCost : +k.left || 0;        // alıcıda kalan (masraflar için), dolar
    const kur = inn + left - out;                              // = inn − bankCost (kurlu)
    return { out, inn, gain: kur, kur, kes: 0, left, wait: false, date: last, rates, c, b, bankCost, leftDinar: rates ? left * c : null };
  }
  const kapSum = (list) => { const cs = list.map(kapCalc); return { list, out: sum(cs, (x) => x.out), inn: sum(cs, (x) => x.inn), gain: sum(cs, (x) => x.gain), kur: sum(cs, (x) => x.kur), kes: 0, left: sum(cs, (x) => x.left), wait: cs.some((x) => x.wait) }; };

  function compute(D) {
    const lots = D.lots || [], sales = D.sales || [], pays = D.pays || [], exps = D.exps || [], kaps = D.kap || [], parties = D.parties || {};
    const item = new Map(), lot = new Map(), sale = new Map(), events = [];
    const ev = (o) => { events.push(o); return o; };
    // TL faturaya bağlı TL ödeme/tahsilat faturanın kuruyla (defter kuru) dolara çevrilir: TL'si kapanan iş dolarda da kapanır.
    // Ödeme günündeki gerçek kurla farkı "fx" (TL kur farkı) olayı olarak kâra/zarara yazılır.
    const saleOf = new Map(sales.map((s) => [s.id, s])), lotOf = new Map(lots.map((l) => [l.id, l]));
    const bookRec = (p) => { const r = p.saleId ? saleOf.get(p.saleId) : p.lotId ? lotOf.get(p.lotId) : null; return r && r.cur === "TL" && p.cur === "TL" && +r.kur > 0 && +p.kur > 0 && !(p.lotId && !p.saleId && r.ortak?.on && p.dir === "in") ? r : null; };
    const payUSD = (p) => { const r = bookRec(p); return r ? (+p.amount || 0) / +r.kur : usd(p.amount, p.cur, p.kur); };
    const fxOf = (p) => { const r = bookRec(p); if (!r) return 0; const d = (+p.amount || 0) / +p.kur - (+p.amount || 0) / +r.kur; // gelen TL'nin gerçek dolar değeri − defterdeki
      const incoming = p.dir === "in"; return incoming ? d : -d; };
    for (const l of lots) for (const it of l.items) item.set(l.id + "|" + it.k, { lot: l, it, kgIn: +it.kg || 0, cu: usd(+it.ppk || 0, l.cur, l.kur), consumed: 0, soldKg: 0, konsKg: 0, irakIn: 0, soldIrak: 0, adjKg: 0, adjIrak: 0, supRetKg: 0, saleExp: 0, saleKur: 0 });
    for (const l of lots) for (const a of (l.adj || [])) { const ci = item.get(l.id + "|" + a.ik); if (!ci) continue; ci.adjKg += +a.kg || 0; if (a.loc === "irak") ci.adjIrak += +a.kg || 0; }
    for (const l of lots) if (!isIrakDest(l)) for (const sv of (l.sevk || [])) for (const ln of (sv.lines || [])) { const ci = item.get(l.id + "|" + ln.ik); if (ci) ci.irakIn += +ln.kg || 0; }
    for (const l of lots) for (const r of (l.cred || [])) { if (!(+r.kg > 0)) continue; const ci = item.get(l.id + "|" + r.ik); if (ci) { ci.supRetKg += +r.kg; ci.credAmt = (ci.credAmt || 0) + usd(r.amount, r.cur, r.kur); } }

    // masraflar ve kapamalar kayda göre gruplanır
    const eSale = new Map(), eLot = new Map(), kapS = new Map(), kapL = new Map();
    const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const x of exps) { if (x.saleId) push(eSale, x.saleId, x); else if (x.lotId) push(eLot, x.lotId, x); else ev({ kind: "ovh", date: x.date, firm: x.firmId, exp: expUSD(x), rec: x }); }
    for (const k of kaps) { if (k.saleId) push(kapS, k.saleId, k); else if (k.lotId) push(kapL, k.lotId, k); }

    // 1) alımlar: kg maliyeti (satıştan önce bilinmeli)
    for (const l of lots) {
      const es = eLot.get(l.id) || [];
      const credNoKg = sum((l.cred || []).filter((r) => !(+r.kg > 0)), (r) => usd(r.amount, r.cur, r.kur));
      const kgIn = sum(l.items, (it) => +it.kg || 0);
      const okSv = (x) => x.sevkId && !isIrakDest(l) && (l.sevk || []).some((v) => v.id === x.sevkId && sum(v.lines || [], (z) => +z.kg || 0) > 0);
      const perKg = kgIn > 0 ? (sum(es.filter((x) => !okSv(x)), expUSD) - credNoKg) / kgIn : 0;
      for (const x of es) { if (!x.sevkId) continue; const sv = (l.sevk || []).find((v) => v.id === x.sevkId); const svKg = sum(sv?.lines || [], (z) => +z.kg || 0);
        if (!sv || !svKg || isIrakDest(l)) { continue; } for (const z of sv.lines) { const ci = item.get(l.id + "|" + z.ik); if (ci) ci.sevkExp = (ci.sevkExp || 0) + expUSD(x) * (+z.kg || 0) / svKg; } }
      for (const it of l.items) { const ci = item.get(l.id + "|" + it.k); if (ci) { ci.perKg = perKg; ci.landed = ci.cu + perKg; } }
    }
    const shareOf = (l) => (l?.ortak?.on ? (+l.ortak.share || 0) / 100 : 1);

    // 2) satışlar
    for (const s of sales) {
      let tot = 0, kg = 0, rev = 0, pendKg = 0, offRet = 0, olot = null; const lines = [];
      const rets = s.ret || [];
      s.items.forEach((ln, i) => {
        const amt = (+ln.kg || 0) * (+ln.ppk || 0); tot += amt; kg += +ln.kg || 0;
        const ci = item.get(ln.lotId + "|" + ln.ik); if (ci?.lot.ortak?.on) olot = ci.lot;
        const myRet = rets.filter((r) => r.i === i), iade = sum(myRet.filter((r) => r.kind !== "kayip"), (r) => +r.kg || 0), lost = sum(myRet.filter((r) => r.kind === "kayip"), (r) => +r.kg || 0);
        const consumed = Math.max(0, (+ln.kg || 0) - iade);
        offRet += sum(myRet.filter((r) => r.kind !== "kayip" && r.off), (r) => (+r.kg || 0) * (+ln.ppk || 0)); // resmi iade faturası kesilen kısım
        let soldKg, realKg = 0, pend = 0, realAmt;
        if (s.realLater) { const rs = (s.real || []).flatMap((r) => (r.lines || []).filter((x) => x.i === i).map((x) => ({ ...x, date: r.date }))); realKg = sum(rs, (x) => +x.kg || 0); pend = Math.max(0, consumed - realKg - lost); soldKg = realKg; realAmt = sum(rs, (x) => (+x.kg || 0) * (+x.ppk || 0));
          if (ci) for (const x of rs) ev({ kind: "sale", date: x.date, firm: s.firmId, saleId: s.id, li: i, lotId: ci.lot.id, ci, kg: +x.kg || 0, rev: usd((+x.kg || 0) * (+x.ppk || 0), s.cur, s.kur), cogs: (+x.kg || 0) * costAt(ci, ln.loc), share: shareOf(ci.lot), market: s.market }); }
        else { soldKg = consumed; realAmt = consumed * (+ln.ppk || 0);
          if (ci) { ev({ kind: "sale", date: s.date, firm: s.firmId, saleId: s.id, li: i, lotId: ci.lot.id, ci, kg: +ln.kg || 0, rev: usd(amt, s.cur, s.kur), cogs: (+ln.kg || 0) * costAt(ci, ln.loc), share: shareOf(ci.lot), market: s.market });
            for (const r of myRet.filter((r) => r.kind !== "kayip")) ev({ kind: "ret", date: r.date, firm: s.firmId, saleId: s.id, li: i, lotId: ci.lot.id, ci, kg: -(+r.kg || 0), rev: -usd((+r.kg || 0) * (+ln.ppk || 0), s.cur, s.kur), cogs: -(+r.kg || 0) * costAt(ci, ln.loc), share: shareOf(ci.lot), market: s.market }); } }
        if (ci) { ci.lostKg = (ci.lostKg || 0) + lost; for (const r of myRet.filter((r) => r.kind === "kayip")) ev({ kind: "lost", date: r.date, firm: s.firmId, saleId: s.id, li: i, lotId: ci.lot.id, ci, kg: +r.kg || 0, loss: (+r.kg || 0) * costAt(ci, ln.loc), share: shareOf(ci.lot), market: s.market });
          ci.consumed += consumed; ci.soldKg += soldKg; ci.konsKg += pend; if (ln.loc === "irak") ci.soldIrak += consumed; }
        pendKg += pend; rev += realAmt;
        lines.push({ ln, i, ci, amtUSD: usd(realAmt, s.cur, s.kur), offUSD: usd(amt, s.cur, s.kur), realKg, soldKg, pend, iade, lost, consumed });
      });
      const totUSD = usd(tot, s.cur, s.kur), revUSD = usd(rev, s.cur, s.kur);
      const ps = pays.filter((p) => p.dir === "in" && p.saleId === s.id), got = sum(ps, payUSD);
      const outs = pays.filter((p) => p.dir === "out" && p.saleId === s.id), gave = sum(outs, payUSD);
      const xs = eSale.get(s.id) || [], expT = sum(xs, expUSD), expP = sum(xs.filter((x) => x.paidBy === "ortak"), expUSD), buyerExp = sum(xs.filter((x) => x.paidBy === "alici"), expUSD);
      const kp = kapSum(kapS.get(s.id) || []);
      const cashGot = sum(ps.filter(isCashPay), payUSD);
      // masraf ve kur farkı satırlara kg payıyla dağıtılır (ürün/model raporu için)
      const kgW = kg || 1;
      for (const x of xs) for (const L of lines) if (L.ci) { const sh = (+L.ln.kg || 0) / kgW; L.ci.saleExp += expUSD(x) * sh; ev({ kind: "sexp", date: x.date, firm: s.firmId, saleId: s.id, li: L.i, lotId: L.ci.lot.id, ci: L.ci, exp: expUSD(x) * sh, share: shareOf(L.ci.lot), market: s.market, rec: x }); }
      for (const k of kapS.get(s.id) || []) { const kc = kapCalc(k); if (kc.wait) continue; for (const L of lines) if (L.ci) { const sh = (+L.ln.kg || 0) / kgW; L.ci.saleKur += (kc.kur - kc.kes) * sh; ev({ kind: "kap", date: kc.date, firm: s.firmId, saleId: s.id, li: L.i, lotId: L.ci.lot.id, ci: L.ci, kur: kc.kur * sh, kes: kc.kes * sh, share: shareOf(L.ci.lot), market: s.market, rec: k }); } }
      for (const p of [...ps, ...outs]) { const fx = fxOf(p); if (Math.abs(fx) < 0.005) continue; for (const L of lines) if (L.ci) { const sh = (+L.ln.kg || 0) / kgW; L.ci.saleKur += fx * sh; ev({ kind: "fx", date: p.date, firm: s.firmId, saleId: s.id, li: L.i, lotId: L.ci.lot.id, ci: L.ci, kur: fx * sh, kes: 0, share: shareOf(L.ci.lot), market: s.market, rec: p }); } }
      // kapamadan alıcıda kalan para da alıcının bize borcudur (masrafları ondan öder; yetmezse cebinden verdiği kısım borcundan düşer)
      const due = revUSD - buyerExp + gave + kp.left - got, offPaid = got - cashGot + kp.inn;
      sale.set(s.id, { tot, totUSD, revUSD, est: !!s.realLater && pendKg > 0.5, pendKg, kg, got, gave, outs, buyerExp, due, alloc: 0, kapLeft: kp.left, offPaid, offRetUSD: usd(offRet, s.cur, s.kur), offDue: totUSD - usd(offRet, s.cur, s.kur) - offPaid, kap: kp, pays: ps, exps: xs, exp: expT, expP, olot, lines });
    }

    // 3) alım olayları: fire, tedarikçi iadesi, alım kapaması (ortak)
    for (const l of lots) {
      const kgIn = sum(l.items, (it) => +it.kg || 0) || 1;
      for (const k of kapL.get(l.id) || []) { const kc = kapCalc(k); if (kc.wait) continue; for (const it of l.items) { const ci = item.get(l.id + "|" + it.k); if (!ci) continue; const sh = (+it.kg || 0) / kgIn; ci.saleKur += (kc.kur - kc.kes) * sh; ev({ kind: "kap", date: kc.date, firm: l.firmId, lotId: l.id, ci, kur: kc.kur * sh, kes: kc.kes * sh, share: shareOf(l), rec: k }); } }
      for (const p of pays) { if (p.lotId !== l.id || p.saleId) continue; const fx = fxOf(p); if (Math.abs(fx) < 0.005) continue;
        for (const it of l.items) { const ci = item.get(l.id + "|" + it.k); if (!ci) continue; const sh = (+it.kg || 0) / kgIn; ci.saleKur += fx * sh; ev({ kind: "fx", date: p.date, firm: l.firmId, lotId: l.id, ci, kur: fx * sh, kes: 0, share: shareOf(l), rec: p }); } }
      for (const a of (l.adj || [])) { const ci = item.get(l.id + "|" + a.ik); if (ci) ev({ kind: "fire", date: a.date, firm: l.firmId, lotId: l.id, ci, kg: +a.kg || 0, loss: (+a.kg || 0) * costAt(ci, a.loc), share: shareOf(l), rec: a }); }
      for (const r of (l.cred || [])) { if (!(+r.kg > 0)) continue; const ci = item.get(l.id + "|" + r.ik); if (ci) ev({ kind: "supret", date: r.date, firm: l.firmId, lotId: l.id, ci, kg: +r.kg, loss: (+r.kg) * landedOf(ci) - usd(r.amount, r.cur, r.kur), share: shareOf(l), rec: r }); }
    }

    // 4) alım özetleri (kâr = bu alımın olayları; tedarikçi borcu)
    const evByLot = new Map(); for (const e of events) if (e.lotId) push(evByLot, e.lotId, e);
    for (const l of lots) {
      const cost = sum(l.items, (it) => (+it.kg || 0) * (+it.ppk || 0)), costUSD = usd(cost, l.cur, l.kur);
      const cred = sum(l.cred || [], (r) => usd(r.amount, r.cur, r.kur));
      const ps = pays.filter((p) => p.dir === "out" && p.lotId === l.id), refunds = pays.filter((p) => p.dir === "in" && p.lotId === l.id && !l.ortak?.on);
      const paid = sum(ps, payUSD) - sum(refunds, payUSD);
      const es = eLot.get(l.id) || [], kpl = kapSum(kapL.get(l.id) || []);
      const E = evByLot.get(l.id) || [];
      const rev = sum(E, (e) => e.rev || 0), cogs = sum(E, (e) => e.cogs || 0), sexp = sum(E, (e) => e.exp || 0), kur = sum(E, (e) => (e.kur || 0) - (e.kes || 0)), loss = sum(E, (e) => e.loss || 0);
      const soldKg = sum(l.items, (it) => item.get(l.id + "|" + it.k)?.soldKg || 0), soldCost = sum(E.filter((e) => e.kind === "sale" || e.kind === "ret"), (e) => (e.kg || 0) * (e.ci.cu || 0));
      const expUs = sum(es.filter((x) => x.paidBy !== "ortak"), expUSD) + sum(E.filter((e) => e.kind === "sexp" && e.rec?.paidBy !== "ortak"), (e) => e.exp), expP = sum(es.filter((x) => x.paidBy === "ortak"), expUSD) + sum(E.filter((e) => e.kind === "sexp" && e.rec?.paidBy === "ortak"), (e) => e.exp);
      // alım masrafları kg maliyetinin içinde: satılan kg kadarı "cogs"ta. Kâr = gelir − satılan malın kg maliyeti − satış masrafları + kur − kayıplar
      const profit = rev - cogs - sexp + kur - loss;
      const salesOf = [...new Set(E.filter((e) => e.saleId).map((e) => e.saleId))].map((id) => sales.find((s) => s.id === id)).filter(Boolean);
      const r = { cost, costUSD, cred, paid, due: costUSD - cred - paid, alloc: 0, pays: ps, refunds, sales: salesOf, exps: es, soldKg, soldCost, rev, cogs, expUs, expP, exp: expUs + expP, sexp, kur, kap: kpl, loss, profit, pct: costUSD ? Math.max(0, Math.min(1, paid / Math.max(1e-9, costUSD - cred))) : 0 };
      if (l.ortak?.on) { const sh = (+l.ortak.share || 0) / 100; const op = pays.filter((p) => p.dir === "in" && p.lotId === l.id), og = sum(op, (p) => usd(p.amount, p.cur, p.kur));
        // ortak sattığı malın parasını tutar: sermaye (satılan kg maliyeti) + bizim masraflar + kâr payımız döner. Alım kapamasının kur farkı bizde kalır, ortağın payı ondan düşülür.
        // kapama havaleleri bize geldiği için ortağın kur farkı payı borcundan düşer (formül kârı kapsar)
        const owe = rev - expP - (1 - sh) * profit + kpl.left; // alım kapamasından ortakta kalan para da ortağın borcu
        Object.assign(r, { share: sh, totalProfit: profit, ourProfit: sh * profit, owe, ogot: og, odue: owe - og, opays: op }); }
      else r.totalProfit = profit;
      lot.set(l.id, r);
    }

    // 5) bağlanmamış ödeme/tahsilatlar: aynı firmanın en eski açık kayıtlarına sırayla düşülür
    const fifo = (open, amount) => { let left = amount; for (const o of open) { if (left <= 0) break; const take = Math.min(left, Math.max(0, o.r.due)); o.r.alloc += take; o.r.due -= take; left -= take; } return left; };
    const unalloc = new Map();
    const cusIn = new Map(), supOut = new Map();
    for (const p of pays) { const v = usd(p.amount, p.cur, p.kur); const k = (p.partyId || "n:" + key(p.party)) + "|" + p.firmId;
      if (p.dir === "in" && !p.saleId && !p.lotId && parties[p.partyId]?.kind !== "supplier") cusIn.set(k, (cusIn.get(k) || 0) + v);
      if (p.dir === "out" && !p.lotId && !p.saleId && parties[p.partyId]?.kind !== "customer") supOut.set(k, (supOut.get(k) || 0) + v); }
    for (const [k, v] of cusIn) { const [pid, firm] = k.split("|"); const open = sales.filter((s) => s.firmId === firm && (s.customerId || "n:" + key(s.customer)) === pid && !sale.get(s.id).olot).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((s) => ({ r: sale.get(s.id) })); const left = fifo(open, v); if (left > 0.5) unalloc.set("c|" + k, left); }
    for (const [k, v] of supOut) { const [pid, firm] = k.split("|"); const open = lots.filter((l) => l.firmId === firm && (l.supplierId || "n:" + key(l.supplier)) === pid).sort((a, b) => String(a.orderDate || "").localeCompare(String(b.orderDate || ""))).map((l) => ({ r: lot.get(l.id) })); const left = fifo(open, v); if (left > 0.5) unalloc.set("s|" + k, left); }

    // 5b) elden işler: birine alım-satım için verilen para. Satılınca kâr = satış − sermaye − masraf; bizim payımız share.
    //     O kişinin bize borcu = sermaye + (satıldıysa) kâr payımız − geri dönen para.
    const is = new Map();
    for (const j of (D.isler || [])) {
      const sermaye = sum(j.ver || [], (x) => usd(x.amount, x.cur, x.kur)), back = sum(j.don || [], (x) => usd(x.amount, x.cur, x.kur));
      const kg = sum(j.items || [], (it) => +it.kg || 0), sold = !!j.satis, sh = (+j.share || 0) / 100;
      const rev = sold ? (j.items || []).reduce((a, it, i) => a + (+it.kg || 0) * (+(j.satis.ppk || [])[i] || 0), 0) : 0, masraf = sold ? +j.satis.masraf || 0 : 0;
      const profit = sold ? rev - sermaye - masraf : 0, ourProfit = profit * sh, owe = sermaye + ourProfit;
      if (sold) ev({ kind: "is", date: j.satis.date, firm: j.firmId, isId: j.id, rev, cogs: sermaye, exp: masraf, share: sh, kg, rec: j });
      is.set(j.id, { sermaye, back, kg, sold, sh, rev, masraf, profit, ourProfit, owe, due: owe - back, buyPpk: kg ? sermaye / kg : 0, sellPpk: sold && kg ? rev / kg : 0 });
    }

    // 6) son maliyet / kg: şu ana kadarki tüm masraflar ve kur farkı dahil, fire ve iade düşülmüş kg başına
    for (const ci of item.values()) {
      const net = ci.kgIn - ci.adjKg - ci.supRetKg - (ci.lostKg || 0); // satılabilir kg: fire, tedarikçiye iade ve konsinyede kaybolan düşülür
      ci.finalCost = net > 0 ? (ci.kgIn * landedOf(ci) + (ci.sevkExp || 0) - (ci.credAmt || 0) + ci.saleExp - ci.saleKur) / net : landedOf(ci);
    }
    return { item, lot, sale, is, events, unalloc, payUSD };
  }

  /* cari bakiyeler (firma süzgeci dışarıdan): tedarikçi = alış − indirim − ödenen; müşteri = gerçek satış + ona verilen − yerimize ödediği − tahsil + ortak hesap */
  function partyBalances(D, R, inFirm) {
    const parties = D.parties || {}; const sup = new Map(), cus = new Map();
    const pk = (id, nm) => (id ? "i:" + id : "n:" + key(nm));
    const lotOf = new Map((D.lots || []).map((l) => [l.id, l]));
    const g = (m, k, name, id) => { if (!m.has(k)) m.set(k, { pk: k, id, name, a: 0, p: 0, n: 0, last: "" }); return m.get(k); };
    for (const [id, p] of Object.entries(parties)) g(p.kind === "supplier" ? sup : cus, "i:" + id, p.name, id);
    for (const l of D.lots.filter(inFirm)) { const c = R.lot.get(l.id); const r = g(sup, pk(l.supplierId, l.supplier), parties[l.supplierId]?.name || l.supplier, l.supplierId); r.a += c.costUSD - c.cred; r.n++;
      if (l.ortak?.on) { const o = g(cus, pk(l.ortak.partnerId, ""), parties[l.ortak.partnerId]?.name || "", l.ortak.partnerId); o.a += c.owe || 0; o.n++; } }
    for (const j of (D.isler || []).filter(inFirm)) { const c = R.is?.get(j.id); if (!c) continue; const r = g(cus, pk(j.partyId, j.party), parties[j.partyId]?.name || j.party, j.partyId); r.a += c.owe; r.p += c.back; r.n++;
      for (const x of (j.don || [])) if ((x.date || "") > r.last) r.last = x.date; }
    for (const s of D.sales.filter(inFirm)) { const c = R.sale.get(s.id); if (c.olot) continue; const r = g(cus, pk(s.customerId, s.customer), parties[s.customerId]?.name || s.customer, s.customerId); r.a += c.revUSD + (c.kapLeft || 0); r.p += c.buyerExp; r.n++; }
    const pv = R.payUSD || ((p) => usd(p.amount, p.cur, p.kur));
    for (const p of D.pays.filter(inFirm)) { const isCus = parties[p.partyId]?.kind === "customer", v = pv(p);
      const lp = p.lotId && !p.saleId ? lotOf.get(p.lotId) : null; // ortak olmayan alıma bağlı gelen para = tedarikçi iadesi
      const m = p.dir === "out" ? (isCus ? cus : sup) : (parties[p.partyId]?.kind === "supplier" || (lp && !lp.ortak?.on) ? sup : cus); const r = g(m, pk(p.partyId, p.party), parties[p.partyId]?.name || p.party, p.partyId);
      if (p.dir === "out") { if (isCus) r.a += v; else r.p += v; } else { if (m === sup) r.p -= v; else r.p += v; }
      if ((p.date || "") > r.last) r.last = p.date; }
    const srt = (m) => [...m.values()].sort((a, b) => (b.a - b.p) - (a.a - a.p) || String(a.name).localeCompare(String(b.name), "tr"));
    return { sup: srt(sup), cus: srt(cus) };
  }

  /* Excel sayfaları: uygulamadaki "Excel'e aktar" ve sunucudaki haftalık yedek AYNI tabloları üretir.
     H: ad çözücüler { firm(id), party(id, yedek), prod(it), stage(l) } — dil/ekran işi dışarıda kalır. */
  function sheets(D, R, H, inFirm = () => true) {
    const r2 = (n) => Math.round((+n || 0) * 100) / 100, r4 = (n) => Math.round((+n || 0) * 10000) / 10000;
    const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
    const lots = (D.lots || []).filter(inFirm).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const sales = (D.sales || []).filter(inFirm).slice().sort(byDate);
    const lotOf = new Map((D.lots || []).map((l) => [l.id, l])), saleOf = new Map((D.sales || []).map((s) => [s.id, s]));
    const lbl = (it) => it ? `${H.prod(it)}${it.model ? " " + it.model : ""}` : "?";
    const cust = (s) => H.party(s.customerId, s.customer), supp = (l) => H.party(l.supplierId, l.supplier);
    const MKT = { irak: "Irak", ic: "İç piyasa", diger: "İhracat" };
    const out = {};
    out["Alımlar"] = lots.flatMap((l) => { const c = R.lot.get(l.id); return l.items.map((it) => { const ci = R.item.get(l.id + "|" + it.k);
      return { "Kod": l.code, "Firma": H.firm(l.firmId), "Ortak": l.ortak?.on ? `${H.party(l.ortak.partnerId)} %${l.ortak.share}` : "", "Tedarikçi": supp(l), "Menşe": l.origin || "", "Ürün": H.prod(it), "Model": it.model || "",
        "Alınan kg": +it.kg || 0, "Fiyat /kg": it.ppk, "Para birimi": l.cur, "Kur": l.cur === "TL" ? l.kur : "", "Satır tutarı": r2((+it.kg || 0) * (+it.ppk || 0)),
        "Satılan kg": ci ? r2(ci.soldKg) : 0, "Konsinyede kg": ci ? r2(ci.konsKg) : 0, "Fire kg": ci ? r2(ci.adjKg) : 0, "Tedarikçiye iade kg": ci ? r2(ci.supRetKg) : 0,
        "Kalan kg": ci ? r2(itemStock(ci)) : +it.kg || 0, "Irak'ta kalan kg": ci ? r2(Math.max(0, isIrakDest(l) ? itemStock(ci) : irakLeft(ci))) : 0,
        "Maliyet $/kg (masraflar dahil)": ci ? r4(landedOf(ci)) : "", "Irak'ta maliyet $/kg (sevk navlunu dahil)": ci && ci.sevkExp ? r4(landedIrakOf(ci)) : "", "Son maliyet $/kg (her şey dahil)": ci ? r4(ci.finalCost) : "",
        "Aşama": H.stage(l), "Varış yeri": isIrakDest(l) ? "Doğrudan Irak deposu" : "Mersin SB",
        "Alım toplam USD": r2(c.costUSD), "İade / indirim USD": r2(c.cred), "Ödenen USD": r2(c.paid), "Kalan borç USD": r2(c.due),
        "Alım kârı USD (satılan kısım)": r2(c.profit), "Bizim kâr payımız USD": l.ortak?.on ? r2(c.ourProfit) : r2(c.profit), "Ortaktan beklenen USD": l.ortak?.on ? r2(c.odue) : "",
        "Sipariş": l.orderDate || "", "Yükleme": l.loadDate || "", "Tahmini varış": l.eta || "", "Varış": l.arriveDate || "", "Taşıma": l.transport === "tir" ? "TIR" : "Gemi",
        "Gemi / nakliye firması": l.transport === "tir" ? l.trucker || "" : l.carrier || l.vessel || "", "Konteyner no": (Array.isArray(l.cntNos) ? l.cntNos : [l.cntNos]).filter(Boolean).join(", "),
        "Konşimento": l.bl || "", "Booking": l.booking || "", "TIR plakası": (l.plates || []).join(", "), "CMR": l.cmr || "", "Fatura no": l.invoiceNo || "", "Not": l.note || "" }; }); });
    // satış satırı: kâr o satıra düşen olaylardan (satış, iade, kayıp, satış masrafı payı, kapama payı)
    out["Satışlar"] = sales.flatMap((s) => { const c = R.sale.get(s.id); return c.lines.map((L) => { const ci = L.ci;
      const E = R.events.filter((e) => e.saleId === s.id && e.li === L.i); const g = (k) => sum(E, (e) => e[k] || 0);
      const profit = g("rev") - g("cogs") - g("exp") + g("kur") - g("kes") - g("loss");
      return { "Tarih": s.date, "Firma": H.firm(s.firmId), "Müşteri": cust(s), "Pazar": MKT[s.market] || s.market || "", "Ortak alım": c.olot?.code || "", "Konsinye": s.realLater ? "Evet" : "",
        "Alım": ci?.lot.code || "", "Stok yeri": L.ln.loc === "irak" || isIrakDest(ci?.lot) ? "Irak deposu" : "Mersin SB", "Ürün": ci ? H.prod(ci.it) : "", "Model": ci?.it.model || "",
        "Faturadaki kg": +L.ln.kg || 0, "Fatura fiyatı /kg": L.ln.ppk, "Para birimi": s.cur, "Kur": s.cur === "TL" ? s.kur : "", "Fatura tutarı USD": r2(L.offUSD),
        "Satılan kg": r2(L.soldKg), "İade kg": r2(L.iade), "Kayıp kg": r2(L.lost), "Konsinyede bekleyen kg": r2(L.pend), "Gerçek satış USD": r2(L.amtUSD),
        "Malın maliyeti USD": r2(g("cogs")), "Satış masrafı payı USD": r2(g("exp")), "Kur farkı payı USD": r2(g("kur") - g("kes")), "Kayıp USD": r2(g("loss")), "Kâr USD": r2(profit),
        "Belge no": s.docNo || s.ciNo || "", "Plaka": s.plate || "", "Not": s.note || "" }; }); });
    // satış başına para durumu (tahsilat bir kere yazılır)
    out["Satış tahsilatları"] = sales.filter((s) => !R.sale.get(s.id).olot).map((s) => { const c = R.sale.get(s.id);
      return { "Tarih": s.date, "Firma": H.firm(s.firmId), "Müşteri": cust(s), "Fatura USD": r2(c.totUSD), "İade faturası USD": r2(c.offRetUSD), "Gerçek satış USD": r2(c.revUSD), "Tahsil USD": r2(c.got), "Cariden düşülen USD": r2(c.alloc),
        "Alıcıya verilen USD": r2(c.gave), "Kapamadan alıcıda kalan USD": r2(c.kapLeft), "Alıcının yerimize ödediği USD": r2(c.buyerExp), "Kalan alacak USD": r2(c.due), "Resmi gelen USD": r2(c.offPaid), "Resmi kalan USD": r2(c.offDue), "Vade": s.dueDate || "" }; });
    const payType = (p) => { const l = lotOf.get(p.lotId);
      if (p.dir === "out") return p.saleId ? "Alıcıya ödeme" : "Tedarikçiye ödeme";
      return p.lotId && !p.saleId && l && !l.ortak?.on ? "Tedarikçi iadesi" : p.lotId && !p.saleId ? "Ortaktan tahsilat" : "Tahsilat"; };
    out["Ödemeler"] = (D.pays || []).filter(inFirm).slice().sort(byDate).map((p) => ({ "Tarih": p.date, "Tür": payType(p), "Firma": H.firm(p.firmId), "Kime / kimden": H.party(p.partyId, p.party), "Açıklama": p.kind || "",
      "Hesap": String(p.bank || "").replace(/^b:/, ""), "Yöntem": p.method || "", "Tutar": +p.amount || 0, "Para birimi": p.cur, "Kur": p.cur === "TL" ? p.kur : "", "Tutar USD": r2(usd(p.amount, p.cur, p.kur)),
      "İlgili": p.saleId ? (saleOf.get(p.saleId) ? `Satış ${saleOf.get(p.saleId).date} · ${cust(saleOf.get(p.saleId))}` : "") : p.lotId ? (lotOf.get(p.lotId)?.code || "") : "cariden düşer", "Not": p.note || "" }));
    out["Masraflar"] = (D.exps || []).filter(inFirm).slice().sort(byDate).map((x) => { const s = saleOf.get(x.saleId), l = lotOf.get(x.lotId);
      return { "Tarih": x.date, "Tür": x.cat || "", "Firma": H.firm(x.firmId), "Kime": x.payee || "", "İlgili iş": s ? `Satış ${s.date} · ${cust(s)}` : l ? l.code : "Genel gider",
        "Kim ödedi": x.paidBy === "ortak" ? "Ortak" : x.paidBy === "alici" ? "Alıcı (bizim yerimize)" : "Biz", "Hesap": x.bank || "", "Tutar": +x.amount || 0, "Para birimi": x.cur, "Kur": x.cur === "TL" ? x.kur : "", "Tutar USD": r2(expUSD(x)), "Belge no": x.docNo || "", "Not": x.note || "" }; });
    out["Kapamalar"] = (D.kap || []).filter(inFirm).slice().sort(byDate).map((k) => { const kc = kapCalc(k), s = saleOf.get(k.saleId), l = lotOf.get(k.lotId);
      return { "Tarih": k.date, "Firma": H.firm(k.firmId), "İlgili": s ? `Satış ${s.date} · ${cust(s)}` : l ? `Ortak alım ${l.code}` : "", "Elden giden USD": kc.out,
        "Çarşı kuru": +k.cRate || "", "Banka kuru": +k.bRate || "", "Çarşıda alınan dinar": kc.rates ? Math.round(kc.out * kc.c) : "", "Bankaya yatan dinar": kc.rates && !kc.wait ? Math.round(kc.inn * kc.b) : "",
        "Resmi gelen USD": r2(kc.inn), "Durum": kc.wait ? (kc.part ? "Kısmen geldi" : "Resmi havale bekleniyor") : "Tamam",
        "Kur farkı kârı USD": kc.wait ? "" : r2(kc.kur), "Alıcıda kalan dinar": kc.wait || !kc.rates ? "" : Math.round(kc.leftDinar), "Alıcıda kalan USD (masraflar için)": kc.wait ? "" : r2(kc.left),
        "Havaleler": (k.ins || []).map((x) => `${x.date} ${x.amt}$ ${String(x.bank || "").split("|")[0].replace(/^b:/, "")}`).join(", "), "Not": k.note || "" }; });
    out["Elden işler"] = (D.isler || []).filter(inFirm).slice().sort(byDate).map((j) => { const c = R.is.get(j.id);
      return { "Tarih": j.date, "Firma": H.firm(j.firmId), "Kişi": H.party(j.partyId, j.party), "Mallar": (j.items || []).map((it) => `${lbl(it)} ${Math.round(+it.kg || 0)} kg`).join(", "), "Verilen USD": r2(c.sermaye),
        "Durum": c.sold ? `Satıldı ${j.satis.date}` : "Satılmadı", "Satış USD": c.sold ? r2(c.rev) : "", "Masraf USD": c.sold ? r2(c.masraf) : "", "Kâr USD": c.sold ? r2(c.profit) : "", "Kâr payımız": `%${+j.share || 0}`,
        "Bizim kâr USD": c.sold ? r2(c.ourProfit) : "", "Dönmesi gereken USD": r2(c.owe), "Dönen USD": r2(c.back), "Kalan USD": r2(c.due), "Not": j.note || "" }; });
    out["Fire, iade, kayıp"] = [
      ...lots.flatMap((l) => (l.adj || []).map((a) => { const ci = R.item.get(l.id + "|" + a.ik); return { "Tarih": a.date, "Tür": "Fire / stok düzeltme", "Alım": l.code, "Firma": H.firm(l.firmId), "Ürün": lbl(ci?.it), "kg": +a.kg || 0, "Tutar USD": ci ? r2((+a.kg || 0) * (a.loc === "irak" ? landedIrakOf(ci) : landedOf(ci))) : "", "Not": a.note || a.reason || "" }; })),
      ...lots.flatMap((l) => (l.cred || []).map((r) => ({ "Tarih": r.date, "Tür": +r.kg > 0 ? "Tedarikçiye mal iadesi" : "Tedarikçi indirimi", "Alım": l.code, "Firma": H.firm(l.firmId), "Ürün": +r.kg > 0 ? lbl(l.items.find((i) => i.k === r.ik)) : "", "kg": +r.kg || "", "Tutar USD": r2(usd(r.amount, r.cur, r.kur)), "Not": r.note || "" }))),
      ...sales.flatMap((s) => (s.ret || []).map((r) => { const L = R.sale.get(s.id).lines[r.i]; return { "Tarih": r.date, "Tür": r.kind === "kayip" ? "Konsinyede kayıp" : s.realLater ? "Konsinyeden geri geldi" : "Müşteri iadesi", "Alım": L?.ci?.lot.code || "", "Firma": H.firm(s.firmId), "Ürün": lbl(L?.ci?.it), "kg": +r.kg || 0, "Tutar USD": L?.ci ? r2((+r.kg || 0) * (r.kind === "kayip" ? (L.ln.loc === "irak" ? landedIrakOf(L.ci) : landedOf(L.ci)) : usd(+L.ln.ppk || 0, s.cur, s.kur))) : "", "Not": `${cust(s)}${r.note ? " · " + r.note : ""}` }; })),
    ].sort(byDate);
    out["Irak sevkleri"] = lots.flatMap((l) => (l.sevk || []).map((sv) => ({ "Tarih": sv.date, "Alım": l.code, "Firma": H.firm(l.firmId), "Ürünler": (sv.lines || []).map((z) => `${lbl(l.items.find((i) => i.k === z.ik))} ${Math.round(+z.kg || 0)} kg`).join(", "), "Toplam kg": sum(sv.lines || [], (z) => +z.kg || 0), "Nakliye firması": sv.trucker || "", "TIR plakası": (sv.plates || []).join(", "), "Not": sv.note || "" }))).sort(byDate);
    const KT = { is: "Elden iş", fx: "TL kur farkı", sale: "Satış", ret: "İade", lost: "Kayıp", sexp: "Satış masrafı", kap: "Kapama kur farkı", fire: "Fire", supret: "Tedarikçiye iade", ovh: "Genel gider" };
    out["Kâr hareketleri"] = R.events.filter((e) => inFirm({ firmId: e.firm })).slice().sort(byDate).map((e) => { const full = (e.rev || 0) - (e.cogs || 0) - (e.exp || 0) + (e.kur || 0) - (e.kes || 0) - (e.loss || 0), sh = e.kind === "ovh" ? 1 : e.share ?? 1;
      return { "Tarih": e.date || "", "Hareket": KT[e.kind] || e.kind, "Firma": H.firm(e.firm), "Alım": e.ci?.lot.code || "", "Ürün": e.ci ? lbl(e.ci.it) : e.kind === "is" ? (e.rec.items || []).map(lbl).join(", ") : "", "Müşteri": e.saleId && saleOf.get(e.saleId) ? cust(saleOf.get(e.saleId)) : e.kind === "is" ? H.party(e.rec.partyId, e.rec.party) : "", "kg": e.kg ? r2(e.kg) : "",
        "Gelir USD": r2(e.rev), "Malın maliyeti USD": r2(e.cogs), "Masraf USD": r2(e.exp), "Kur farkı USD": r2(e.kur), "Kesinti USD": r2(e.kes), "Fire / kayıp USD": r2(e.loss), "Kâr USD": r2(full), "Kâr payımız": sh < 1 ? `%${Math.round(sh * 100)}` : "", "Bizim kâr USD": r2(full * sh) }; });
    const PB = partyBalances(D, R, inFirm);
    out["Cari tedarikçi"] = PB.sup.filter((r) => r.a || r.p).map((r) => ({ "Tedarikçi": r.name, "Alış (iade/indirim düşülmüş) USD": r2(r.a), "Ödenen USD": r2(r.p), "Bakiye USD": r2(r.a - r.p), "Son ödeme": r.last || "" }));
    out["Cari müşteri"] = PB.cus.filter((r) => r.a || r.p).map((r) => ({ "Müşteri / ortak": r.name, "Satış / ortak hesap USD": r2(r.a), "Tahsil USD": r2(r.p), "Bakiye USD": r2(r.a - r.p), "Son ödeme": r.last || "" }));
    out["Rehber"] = Object.values(D.parties || {}).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")).map((p) => ({ "Tür": p.kind === "supplier" ? "Tedarikçi" : "Müşteri / ortak", "Firma": p.name, "İlgili kişi": p.person || "", "Telefon": p.phone || "", "E-posta": p.email || "", "Web": p.web || "", "Ülke": p.country || "", "Şehir": p.city || "", "Adres": p.address || "", "Banka": p.bank || "", "Not": p.note || "" }));
    return out;
  }

  /* Maliyet dökümü (bir alım kalemi): şimdiye kadar bu mal için harcanan ve kazanılan her şey ÷ satılabilir kg = son maliyet / kg.
     Alım masrafları kalemlere kg payıyla, sevk navlunu o sevkte giden kg'ye, satış (konsinye dahil) masrafları ve kur farkları satış satırlarına kg payıyla dağıtılmış olarak gelir. */
  function costBreakdown(D, R, lotId, ik) {
    const ci = R.item.get(lotId + "|" + ik); if (!ci) return null; const l = ci.lot;
    const kgIn = sum(l.items, (it) => +it.kg || 0) || 1, sh = ci.kgIn / kgIn;
    const lines = []; const add = (group, label, total) => { if (Math.abs(total) < 0.005) return; const x = lines.find((y) => y.group === group && y.label === label); if (x) x.total += total; else lines.push({ group, label, total }); };
    add("alis", "Alış fiyatı", ci.kgIn * ci.cu);
    const okSv = (x) => x.sevkId && !isIrakDest(l) && (l.sevk || []).some((v) => v.id === x.sevkId && sum(v.lines || [], (z) => +z.kg || 0) > 0);
    for (const x of (D.exps || []).filter((x) => x.lotId === l.id && !x.saleId)) {
      if (okSv(x)) { const sv = l.sevk.find((v) => v.id === x.sevkId), svKg = sum(sv.lines, (z) => +z.kg || 0), my = sum(sv.lines.filter((z) => z.ik === ik), (z) => +z.kg || 0); add("sevk", `${x.cat || "Masraf"} (Irak sevki)`, expUSD(x) * my / svKg); }
      else add("alim", x.cat || "Alım masrafı", expUSD(x) * sh);
    }
    for (const r of (l.cred || [])) { if (+r.kg > 0) { if (r.ik === ik) add("ind", "Tedarikçiye mal iadesi (alacak dekontu)", -usd(r.amount, r.cur, r.kur)); } else add("ind", "Tedarikçi fiyat indirimi", -usd(r.amount, r.cur, r.kur) * sh); }
    for (const e of R.events) { if (e.ci !== ci) continue;
      if (e.kind === "sexp") add("satis", e.rec?.cat || "Satış masrafı", e.exp || 0);
      else if (e.kind === "kap") add("kur", "Kur farkı kârı (kapama)", -((e.kur || 0) - (e.kes || 0)));
      else if (e.kind === "fx") add("kur", "TL kur farkı", -(e.kur || 0)); }
    const totalCost = sum(lines, (x) => x.total);
    const fireKg = ci.adjKg || 0, supRetKg = ci.supRetKg || 0, lostKg = ci.lostKg || 0, sellKg = ci.kgIn - fireKg - supRetKg - lostKg;
    const sold = R.events.filter((e) => e.ci === ci && (e.kind === "sale" || e.kind === "ret")), soldKg = sum(sold, (e) => e.kg || 0), rev = sum(sold, (e) => e.rev || 0);
    return { ci, lines, totalCost, kgIn: ci.kgIn, fireKg, supRetKg, lostKg, sellKg, perKg: sellKg > 0 ? totalCost / sellKg : null, soldKg, rev, avgPrice: soldKg > 0 ? rev / soldKg : null, stockKg: itemStock(ci) + (ci.konsKg || 0) };
  }

  return { compute, partyBalances, sheets, costBreakdown, kapCalc, kapSum, itemStock, irakLeft, hereLeft, landedOf, landedIrakOf, isCashPay, usd, sum };
})();
// </calc.js>
const usd = (a: any, c: string, k: any) => (c === "TL" || c === "IQD" ? (+k > 0 ? (+a || 0) / +k : 0) : +a || 0);
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const fmt0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const usdf = (v: number) => (v < 0 ? "−" : "") + "$" + fmt0.format(Math.abs(Math.round(v)));
const MON = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const fd = (d?: string) => { if (!d) return "—"; const [y, m, dd] = d.slice(0, 10).split("-"); return `${+dd} ${MON[+m - 1]} ${y}`; };
const todayTR = () => iso(new Date(Date.now() + 3 * 3600e3));
const daysTo = (d: string) => Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(todayTR() + "T12:00:00Z")) / 864e5);
const ST: Record<string, string> = { siparis: "Sipariş", onodeme: "Ön ödeme", yuklendi: "Yüklendi", yolda: "Yolda", depoda: "Depoda", kapandi: "Kapandı" };
const MK: Record<string, string> = { irak: "Irak", ic: "İç piyasa", diger: "İhracat" };

function model(rows: { col: string; id: string; data: any }[]) {
  const by = (c: string) => rows.filter((r) => r.col === c).map((r) => ({ id: r.id, ...r.data }));
  const firms = Object.fromEntries(rows.filter((r) => r.col === "firms").map((r) => [r.id, r.data]));
  const products = Object.fromEntries(rows.filter((r) => r.col === "products").map((r) => [r.id, r.data]));
  const parties = Object.fromEntries(rows.filter((r) => r.col === "parties").map((r) => [r.id, r.data]));
  const lots = by("lots").map((l: any) => { if (!Array.isArray(l.items) || !l.items.length) l.items = [{ k: "i1", productId: "", product: l.product || "", model: "", kg: +l.kg || 0, price: +l.price || 0, ppk: +l.ppk || 0 }]; return l; });
  const sales = by("sales").map((s: any) => { if (!Array.isArray(s.items)) s.items = s.lotId ? [{ lotId: s.lotId, ik: "i1", kg: +s.kg || 0, ppk: +s.ppk || 0 }] : []; return s; });
  const pays = by("pays"), exps = by("exps"), trf = by("trf"), kaps = by("kap"), isler = by("isler");
  const D = { lots, sales, pays, exps, kap: kaps, trf, isler, parties, products };
  const R = CALC.compute(D);
  const pname = (id?: string, fb?: string) => (id && parties[id]?.name) || fb || "—";
  const prodName = (it: any) => (it?.productId ? products[it.productId]?.name : it?.product) || "—";
  const firm = (id: string) => id === "x" ? "Elden (firmasız)" : firms[id]?.name || ({ a: "Asya Çerez", b: "Gökhan Altın" } as any)[id] || id;
  return { firms, products, parties, lots, sales, pays, exps, trf, kaps, D, R, items: R.item, saleC: R.sale, lotC: R.lot, pname, prodName, firm };
}

/* ---------- 2) haftalık özet + 3) yedek ---------- */
async function doHaftalik(req: Request) {
  const body = await req.json().catch(() => ({}));
  const settings = (await getDoc("settings", "mail")) || {};
  const me = await caller(req);
  const test = body.test as string | undefined;
  if (test) { if (me?.role !== "owner") throw new HttpError(403, "Bu işlemi sadece defterin sahibi yapabilir."); }
  else {
    const last = settings.lastSent ? Date.parse(settings.lastSent) : 0;
    if (Date.now() - last < 6 * 864e5) return { ok: true, atlandi: "bu hafta zaten gönderildi" };
  }
  const rows = await allDocs();
  const M = model(rows);
  const { data: members } = await admin.from("members").select("email,role,name");
  const owner = (members || []).find((m) => m.role === "owner");
  const backupTo = String(settings.backupTo || owner?.email || "").trim();
  const sent: string[] = [];
  if (test === "digest" || (!test && settings.digest !== false)) {
    const html = digestHtml(M);
    const to = test ? [me!.email] : (members || []).map((m) => m.email);
    for (const t of to) { await sendMail({ to: t, subject: `Ürün Defteri · Haftalık özet · ${fd(todayTR())}`, html }); sent.push("özet→" + t); }
  }
  if (test === "backup" || (!test && settings.backup !== false)) {
    if (backupTo) {
      const { default: XLSX } = await import("npm:xlsx@0.18.5");
      const xlsx = buildXlsx(XLSX, M);
      const dump = new TextEncoder().encode(JSON.stringify({ alindi: new Date().toISOString(), kayitlar: rows }));
      const d = todayTR();
      await sendMail({ to: backupTo, subject: `Ürün Defteri · Haftalık yedek · ${fd(d)}`, html: backupHtml(M, rows.length),
        attachments: [
          { filename: `urun-defteri-${d}.xlsx`, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
          { filename: `urun-defteri-yedek-${d}.json`, content: dump, contentType: "application/json" },
        ] });
      sent.push("yedek→" + backupTo);
    }
  }
  if (!test) await putDoc("settings", "mail", { ...settings, lastSent: new Date().toISOString() });
  return { ok: true, gonderilen: sent };
}

const css = {
  wrap: "font-family:Arial,Helvetica,sans-serif;color:#16201A;max-width:640px;margin:0 auto;background:#ffffff",
  h1: "font-size:22px;margin:0 0 4px;letter-spacing:.02em",
  h2: "font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#566660;margin:26px 0 8px;border-bottom:1px solid #CFD9D3;padding-bottom:6px",
  table: "width:100%;border-collapse:collapse;font-size:14px",
  td: "padding:7px 8px;border-bottom:1px solid #E4EAE6;vertical-align:top",
  r: "padding:7px 8px;border-bottom:1px solid #E4EAE6;text-align:right;white-space:nowrap",
  muted: "color:#566660;font-size:12px",
};
const tbl = (head: string[], rows: string[][], right: number[] = []) =>
  `<table style="${css.table}"><tr>${head.map((h, i) => `<td style="${right.includes(i) ? css.r : css.td};font-size:11px;color:#566660;text-transform:uppercase">${h}</td>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="${right.includes(i) ? css.r : css.td}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function digestHtml(M: ReturnType<typeof model>) {
  const t = todayTR();
  const weekAgo = iso(new Date(Date.parse(t) - 7 * 864e5));
  const lotLabel = (l: any) => `${esc(l.code)} · ${esc([...new Set(l.items.map((it: any) => `${M.prodName(it)}${it.model ? " " + it.model : ""}`))].join(", "))}`;
  const itLabel = (it: any) => `${M.prodName(it)}${it?.model ? " " + it.model : ""}`;
  const age = (d: string) => (d ? -daysTo(d) : 0);
  // Firmalar ve "Elden" (firmasız) kayıtlar ayrı bölümlerde; rakamlar uygulamayla aynı motordan (CALC)
  const section = (fil: (firmId: string) => boolean) => {
    const F = (x: any) => fil(x.firmId);
    const lots = M.lots.filter(F), sales = M.sales.filter(F), pays = M.pays.filter(F), exps = M.exps.filter(F), kaps = M.kaps.filter(F);
    let h = "";
    // geçen 7 gün (kâr: o hafta gerçekleşen kâr olayları, ortak alımda bizim payımız, genel giderler düşülmüş)
    const wk = (arr: any[], f: string) => arr.filter((x) => (x[f] || "") >= weekAgo && (x[f] || "") <= t);
    const wLots = wk(lots, "orderDate"), wSales = wk(sales, "date"), wOut = wk(pays.filter((p: any) => p.dir === "out"), "date"), wIn = wk(pays.filter((p: any) => p.dir === "in"), "date"), wExp = wk(exps, "date");
    const wEv = M.R.events.filter((e: any) => fil(e.firm) && (e.date || "") >= weekAgo && (e.date || "") <= t);
    const wProfit = sum(wEv, (e: any) => ((e.rev || 0) - (e.cogs || 0) - (e.exp || 0) + (e.kur || 0) - (e.kes || 0) - (e.loss || 0)) * (e.kind === "ovh" ? 1 : e.share ?? 1));
    const S = (arr: any[], f: (x: any) => number) => usdf(sum(arr, f));
    h += `<h2 style="${css.h2}">Geçen 7 gün</h2>${tbl(["", "Adet", "Tutar"], [
      ["Yeni alım", String(wLots.length), S(wLots, (l) => M.lotC.get(l.id).costUSD)],
      ["Satış (fatura)", String(wSales.length), S(wSales, (s) => M.saleC.get(s.id).totUSD)],
      ["Tedarikçiye ödeme", String(wOut.length), S(wOut, (p) => usd(p.amount, p.cur, p.kur))],
      ["Tahsilat", String(wIn.length), S(wIn, (p) => usd(p.amount, p.cur, p.kur))],
      ["Masraf", String(wExp.length), S(wExp, (x) => usd(x.amount, x.cur, x.kur))],
      ["<b>Kâr</b> <span style=\"" + css.muted + "\">(gerçekleşen, bizim pay)</span>", "", `<b style="color:${wProfit >= 0 ? "#2E7D32" : "#B3261E"}">${usdf(wProfit)}</b>`],
    ], [1, 2])}`;
    // bekleyenler: resmi havalesi gelmemiş kapamalar + konsinyede bekleyen mal
    const kw = kaps.map((k: any) => ({ k, kc: CALC.kapCalc(k) })).filter((x: any) => x.kc.wait).sort((a: any, b: any) => String(a.k.date).localeCompare(String(b.k.date)));
    const kons = sales.filter((s: any) => s.realLater && M.saleC.get(s.id).pendKg > 0.5).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    if (kw.length || kons.length) {
      h += `<h2 style="${css.h2}">Bekleyenler</h2>` + tbl(["İş", "Kim", "Tutar / miktar", "Süre"], [
        ...kw.map(({ k, kc }: any) => { const s = M.sales.find((x: any) => x.id === k.saleId), l = M.lots.find((x: any) => x.id === k.lotId); const g = age(k.date);
          return [kc.part ? "Kapama · devamı bekleniyor" : "Kapama · resmi havale bekleniyor", esc(s ? M.pname(s.customerId, s.customer) : l ? `${l.code} · ${M.pname(l.ortak?.partnerId)}` : "—"), `${usdf(kc.out)} elden${kc.part ? ` · ${usdf(kc.inn)} geldi` : ""}`, g > 7 ? `<b style="color:#A8530F">${g} gün</b>` : `${g} gün`]; }),
        ...kons.map((s: any) => { const c = M.saleC.get(s.id); const g = age(s.date);
          return ["Konsinye · satılmayı bekliyor", esc(M.pname(s.customerId, s.customer)), `${esc([...new Set(c.lines.map((L: any) => L.ci ? itLabel(L.ci.it) : "?"))].join(", "))} · ${fmt0.format(Math.round(c.pendKg))} kg`, g > 30 ? `<b style="color:#A8530F">${g} gün</b>` : `${g} gün`]; }),
      ], [3]);
    }
    // yoldaki mallar
    const coming = lots.filter((l: any) => (l.status === "yuklendi" || l.status === "yolda") && l.eta && daysTo(l.eta) <= 21).sort((a: any, b: any) => a.eta.localeCompare(b.eta));
    const noEta = lots.filter((l: any) => (l.status === "yuklendi" || l.status === "yolda") && !l.eta);
    const via = (l: any) => esc((l.transport === "tir" ? ["TIR", l.trucker, ...(l.plates || [])] : [l.carrier]).filter(Boolean).join(" · ") || "—") + (l.dest === "irak" ? " → Irak deposu" : "");
    h += `<h2 style="${css.h2}">Yoldaki mallar</h2>`;
    h += coming.length || noEta.length ? tbl(["Alım", "Gemi / nakliye", "Tahmini varış", ""], [
      ...coming.map((l: any) => { const d = daysTo(l.eta); return [lotLabel(l), via(l), fd(l.eta), d < 0 ? `<b style="color:#B3261E">${-d} gün gecikti</b>` : d === 0 ? "<b>bugün</b>" : `${d} gün`]; }),
      ...noEta.map((l: any) => [lotLabel(l), via(l), "girilmedi", ST[l.status]]),
    ], [3]) : `<p style="${css.muted}">Yolda mal yok.</p>`;
    // stok: bizde (Mersin SB, Irak deposu), ortakta, konsinyede — ürünler arası toplam yok
    const stock = new Map<string, Map<string, { kg: number; cost: number; fc: number }>>();
    const put = (p: string, k: string, kg: number, ci: any, irak = false) => { if (kg <= 0.5) return; if (!stock.has(p)) stock.set(p, new Map()); const m = stock.get(p)!; const r = m.get(k) || { kg: 0, cost: 0, fc: 0 }; r.kg += kg; r.cost += kg * (irak ? CALC.landedIrakOf(ci) : CALC.landedOf(ci)); r.fc += kg * ci.finalCost; m.set(k, r); };
    for (const ci of M.R.item.values()) {
      const l = ci.lot; if (!fil(l.firmId) || l.status === "kapandi") continue; const p = M.prodName(ci.it), md = ci.it.model || "—";
      if (ci.konsKg > 0.5) put(p, `${md} · konsinyede`, ci.konsKg, ci);
      if (l.status !== "depoda") continue;
      const here = Math.max(0, CALC.hereLeft(ci)), ir = Math.max(0, CALC.irakLeft(ci));
      if (l.ortak?.on) { put(p, `${md} · ortakta (${M.pname(l.ortak.partnerId)})`, here + ir, ci); continue; }
      if (l.dest === "irak") put(p, `${md} · Irak deposu`, here, ci); else { put(p, `${md} · Mersin SB`, here, ci); put(p, `${md} · Irak deposu`, ir, ci, true); }
    }
    h += `<h2 style="${css.h2}">Stok (bizde, ortakta, konsinyede)</h2>`;
    h += stock.size ? [...stock].map(([p, m]) => `<div style="font-weight:bold;margin:10px 0 2px">${esc(p)}</div>${tbl(["Model · yer", "Kalan", "Maliyet", "Son maliyet"], [...m].map(([k, r]) => [esc(k), fmt0.format(Math.round(r.kg)) + " kg", "$" + fmt2.format(r.cost / r.kg) + "/kg", "$" + fmt2.format(r.fc / r.kg) + "/kg"]), [1, 2, 3])}`).join("") : `<p style="${css.muted}">Stok yok.</p>`;
    // borç / alacak (uygulamadaki Cari ile aynı)
    const PB = CALC.partyBalances(M.D, M.R, F);
    const supRows = PB.sup.filter((r: any) => r.a - r.p > 1);
    const oldest = (name: string) => sales.filter((s: any) => !M.saleC.get(s.id).olot && M.saleC.get(s.id).due > 1 && M.pname(s.customerId, s.customer) === name).map((s: any) => s.date).sort()[0] || "";
    const cusRows = PB.cus.filter((r: any) => r.a - r.p > 1);
    h += `<h2 style="${css.h2}">Tedarikçilere kalan borç</h2>` + (supRows.length ? tbl(["Tedarikçi", "Kalan"], supRows.map((r: any) => [esc(r.name), usdf(r.a - r.p)]), [1]) : `<p style="${css.muted}">Borç yok.</p>`);
    h += `<h2 style="${css.h2}">Müşteri ve ortak alacakları</h2>` + (cusRows.length ? tbl(["Müşteri / ortak", "Kalan", "En eski açık satış"], cusRows.map((r: any) => { const o = oldest(r.name), g = age(o); return [esc(r.name), usdf(r.a - r.p), o ? `${fd(o)}${g > 30 ? ` · <b style="color:#A8530F">${g} gün</b>` : ""}` : "—"]; }), [1]) : `<p style="${css.muted}">Açık alacak yok.</p>`);
    return h; };
  const hasElden = [M.lots, M.sales, M.pays, M.exps].some((a) => a.some((x: any) => x.firmId === "x"));
  let h = `<div style="${css.wrap}"><div style="padding:22px 20px">
  <div style="font-size:12px;color:#4A7426;font-weight:bold;letter-spacing:.1em">ÜRÜN DEFTERİ</div>
  <h1 style="${css.h1}">Haftalık özet</h1><div style="${css.muted}">${fd(t)} · ${esc(["a", "b"].map((k) => M.firm(k)).join(" · "))}</div>`;
  h += section((f) => f !== "x");
  if (hasElden) h += `<div style="margin-top:30px;padding-top:6px;border-top:3px solid #8B6F47"><h1 style="${css.h1}">Elden (firmasız)</h1><div style="${css.muted}">Faturasız, firmalara girmeyen alım-satımlar</div></div>` + section((f) => f === "x");
  h += `<div style="margin:28px 0 6px"><a href="${SITE}" style="background:#4A7426;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;display:inline-block">Defteri aç</a></div>
  <p style="${css.muted}">Tutarlar dolar karşılığıdır. Son maliyet: alış + tüm masraflar − kur farkı, fire düşülmüş kg başına. Bu e-posta her pazartesi Ürün Defteri'ne kayıtlı herkese gönderilir.</p></div></div>`;
  return h;
}
function backupHtml(M: ReturnType<typeof model>, n: number) {
  return `<div style="${css.wrap}"><div style="padding:22px 20px"><div style="font-size:12px;color:#4A7426;font-weight:bold;letter-spacing:.1em">ÜRÜN DEFTERİ</div>
  <h1 style="${css.h1}">Haftalık yedek</h1><p>${fd(todayTR())} itibarıyla bütün kayıtlar ektedir.</p>
  ${tbl(["", "Adet"], [["Alım", String(M.lots.length)], ["Satış", String(M.sales.length)], ["Ödeme / tahsilat", String(M.pays.length)], ["Masraf", String(M.exps.length)], ["Firma / kişi", String(Object.keys(M.parties).length)], ["Toplam kayıt", String(n)]], [1])}
  <p style="${css.muted};margin-top:16px">Excel dosyası okumak içindir. JSON dosyası tam yedektir; gerektiğinde defter bu dosyadan geri yüklenebilir. Fatura ve dekont görselleri yedeğe dahil değildir, Supabase depolamasında durur. Bu e-posta sadece yedek adresine gönderilir.</p></div></div>`;
}
function buildXlsx(XLSX: any, M: ReturnType<typeof model>) {
  const wb = XLSX.utils.book_new();
  const add = (rows: any[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Kayıt yok" }]), name);
  // uygulamadaki "Excel'e aktar" ile aynı sayfalar (CALC.sheets)
  const STG: Record<string, string> = { ...ST, depoda: "Depoda" };
  const SH = CALC.sheets(M.D, M.R, { firm: M.firm, party: M.pname, prod: M.prodName, stage: (l: any) => l.status === "depoda" ? (l.dest === "irak" ? "Irak deposunda" : "Mersin SB'de") : STG[l.status] || l.status });
  for (const k of ["Alımlar", "Satışlar", "Satış tahsilatları", "Ödemeler", "Masraflar", "Kapamalar", "Elden işler", "Fire, iade, kayıp", "Irak sevkleri", "Kâr hareketleri"]) add(SH[k], k);
  const acc = (k: string) => { const [b, c] = String(k).split("|"); return `${b.replace(/^b:/, "")}${b.startsWith("b:") ? " (" + M.firm("b") + ")" : ""} · ${c || "USD"}`; };
  add(M.trf.slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))).map((t: any) => ({ "Tarih": t.date, "Çıkan hesap": acc(t.from), "Çıkan tutar": +t.out || 0, "Giren hesap": acc(t.to), "Giren tutar": +t.in || 0, "Not": t.note || "" })), "Transferler");
  for (const k of ["Cari tedarikçi", "Cari müşteri", "Rehber"]) add(SH[k], k);
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

/* ---------- e-posta ---------- */
type Att = { filename: string; content: Uint8Array; contentType: string };
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function sendMail({ to, subject, html, attachments = [] }: { to: string; subject: string; html: string; attachments?: Att[] }) {
  html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#EEF2EF">${html}</body></html>`;
  const resend = Deno.env.get("RESEND_API_KEY");
  if (resend) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Ürün Defteri <${MAIL_FROM}>`, to: [to], subject, html, attachments: attachments.map((a) => ({ filename: a.filename, content: b64(a.content) })) }) });
    if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
    return;
  }
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!pass) throw new HttpError(503, "E-posta ayarı yapılmamış (GMAIL_APP_PASSWORD).");
  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: MAIL_FROM, password: pass.replace(/\s+/g, "") } } });
  try {
    await client.send({ from: `Ürün Defteri <${MAIL_FROM}>`, to, subject, html, content: "Bu e-postayı HTML destekleyen bir uygulamayla aç.",
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, encoding: "binary" as const, contentType: a.contentType })) });
  } finally { await client.close(); }
}

/* ---------- 4) belgeyi oku (Claude) ---------- */
const OKU_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["doc_type", "date", "invoice_no", "currency", "seller", "buyer", "items", "total_amount", "incoterm", "shipping", "payment", "expense_category", "warnings"],
  properties: {
    doc_type: { type: "string", enum: ["alis_faturasi", "proforma", "satis_faturasi", "dekont", "masraf_faturasi", "konsimento", "packing_list", "diger"] },
    date: { type: "string", description: "YYYY-MM-DD, yoksa boş" },
    invoice_no: { type: "string" },
    currency: { type: "string", enum: ["USD", "TL", "EUR", "DIGER", ""] },
    seller: { type: "object", additionalProperties: false, required: ["name", "country", "city", "address", "phone", "email", "web", "person", "tax_no", "bank"],
      properties: { name: { type: "string" }, country: { type: "string" }, city: { type: "string" }, address: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, web: { type: "string" }, person: { type: "string" }, tax_no: { type: "string" }, bank: { type: "string" } } },
    buyer: { type: "object", additionalProperties: false, required: ["name", "country"], properties: { name: { type: "string" }, country: { type: "string" } } },
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["product", "model", "description", "quantity_kg", "unit_price_per_kg", "amount"],
      properties: { product: { type: "string" }, model: { type: "string" }, description: { type: "string" }, quantity_kg: { type: "number" }, unit_price_per_kg: { type: "number" }, amount: { type: "number" } } } },
    total_amount: { type: "number" },
    incoterm: { type: "string" },
    shipping: { type: "object", additionalProperties: false, required: ["carrier", "vessel", "container_nos", "bl_no", "booking_no", "port_of_loading", "eta"],
      properties: { carrier: { type: "string" }, vessel: { type: "string" }, container_nos: { type: "array", items: { type: "string" } }, bl_no: { type: "string" }, booking_no: { type: "string" }, port_of_loading: { type: "string" }, eta: { type: "string" } } },
    payment: { type: "object", additionalProperties: false, required: ["direction", "amount", "date", "bank", "sender", "receiver", "reference"],
      properties: { direction: { type: "string", enum: ["out", "in", ""] }, amount: { type: "number" }, date: { type: "string" }, bank: { type: "string" }, sender: { type: "string" }, receiver: { type: "string" }, reference: { type: "string" } } },
    expense_category: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
};
async function doOku(req: Request) {
  const me = await caller(req);
  if (!me || me.role === "viewer") throw new HttpError(401, "Giriş yapmış ve kayıt girebilen bir kullanıcı olmalısın.");
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new HttpError(503, "Fatura okuma henüz açılmadı (ANTHROPIC_API_KEY eklenmemiş).");
  const body = await req.json();
  const { kind, file, context } = body || {};
  if (!file?.data || !file?.mediaType) throw new HttpError(400, "Dosya yok.");
  if (file.data.length > 14_000_000) throw new HttpError(413, "Dosya çok büyük.");
  const isPdf = file.mediaType === "application/pdf";
  if (!isPdf && !/^image\/(jpeg|png|webp|gif)$/.test(file.mediaType)) throw new HttpError(415, "Desteklenmeyen dosya türü.");
  const ctx = context || {};
  const system = `Sen Mersin Serbest Bölge'de çalışan bir kuruyemiş ithalat/ihracat firmasının ön muhasebe asistanısın. Sana bir ticari belgenin görüntüsü (fatura, proforma, banka dekontu, masraf faturası, konşimento vb.) verilir; görevin belgedeki bilgileri şemaya eksiksiz ve doğru aktarmak.
Bizim firmalarımız: ${(ctx.firms || []).join(", ") || "Asya Çerez, Gökhan Altın"}. Bu firmalar belgede alıcıysa belge alış belgesidir; satıcıysa satış belgesidir.
Kurallar:
- Sadece belgede gerçekten yazanı aktar; tahmin etme. Bulamadığın metin alanlarını boş string, sayıları 0 bırak.
- Tarihleri YYYY-MM-DD biçimine çevir (gün/ay sırasına dikkat: Türk ve Avrupa belgelerinde gün önce gelir).
- Miktarları kilograma çevir (MT/ton ×1000, LBS ×0,4536). Birim fiyatı da kg başına çevir (ton fiyatı ÷1000).
- Ürün adını bu katalogdaki Türkçe ürün adıyla eşleştir: ${(ctx.products || []).join(", ") || "Kaju, Badem, Ceviz, Yer fıstığı, Kahve, Çekirdek, Fındık"} (cashew=Kaju, almond=Badem, walnut=Ceviz, peanut/groundnut=Yer fıstığı, coffee=Kahve, sunflower/pumpkin seed=Çekirdek, hazelnut=Fındık). Eşleşmezse belgedeki adı yaz.
- Modeli (kalibre/sınıf: W320, Nonpareil 23/25, LHP, Santos NY vb.) model alanına yaz. Bilinen modeller: ${JSON.stringify(ctx.models || {})}.
- Ülke adlarını Türkçe yaz (Vietnam, ABD, Hindistan, İran, Irak, Türkiye...).
- Para birimi: USD, TL (TRY), EUR veya DIGER.
- Dekontta: bizim firmamız ödeyen ise direction "out", parayı alan ise "in". Banka adını Türkçe kısa adıyla yaz (ör. Garanti BBVA, İş Bankası, Ziraat Bankası).
- Masraf belgesinde expense_category alanına şu listeden en uygununu yaz: ${(ctx.expcats || []).join(", ")}.
- Konteyner numaralarını boşluksuz büyük harfle yaz (ör. MSCU1234567).
- Okunamayan, şüpheli ya da kontrol edilmesi gereken her şeyi warnings listesine kısa Türkçe cümlelerle yaz (ör. "Toplam tutar satırların toplamıyla tutmuyor").`;
  const client = new Anthropic({ apiKey: key });
  const resp: any = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: OKU_SCHEMA } },
    system,
    messages: [{ role: "user", content: [
      isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
            : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } },
      { type: "text", text: `Belge türü beklentisi: ${({ lot: "alış faturası / proforma", sale: "satış faturası", pay: "banka dekontu", exp: "masraf faturası / makbuz" } as Record<string, string>)[kind] || "ticari belge"}. Belgedeki bilgileri şemaya aktar.` },
    ] }],
  } as any);
  if (resp.stop_reason === "refusal") throw new HttpError(422, "Belge okunamadı.");
  const text = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(502, "Belge okunurken beklenmeyen bir yanıt geldi, tekrar dene."); }
  return { ok: true, data, model: resp.model };
}

/* ---------- 4b) tek cümleden kayıt (Claude) ---------- */
const CUMLE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "firm", "date", "currency", "party", "market", "items", "amount", "bank", "pay_kind", "expense_category", "link_ref", "due_date", "doc_no", "plate", "note", "warnings"],
  properties: {
    kind: { type: "string", enum: ["sale", "pay_out", "pay_in", "exp", "belirsiz"] },
    firm: { type: "string", enum: ["a", "b", "x", ""] },
    date: { type: "string", description: "YYYY-MM-DD; söylenmediyse bugün" },
    currency: { type: "string", enum: ["USD", "TL", "EUR", ""] },
    party: { type: "string", description: "satışta/tahsilatta müşteri, ödemede tedarikçi, masrafta parayı alan kişi/firma" },
    market: { type: "string", enum: ["irak", "ic", "diger", ""] },
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["product", "model", "quantity_kg", "unit_price_per_kg"],
      properties: { product: { type: "string" }, model: { type: "string" }, quantity_kg: { type: "number" }, unit_price_per_kg: { type: "number" } } } },
    amount: { type: "number", description: "ödeme/tahsilat/masraf tutarı; satışta söylenen toplam (yoksa 0)" },
    bank: { type: "string" },
    pay_kind: { type: "string" },
    expense_category: { type: "string" },
    link_ref: { type: "string", description: "verilen listedeki ref (s:… ya da l:…) ya da boş" },
    due_date: { type: "string", description: "vade tarihi YYYY-MM-DD ya da boş" },
    doc_no: { type: "string" },
    plate: { type: "string" },
    note: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
};
async function doCumle(req: Request) {
  const me = await caller(req);
  if (!me || me.role === "viewer") throw new HttpError(401, "Giriş yapmış ve kayıt girebilen bir kullanıcı olmalısın.");
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new HttpError(503, "Yapay zekâ henüz açılmadı (ANTHROPIC_API_KEY eklenmemiş).");
  const { text, context } = await req.json().catch(() => ({}));
  const t = String(text || "").trim().slice(0, 1500);
  if (t.length < 4) throw new HttpError(400, "Bir cümle yaz.");
  return await cumleCore(t, context || {}, key);
}
async function cumleCore(t: string, ctx: any, key: string) {
  const L = (a: unknown, n = 80) => (Array.isArray(a) ? a.slice(0, n).map((x) => String(x).slice(0, 160)).join("\n") : "");
  const system = `Sen Mersin Serbest Bölge'de kuruyemiş ticareti yapan bir firmanın ön muhasebe asistanısın. Kullanıcı (patron ya da personel) yaptığı bir işi tek cümleyle, günlük Türkçeyle yazar; sen bunu şemaya aktarırsın. Kullanıcı formu görüp kontrol ettikten sonra kaydeder.
Bugün: ${todayTR()} (Türkiye saati). "dün", "geçen salı", "30 gün vadeli" gibi göreli ifadeleri bu tarihe göre hesapla.
Kayıt türü (kind):
- sale: biz mal sattık ("sattım", "verdim", "yükledik gönderdik").
- pay_out: tedarikçiye para gönderdik ("ödedim", "gönderdim", "havale yaptım", "ön ödeme").
- pay_in: müşteriden ya da ortaktan para geldi ("tahsil ettim", "para geldi", "yatırdı").
- exp: masraf ödedik (gümrük, TIR navlunu, gümrükçü, nakliye, ilaçlama, liman vb.).
- belirsiz: hangisi olduğu anlaşılmıyorsa; warnings'e nedenini yaz.
Firmalarımız: a = ${ctx.firms?.[0] || "Asya Çerez"}, b = ${ctx.firms?.[1] || "Gökhan Altın"}. x = Elden (firmasız): faturasız, hiçbir firmaya girmeyen elden alım-satım; cümlede "elden", "faturasız", "firmasız", "kayıtsız" geçiyorsa firm = x. Cümlede firma geçmiyorsa firm boş bırak ve bunun için uyarı YAZMA (firma bağlı alımdan/satıştan bulunur).
Ürünler (Türkçe katalog adıyla yaz): ${(ctx.products || []).join(", ")}. Modeller: ${JSON.stringify(ctx.models || {})}. "W320", "23/25" gibi kalibreler model alanına.
Miktar: ton ×1000 kg; "6 ton" = 6000. Fiyat her zaman kg başına: "tonu 8600 dolar" → 8.6; "kilosu 8,6" → 8.6. Türkçe sayılarda nokta binlik, virgül ondalıktır ("410.800" = 410800, "8,6" = 8.6). "bin", "milyon" kelimelerini sayıya çevir.
Para birimi: dolar/$ → USD, TL/lira/₺ → TL, euro → EUR. Söylenmediyse boş.
Pazar (satışta): Irak'taki müşteri → irak, Türkiye içi → ic, başka ülke → diger. Müşterinin bilinen pazarı yoksa şehir/ülkeye bak (Bağdat, Erbil, Basra, Musul, Süleymaniye, Duhok, Zaho = Irak).
party alanına kişiyi/firmayı bu listelerdeki yazımıyla yaz (en yakın eşleşme); listede yoksa cümledeki adı yaz.
Müşteriler: ${(ctx.customers || []).join(", ")}
Tedarikçiler: ${(ctx.suppliers || []).join(", ")}
Bankalar (bank alanı için bu yazımla): ${(ctx.banks || []).join(", ")}
Masraf türleri (expense_category bu listeden): ${(ctx.expcats || []).join(", ")}
Ödeme türü (pay_kind): tedarikçiye ödemede "Ön ödeme", "Ara ödeme" ya da "Bakiye"; tahsilatta "Tahsilat" ya da ortaktan geliyorsa "Ortak hesap havalesi". Söylenmediyse boş.
link_ref: ödeme/tahsilat/masraf hangi satışa ya da alıma aitse aşağıdaki listeden ref'ini yaz (ör. "s:abc", "l:xyz"). Sadece cümleden açıkça anlaşılıyorsa yaz (müşteri/tedarikçi + ürün + tarih uyuyorsa); emin değilsen boş bırak.
Açık satışlar:
${L(ctx.sales)}
Alımlar:
${L(ctx.lots)}
Plaka, fatura/belge no, vade gibi bilgileri ilgili alanlara yaz; note'a sadece hiçbir alana sığmayan önemli ayrıntıyı yaz (alanlara yazdığını tekrar etme, yoksa boş bırak). Tarih söylenmediyse bugünü yaz ve uyarı yapma.
Sadece cümlede olanı aktar, uydurma. Eksik ya da belirsiz olan her şeyi warnings'e kısa Türkçe cümleyle yaz (ör. "Fiyat söylenmedi", "Hangi bankadan gönderildiği yazılmadı" gibi — ama banka yazılmadıysa bunu uyarı yapma, isteğe bağlı).`;
  const client = new Anthropic({ apiKey: key });
  const resp: any = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: CUMLE_SCHEMA } },
    system,
    messages: [{ role: "user", content: t }],
  } as any);
  if (resp.stop_reason === "refusal") throw new HttpError(422, "Cümle anlaşılamadı.");
  const out = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let data;
  try { data = JSON.parse(out); } catch { throw new HttpError(502, "Beklenmeyen bir yanıt geldi, tekrar dene."); }
  return { ok: true, data, model: resp.model };
}

/* ---------- 5) telefona bildirim (Web Push, RFC 8291 + VAPID RFC 8292, harici kütüphanesiz) ---------- */
const b64u = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const enc = (s: string) => new TextEncoder().encode(s);
let VAPID: { pub: string; priv: CryptoKey } | null = null;
async function vapid() {
  if (VAPID) return VAPID;
  const { data } = await admin.from("app_keys").select("data").eq("id", "vapid").maybeSingle();
  let jwk = data?.data as JsonWebKey | undefined;
  if (!jwk) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    jwk = await crypto.subtle.exportKey("jwk", kp.privateKey) as JsonWebKey;
    const { error } = await admin.from("app_keys").insert({ id: "vapid", data: jwk });
    if (error) { const r = await admin.from("app_keys").select("data").eq("id", "vapid").single(); jwk = r.data!.data as JsonWebKey; }
  }
  const priv = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const pub = b64u(cat(new Uint8Array([4]), unb64u(jwk.x!), unb64u(jwk.y!)));
  VAPID = { pub, priv };
  return VAPID;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, k, len * 8));
}
async function encryptPush(sub: { keys: { p256dh: string; auth: string } }, payload: Uint8Array) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function vapidAuth(endpoint: string) {
  const v = await vapid();
  const aud = new URL(endpoint).origin;
  const head = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${MAIL_FROM}` })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.priv, enc(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
async function sendPush(sub: any, msg: { title: string; body: string; url?: string; tag?: string }) {
  const bodyBytes = await encryptPush(sub, enc(JSON.stringify(msg)));
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: await vapidAuth(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" }, body: bodyBytes });
  return r.status;
}
// Abonelikler push_subs tablosunda (istemci politikası yok — sadece bu fonksiyon okur/yazar)
async function subscriptions() {
  const { data } = await admin.from("push_subs").select("id,email,data");
  return (data || []).map((r) => ({ id: r.id, email: r.email, ...(r.data as any) }));
}
const subKey = async (ep: string) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc(ep)))).slice(0, 22);
async function doPushKayit(req: Request) {
  const me = await caller(req);
  if (!me) throw new HttpError(401, "Giriş yapmalısın.");
  const b = await req.json().catch(() => ({}));
  const ep = String(b.endpoint || b.sub?.endpoint || "");
  if (!/^https:\/\//.test(ep)) throw new HttpError(400, "geçersiz abonelik");
  const id = await subKey(ep);
  const { data: cur } = await admin.from("push_subs").select("email,data").eq("id", id).maybeSingle();
  const mine = cur && cur.email === me.email ? (cur.data as any) : null;
  if (b.op === "sil") { if (mine) await admin.from("push_subs").delete().eq("id", id); return { ok: true }; }
  if (b.op === "durum") return { ok: true, on: !!mine, prefs: mine?.prefs || null };
  const prefs = { eta: true, due: true, yeni: true, ...(mine?.prefs || {}), ...(b.prefs || {}) };
  const sub = b.sub?.keys?.p256dh && b.sub?.keys?.auth ? { endpoint: ep, keys: { p256dh: String(b.sub.keys.p256dh), auth: String(b.sub.keys.auth) } } : mine?.sub;
  if (!sub) throw new HttpError(400, "abonelik anahtarı yok");
  const { error } = await admin.from("push_subs").upsert({ id, email: me.email, data: { sub, prefs, device: String(b.device || mine?.device || "").slice(0, 40), at: new Date().toISOString() } });
  if (error) throw error;
  return { ok: true, on: true, prefs };
}
async function pushTo(filter: (s: any) => boolean, msg: { title: string; body: string; url?: string; tag?: string }) {
  const subs = (await subscriptions()).filter(filter);
  let ok = 0;
  for (const s of subs) {
    try {
      const st = await sendPush(s.sub, msg);
      if (st === 404 || st === 410) await admin.from("push_subs").delete().eq("id", s.id);
      else if (st >= 200 && st < 300) ok++;
      else console.error("push", st, s.sub?.endpoint?.slice(0, 40));
    } catch (e) { console.error("push hata", e); }
  }
  return { cihaz: subs.length, gonderilen: ok };
}
async function doPushTest(req: Request) {
  const me = await caller(req);
  if (!me) throw new HttpError(401, "Giriş yapmalısın.");
  return await pushTo((s) => s.email === me.email, { title: "Ürün Defteri", body: "Bildirimler bu cihazda çalışıyor.", url: "./", tag: "test" });
}
const wantPref = (s: any, k: string) => s?.prefs?.[k] !== false;
async function doBildirim() {
  const log = (await getDoc("settings", "pushlog")) || {};
  const t = todayTR();
  if (log.__last === t) return { ok: true, atlandi: "bugün gönderildi" };
  const M = model(await allDocs());
  const alerts: { k: string; pref: string; title: string; body: string; url: string }[] = [];
  const lotLabel = (l: any) => `${l.code} ${[...new Set(l.items.map((it: any) => M.prodName(it)))].join(", ")}`;
  for (const l of M.lots) {
    if ((l.status === "yuklendi" || l.status === "yolda") && l.eta) {
      const d = daysTo(l.eta);
      const tir = l.transport === "tir", w = tir ? "TIR" : "Konteyner", via = tir ? [l.trucker, ...(l.plates || [])].filter(Boolean).join(" · ") : l.carrier;
      const yer = l.dest === "irak" ? "Irak deposunda" : "Mersin'de";
      if (d === 3 || d === 1 || d === 0) alerts.push({ k: `eta:${l.id}:${d}`, pref: "eta", title: d === 0 ? `${w} bugün ${yer}` : `${w} ${d === 1 ? "yarın" : "3 gün sonra"} ${yer}`, body: `${lotLabel(l)}${via ? " · " + via : ""}`, url: `./#lot=${l.id}` });
      else if (d < 0 && (-d) % 3 === 1) alerts.push({ k: `eta:${l.id}:${d}`, pref: "eta", title: `Varış ${-d} gün gecikti`, body: `${lotLabel(l)} · ${tir ? "nakliyeciden" : "gemi firmasından"} kontrol et`, url: `./#lot=${l.id}` });
    }
    const c = M.lotC.get(l.id);
    if (l.payDue && c && c.due > 1) {
      const d = daysTo(l.payDue);
      if (d === 3 || d === 0) alerts.push({ k: `lotdue:${l.id}:${d}`, pref: "due", title: d === 0 ? "Tedarikçi ödemesinin vadesi bugün" : "Tedarikçi ödemesine 3 gün kaldı", body: `${M.pname(l.supplierId, l.supplier)} · ${l.code} · kalan ${usdf(c.due)}`, url: `./#lot=${l.id}` });
      else if (d < 0 && (-d) % 3 === 1) alerts.push({ k: `lotdue:${l.id}:${d}`, pref: "due", title: `Tedarikçi ödemesi ${-d} gün gecikti`, body: `${M.pname(l.supplierId, l.supplier)} · ${l.code} · kalan ${usdf(c.due)}`, url: `./#lot=${l.id}` });
    }
  }
  for (const s of M.sales) {
    const c = M.saleC.get(s.id);
    if (!s.dueDate || !c || c.olot || c.due <= 1) continue;
    const d = daysTo(s.dueDate), who = M.pname(s.customerId, s.customer);
    if (d === 3 || d === 0) alerts.push({ k: `saledue:${s.id}:${d}`, pref: "due", title: d === 0 ? "Bugün tahsilat vadesi" : "Tahsilat vadesine 3 gün kaldı", body: `${who} · ${usdf(c.due)}`, url: `./#sale=${s.id}` });
    else if (d < 0 && (-d) % 3 === 1) alerts.push({ k: `saledue:${s.id}:${d}`, pref: "due", title: `Tahsilat ${-d} gün gecikti`, body: `${who} · ${usdf(c.due)} ödenmedi`, url: `./#sale=${s.id}` });
  }
  // Irak işleri: resmi havalesi gelmeyen kapama (7 günde bir), uzun süredir konsinyede bekleyen mal (30. günden sonra 15 günde bir)
  for (const k of M.kaps) { const kc = CALC.kapCalc(k); if (!kc.wait) continue; const g = -daysTo(k.date); if (g < 7 || g % 7) continue;
    const s = M.sales.find((x: any) => x.id === k.saleId), l = M.lots.find((x: any) => x.id === k.lotId);
    alerts.push({ k: `kapwait:${k.id}:${g}`, pref: "irak", title: `Kapamanın resmi havalesi ${g} gündür bekleniyor`, body: `${s ? M.pname(s.customerId, s.customer) : l ? l.code : ""} · ${usdf(kc.out)} elden${kc.part ? ` · ${usdf(kc.inn)} geldi` : ""}`, url: s ? `./#sale=${s.id}` : l ? `./#lot=${l.id}` : "./" }); }
  for (const s of M.sales) { if (!s.realLater) continue; const c = M.saleC.get(s.id); if (!c || c.pendKg <= 0.5) continue; const g = -daysTo(s.date); if (g < 30 || g % 15) continue;
    alerts.push({ k: `konswait:${s.id}:${g}`, pref: "irak", title: `Konsinye mal ${g} gündür müşteride`, body: `${M.pname(s.customerId, s.customer)} · ${fmt0.format(Math.round(c.pendKg))} kg satılmayı bekliyor`, url: `./#sale=${s.id}` }); }
  const fresh = alerts.filter((a) => !log[a.k]);
  const out: any[] = [];
  for (const a of fresh) { out.push({ k: a.k, ...(await pushTo((s) => wantPref(s, a.pref), { title: a.title, body: a.body, url: a.url, tag: a.k })) }); log[a.k] = t; }
  const keep: Record<string, string> = { __last: t };
  for (const [k, v] of Object.entries(log)) if (k !== "__last" && typeof v === "string" && daysTo(v) > -30) keep[k] = v;
  await putDoc("settings", "pushlog", keep);
  return { ok: true, uyari: fresh.length, sonuc: out };
}
const KIND_TR: Record<string, string> = { lots: "yeni alım", sales: "yeni satış", pays: "yeni ödeme", exps: "yeni masraf" };
async function doYeni(req: Request) {
  const { col, id } = await req.json().catch(() => ({}));
  if (!KIND_TR[col] || !id) throw new HttpError(400, "geçersiz");
  const d = await getDoc(col, id);
  if (!d || d.ornek || !d.createdAt || Date.now() - Date.parse(d.createdAt) > 10 * 60e3) return { ok: true, atlandi: true };
  const log = (await getDoc("settings", "pushnew")) || {};
  if (log[col + ":" + id]) return { ok: true, atlandi: "gönderildi" };
  const rows = await allDocs(); const M = model(rows);
  const { data: members } = await admin.from("members").select("email,name");
  const by = (members || []).find((m) => m.email.toLowerCase() === String(d.createdBy || "").toLowerCase());
  const who = by?.name || String(d.createdBy || "Biri").split("@")[0];
  let body = "", url = "./";
  if (col === "lots") { const l = M.lots.find((x: any) => x.id === id); body = `${l?.code || ""} · ${M.pname(d.supplierId, d.supplier)} · ${(l?.items || []).map((it: any) => `${M.prodName(it)}${it.model ? " " + it.model : ""} ${fmt0.format(+it.kg || 0)} kg`).join(", ")}`; url = `./#lot=${id}`; }
  if (col === "sales") { const c = M.saleC.get(id); body = `${M.pname(d.customerId, d.customer)} · ${MK[d.market] || ""}${c ? " · " + usdf(c.totUSD) : ""}`; url = `./#sale=${id}`; }
  if (col === "pays") { body = `${d.dir === "out" ? "Ödeme" : "Tahsilat"} · ${M.pname(d.partyId, d.party)} · ${d.cur === "TL" ? fmt0.format(+d.amount || 0) + " ₺" : usdf(+d.amount || 0)}${d.bank ? " · " + d.bank : ""}`; url = `./#pay=${id}`; }
  if (col === "exps") { body = `${d.cat || "Masraf"} · ${d.cur === "TL" ? fmt0.format(+d.amount || 0) + " ₺" : usdf(+d.amount || 0)}`; url = `./#exp=${id}`; }
  const r = await pushTo((s) => wantPref(s, "yeni") && s.email !== String(d.createdBy || "").toLowerCase(), { title: `${who} ${KIND_TR[col]} girdi`, body, url, tag: col + ":" + id });
  log[col + ":" + id] = todayTR();
  const keep: Record<string, string> = {}; for (const [k, v] of Object.entries(log)) if (typeof v === "string" && daysTo(v) > -7) keep[k] = v;
  await putDoc("settings", "pushnew", keep);
  return { ok: true, ...r };
}

/* Irak işleri bildirimi: kayıt sahibi uygulamadan çağırır, metni sunucu kayıttan kurar (istemci metnine güvenilmez) */
async function doOlay(req: Request) {
  const me = await caller(req);
  if (!me) throw new HttpError(401, "Giriş yapmalısın.");
  const { type, id } = await req.json().catch(() => ({}));
  const col = type === "kap" ? "kap" : type === "sevk" ? "lots" : type === "real" || type === "ret" ? "sales" : "";
  if (!col || !id) throw new HttpError(400, "geçersiz");
  const d = await getDoc(col, id);
  if (!d || d.ornek) return { ok: true, atlandi: true };
  const M = model(await allDocs());
  const lbl = (ci: any) => ci ? `${M.prodName(ci.it)}${ci.it.model ? " " + ci.it.model : ""}` : "?";
  let n = 0, title = "", body = "", url = "./";
  if (type === "kap") {
    const kc = CALC.kapCalc(d); n = (d.ins || []).length + (d.done === false ? 0 : 100);
    const s = M.sales.find((x: any) => x.id === d.saleId), l = M.lots.find((x: any) => x.id === d.lotId);
    const who = s ? M.pname(s.customerId, s.customer) : l ? `${l.code} · ${M.pname(l.ortak?.partnerId)}` : "";
    if (!(d.ins || []).length) { title = "Kapama: elden nakit gönderildi"; body = `${who} · ${usdf(kc.out)}`; }
    else if (kc.wait) { title = "Kapama: resmi havalenin bir kısmı geldi"; body = `${who} · ${usdf(kc.inn)} geldi · ${usdf(kc.out)} elden gönderilmişti`; }
    else { title = "Kapama tamamlandı"; body = `${who} · ${usdf(kc.out)} elden → ${usdf(kc.inn)} resmi · kur farkı kârı ${usdf(kc.kur)}${Math.abs(kc.left) > 0.5 ? ` · ${kc.left > 0 ? "onda kalan" : "cebinden koyduğu"} ${usdf(Math.abs(kc.left))}` : ""}`; }
    url = s ? `./#sale=${s.id}` : l ? `./#lot=${l.id}` : "./";
  } else if (type === "real" || type === "ret") {
    const c = M.saleC.get(id); const list = type === "real" ? d.real || [] : d.ret || []; const r = list[list.length - 1]; n = list.length; if (!r || !c) return { ok: true, atlandi: true };
    const cust = M.pname(d.customerId, d.customer);
    if (type === "real") { title = "Konsinye satıldı"; body = `${cust} · ${(r.lines || []).map((z: any) => `${lbl(c.lines[z.i]?.ci)} ${fmt0.format(+z.kg || 0)} kg × ${d.cur === "TL" ? fmt2.format(+z.price || 0) + " ₺" : "$" + fmt2.format(+z.price || 0)}`).join(", ")}${c.pendKg > 0.5 ? ` · ${fmt0.format(Math.round(c.pendKg))} kg bekliyor` : " · konsinye bitti"}`; }
    else { title = r.kind === "kayip" ? "Konsinyede kayıp yazıldı" : d.realLater ? "Konsinyeden mal geri geldi" : "Müşteri iadesi girildi"; body = `${cust} · ${lbl(c.lines[r.i]?.ci)} ${fmt0.format(+r.kg || 0)} kg`; }
    url = `./#sale=${id}`;
  } else {
    const l = M.lots.find((x: any) => x.id === id); const sv = (d.sevk || [])[(d.sevk || []).length - 1]; n = (d.sevk || []).length; if (!sv || !l) return { ok: true, atlandi: true };
    title = "Irak'a sevk edildi"; body = `${l.code} · ${(sv.lines || []).map((z: any) => `${lbl(M.R.item.get(l.id + "|" + z.ik))} ${fmt0.format(+z.kg || 0)} kg`).join(", ")}${sv.trucker ? " · " + sv.trucker : ""}${(sv.plates || []).length ? " · " + sv.plates.join(", ") : ""}`; url = `./#lot=${id}`;
  }
  const k = `${type}:${id}:${n}`;
  const log = (await getDoc("settings", "pushnew")) || {};
  if (log[k]) return { ok: true, atlandi: "gönderildi" };
  const who = me.name || me.email.split("@")[0];
  const r = await pushTo((s) => wantPref(s, "irak") && s.email !== me.email, { title: `${who}: ${title}`, body, url, tag: k });
  log[k] = todayTR();
  const keep: Record<string, string> = {}; for (const [kk, v] of Object.entries(log)) if (typeof v === "string" && daysTo(v) > -7) keep[kk] = v;
  await putDoc("settings", "pushnew", keep);
  return { ok: true, ...r };
}
