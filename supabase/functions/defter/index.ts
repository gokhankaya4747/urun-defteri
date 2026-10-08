// Ürün Defteri — sunucu fonksiyonu (Supabase Edge Function, Deno)
//   ?action=kur       TCMB USD/EUR kurlarını çeker, settings/kurlar belgesine yazar (pg_cron her iş günü)
//   ?action=haftalik  Haftalık özet (tüm kullanıcılara) + yedek (sahibe) e-postası (pg_cron pazartesi)
//   ?action=oku       Fatura / dekont / makbuz görselini Claude ile okuyup forma doldurulacak bilgiyi döndürür
//   ?action=cumle     "Ahmet'e 6 ton W320 sattım kilosu 8,6$" gibi tek cümleyi satış / ödeme / masraf formuna çevirir
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

/* ---------- hesaplar (uygulamadaki mantığın sunucu kopyası) ---------- */
const usd = (a: any, c: string, k: any) => (c === "TL" ? (+k > 0 ? (+a || 0) / +k : 0) : +a || 0);
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const fmt0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const usdf = (v: number) => (v < 0 ? "−" : "") + "$" + fmt0.format(Math.abs(Math.round(v)));
const MON = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const fd = (d?: string) => { if (!d) return "—"; const [y, m, dd] = d.slice(0, 10).split("-"); return `${+dd} ${MON[+m - 1]} ${y}`; };
const todayTR = () => iso(new Date(Date.now() + 3 * 3600e3));
const daysTo = (d: string) => Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(todayTR() + "T12:00:00Z")) / 864e5);
const ST: Record<string, string> = { siparis: "Sipariş", onodeme: "Ön ödeme", yuklendi: "Yüklendi", yolda: "Yolda", depoda: "Mersin SB", kapandi: "Kapandı" };
const MK: Record<string, string> = { irak: "Irak", ic: "İç piyasa", diger: "İhracat" };

function model(rows: { col: string; id: string; data: any }[]) {
  const by = (c: string) => rows.filter((r) => r.col === c).map((r) => ({ id: r.id, ...r.data }));
  const firms = Object.fromEntries(rows.filter((r) => r.col === "firms").map((r) => [r.id, r.data]));
  const products = Object.fromEntries(rows.filter((r) => r.col === "products").map((r) => [r.id, r.data]));
  const parties = Object.fromEntries(rows.filter((r) => r.col === "parties").map((r) => [r.id, r.data]));
  const lots = by("lots").map((l: any) => { if (!Array.isArray(l.items) || !l.items.length) l.items = [{ k: "i1", productId: "", product: l.product || "", model: "", kg: +l.kg || 0, price: +l.price || 0, ppk: +l.ppk || 0 }]; return l; });
  const sales = by("sales").map((s: any) => { if (!Array.isArray(s.items)) s.items = s.lotId ? [{ lotId: s.lotId, ik: "i1", kg: +s.kg || 0, ppk: +s.ppk || 0 }] : []; return s; });
  const pays = by("pays"), exps = by("exps");
  const pname = (id?: string, fb?: string) => (id && parties[id]?.name) || fb || "—";
  const prodName = (it: any) => (it.productId ? products[it.productId]?.name : it.product) || "—";
  const items = new Map<string, any>();
  for (const l of lots) for (const it of l.items) items.set(l.id + "|" + it.k, { lot: l, it, sold: 0, irakIn: 0, soldIrak: 0, cu: usd(+it.ppk || 0, l.cur, l.kur) });
  for (const l of lots) for (const sv of (l.sevk || [])) for (const ln of (sv.lines || [])) { const ci = items.get(l.id + "|" + ln.ik); if (ci) ci.irakIn += +ln.kg || 0; }
  const eSale = new Map<string, { us: number; p: number }>(), eLot = new Map<string, { us: number; p: number }>();
  for (const x of exps) { const m = x.saleId ? eSale : x.lotId ? eLot : null; if (!m) continue; const k = x.saleId || x.lotId; const b = m.get(k) || { us: 0, p: 0 }; b[x.paidBy === "ortak" ? "p" : "us"] += usd(x.amount, x.cur, x.kur); m.set(k, b); }
  const acc = new Map(lots.map((l: any) => [l.id, { soldKg: 0, soldCost: 0, rev: 0, expUs: 0, expP: 0, lastSale: "" }]));
  const saleC = new Map<string, any>();
  for (const s of sales) {
    let tot = 0, kg = 0, olot: any = null; const lines: any[] = [];
    for (const ln of s.items) { const amt = (+ln.kg || 0) * (+ln.ppk || 0); tot += amt; kg += +ln.kg || 0; const ci = items.get(ln.lotId + "|" + ln.ik); if (ci) { ci.sold += +ln.kg || 0; if (ln.loc === "irak") ci.soldIrak += +ln.kg || 0; if (ci.lot.ortak?.on) olot = ci.lot; } lines.push({ ln, ci, amtUSD: usd(amt, s.cur, s.kur) }); }
    const totUSD = usd(tot, s.cur, s.kur);
    const got = sum(pays.filter((p: any) => p.dir === "in" && p.saleId === s.id), (p: any) => usd(p.amount, p.cur, p.kur));
    const e = eSale.get(s.id) || { us: 0, p: 0 };
    saleC.set(s.id, { totUSD, got, due: totUSD - got, olot });
    for (const { ln, ci, amtUSD } of lines) { if (!ci) continue; const a: any = acc.get(ci.lot.id); const k = +ln.kg || 0, sh = kg ? k / kg : 0; a.soldKg += k; a.soldCost += k * ci.cu; a.rev += amtUSD; a.expUs += e.us * sh; a.expP += e.p * sh; if ((s.date || "") > a.lastSale) a.lastSale = s.date; }
  }
  const lotC = new Map<string, any>();
  for (const l of lots) {
    const costUSD = usd(sum(l.items, (it: any) => (+it.kg || 0) * (+it.ppk || 0)), l.cur, l.kur);
    const paid = sum(pays.filter((p: any) => p.dir === "out" && p.lotId === l.id), (p: any) => usd(p.amount, p.cur, p.kur));
    const a: any = acc.get(l.id), e = eLot.get(l.id) || { us: 0, p: 0 };
    const expUs = a.expUs + e.us, expP = a.expP + e.p, profit = a.rev - a.soldCost - expUs - expP;
    const r: any = { costUSD, paid, due: costUSD - paid, profit, lastSale: a.lastSale };
    if (l.ortak?.on) { const sh = (+l.ortak.share || 0) / 100; const og = sum(pays.filter((p: any) => p.dir === "in" && p.lotId === l.id), (p: any) => usd(p.amount, p.cur, p.kur)); const owe = a.rev - expP - (1 - sh) * profit; Object.assign(r, { owe, odue: owe - og }); }
    lotC.set(l.id, r);
  }
  return { firms, products, parties, lots, sales, pays, exps, items, saleC, lotC, pname, prodName };
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
  // gelecek / geciken konteynerler
  const coming = M.lots.filter((l: any) => (l.status === "yuklendi" || l.status === "yolda") && l.eta && daysTo(l.eta) <= 21).sort((a: any, b: any) => a.eta.localeCompare(b.eta));
  const noEta = M.lots.filter((l: any) => (l.status === "yuklendi" || l.status === "yolda") && !l.eta);
  // stok: ürün → model
  const stock = new Map<string, Map<string, { kg: number; cost: number }>>();
  for (const ci of M.items.values()) {
    if (ci.lot.status !== "depoda") continue; const left = (+ci.it.kg || 0) - ci.sold; if (left <= 0) continue;
    const irak = Math.max(0, ci.irakIn - ci.soldIrak), here = left - irak;
    const p = M.prodName(ci.it); if (!stock.has(p)) stock.set(p, new Map());
    const m = stock.get(p)!;
    for (const [k, kg] of [[ci.it.model || "—", here], [`${ci.it.model || "—"} · Irak deposu`, irak]] as [string, number][]) { if (kg <= 0) continue; const r = m.get(k) || { kg: 0, cost: 0 }; r.kg += kg; r.cost += kg * ci.cu; m.set(k, r); }
  }
  // borç / alacak
  const sup = new Map<string, { a: number; p: number }>(), cus = new Map<string, { a: number; p: number; oldest: string }>();
  for (const l of M.lots) { const c = M.lotC.get(l.id); const k = M.pname(l.supplierId, l.supplier); const r = sup.get(k) || { a: 0, p: 0 }; r.a += c.costUSD; sup.set(k, r); }
  for (const p of M.pays.filter((x: any) => x.dir === "out")) { const k = M.pname(p.partyId, p.party); const r = sup.get(k) || { a: 0, p: 0 }; r.p += usd(p.amount, p.cur, p.kur); sup.set(k, r); }
  for (const s of M.sales) { const c = M.saleC.get(s.id); if (c.olot) continue; const k = M.pname(s.customerId, s.customer); const r = cus.get(k) || { a: 0, p: 0, oldest: "" }; r.a += c.totUSD; if (c.due > 1 && (!r.oldest || s.date < r.oldest)) r.oldest = s.date; cus.set(k, r); }
  for (const p of M.pays.filter((x: any) => x.dir === "in" && !x.lotId)) { const k = M.pname(p.partyId, p.party); const r = cus.get(k) || { a: 0, p: 0, oldest: "" }; r.p += usd(p.amount, p.cur, p.kur); cus.set(k, r); }
  const supRows = [...sup].map(([n, r]) => [n, r.a - r.p] as [string, number]).filter(([, b]) => b > 1).sort((a, b) => b[1] - a[1]);
  const cusRows = [...cus].map(([n, r]) => [n, r.a - r.p, r.oldest] as [string, number, string]).filter(([, b]) => b > 1).sort((a, b) => b[1] - a[1]);
  const ortak = M.lots.filter((l: any) => l.ortak?.on && (M.lotC.get(l.id)?.odue || 0) > 1);
  // geçen hafta
  const wk = (arr: any[], f: string) => arr.filter((x) => (x[f] || "") >= weekAgo && (x[f] || "") <= t);
  const wLots = wk(M.lots, "orderDate"), wSales = wk(M.sales, "date"), wOut = wk(M.pays.filter((p: any) => p.dir === "out"), "date"), wIn = wk(M.pays.filter((p: any) => p.dir === "in"), "date"), wExp = wk(M.exps, "date");
  const S = (arr: any[], f: (x: any) => number) => usdf(sum(arr, f));
  let h = `<div style="${css.wrap}"><div style="padding:22px 20px">
  <div style="font-size:12px;color:#4A7426;font-weight:bold;letter-spacing:.1em">ÜRÜN DEFTERİ</div>
  <h1 style="${css.h1}">Haftalık özet</h1><div style="${css.muted}">${fd(t)} · ${esc(Object.values(M.firms).map((f: any) => f.name).join(" · "))}</div>`;
  h += `<h2 style="${css.h2}">Geçen 7 gün</h2>${tbl(["", "Adet", "Tutar"], [
    ["Yeni alım", String(wLots.length), S(wLots, (l) => M.lotC.get(l.id).costUSD)],
    ["Satış", String(wSales.length), S(wSales, (s) => M.saleC.get(s.id).totUSD)],
    ["Tedarikçiye ödeme", String(wOut.length), S(wOut, (p) => usd(p.amount, p.cur, p.kur))],
    ["Tahsilat", String(wIn.length), S(wIn, (p) => usd(p.amount, p.cur, p.kur))],
    ["Masraf", String(wExp.length), S(wExp, (x) => usd(x.amount, x.cur, x.kur))],
  ], [1, 2])}`;
  h += `<h2 style="${css.h2}">Yoldaki konteynerler</h2>`;
  h += coming.length || noEta.length ? tbl(["Alım", "Gemi", "Tahmini varış", ""], [
    ...coming.map((l: any) => { const d = daysTo(l.eta); return [lotLabel(l), esc(l.carrier || "—"), fd(l.eta), d < 0 ? `<b style="color:#B3261E">${-d} gün gecikti</b>` : d === 0 ? "<b>bugün</b>" : `${d} gün`]; }),
    ...noEta.map((l: any) => [lotLabel(l), esc(l.carrier || "—"), "girilmedi", ST[l.status]]),
  ], [3]) : `<p style="${css.muted}">Yolda konteyner yok.</p>`;
  h += `<h2 style="${css.h2}">Mersin Serbest Bölge stoku</h2>`;
  h += stock.size ? [...stock].map(([p, m]) => `<div style="font-weight:bold;margin:10px 0 2px">${esc(p)}</div>${tbl(["Model", "Kalan", "Maliyet"], [...m].map(([k, r]) => [esc(k), fmt0.format(Math.round(r.kg)) + " kg", "$" + fmt2.format(r.cost / r.kg) + "/kg"]), [1, 2])}`).join("") : `<p style="${css.muted}">Serbest bölgede stok yok.</p>`;
  h += `<h2 style="${css.h2}">Tedarikçilere kalan borç</h2>` + (supRows.length ? tbl(["Tedarikçi", "Kalan"], supRows.map(([n, b]) => [esc(n), usdf(b)]), [1]) : `<p style="${css.muted}">Borç yok.</p>`);
  h += `<h2 style="${css.h2}">Müşteri alacakları</h2>` + (cusRows.length ? tbl(["Müşteri", "Kalan", "En eski"], cusRows.map(([n, b, o]) => { const g = o ? -daysTo(o) : 0; return [esc(n), usdf(b), o ? `${fd(o)}${g > 30 ? ` · <b style="color:#A8530F">${g} gün</b>` : ""}` : "—"]; }), [1]) : `<p style="${css.muted}">Açık alacak yok.</p>`);
  if (ortak.length) h += `<h2 style="${css.h2}">Ortak alımlardan beklenen</h2>` + tbl(["Alım", "Ortak", "Kalan"], ortak.map((l: any) => [lotLabel(l), esc(M.pname(l.ortak.partnerId)), usdf(M.lotC.get(l.id).odue)]), [2]);
  h += `<div style="margin:28px 0 6px"><a href="${SITE}" style="background:#4A7426;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;display:inline-block">Defteri aç</a></div>
  <p style="${css.muted}">Tutarlar dolar karşılığıdır. Bu e-posta her pazartesi Ürün Defteri'ne kayıtlı herkese gönderilir.</p></div></div>`;
  return h;
}
function backupHtml(M: ReturnType<typeof model>, n: number) {
  return `<div style="${css.wrap}"><div style="padding:22px 20px"><div style="font-size:12px;color:#4A7426;font-weight:bold;letter-spacing:.1em">ÜRÜN DEFTERİ</div>
  <h1 style="${css.h1}">Haftalık yedek</h1><p>${fd(todayTR())} itibarıyla bütün kayıtlar ektedir.</p>
  ${tbl(["", "Adet"], [["Alım", String(M.lots.length)], ["Satış", String(M.sales.length)], ["Ödeme / tahsilat", String(M.pays.length)], ["Masraf", String(M.exps.length)], ["Firma / kişi", String(Object.keys(M.parties).length)], ["Toplam kayıt", String(n)]], [1])}
  <p style="${css.muted};margin-top:16px">Excel dosyası okumak içindir. JSON dosyası tam yedektir; gerektiğinde defter bu dosyadan geri yüklenebilir. Fatura ve dekont görselleri yedeğe dahil değildir, Supabase depolamasında durur. Bu e-posta sadece yedek adresine gönderilir.</p></div></div>`;
}
function buildXlsx(XLSX: any, M: ReturnType<typeof model>) {
  const wb = XLSX.utils.book_new(); const r2 = (n: number) => Math.round((+n || 0) * 100) / 100;
  const add = (rows: any[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Kayıt yok" }]), name);
  const firm = (id: string) => M.firms[id]?.name || id;
  add(M.lots.flatMap((l: any) => { const c = M.lotC.get(l.id); return l.items.map((it: any) => { const ci = M.items.get(l.id + "|" + it.k); return { "Kod": l.code, "Firma": firm(l.firmId), "Tedarikçi": M.pname(l.supplierId, l.supplier), "Menşe": l.origin, "Ürün": M.prodName(it), "Model": it.model, "Miktar kg": +it.kg || 0, "Fiyat /kg": it.ppk, "Para birimi": l.cur, "Kur": l.cur === "TL" ? l.kur : "", "Satılan kg": ci?.sold || 0, "Kalan kg": (+it.kg || 0) - (ci?.sold || 0), "Aşama": ST[l.status], "Alım USD": r2(c.costUSD), "Ödenen USD": r2(c.paid), "Kalan borç USD": r2(c.due), "Kâr USD": r2(c.profit), "Ortak": l.ortak?.on ? M.pname(l.ortak.partnerId) : "", "Sipariş": l.orderDate, "Tahmini varış": l.eta, "Varış": l.arriveDate, "Gemi firması": l.carrier || "", "Konteyner": (Array.isArray(l.cntNos) ? l.cntNos : [l.cntNos]).filter(Boolean).join(", "), "B/L": l.bl || "", "Booking": l.booking || "", "Fatura no": l.invoiceNo || "", "Not": l.note }; }); }), "Alımlar");
  add(M.sales.flatMap((s: any) => s.items.map((ln: any) => { const ci = M.items.get(ln.lotId + "|" + ln.ik); return { "Tarih": s.date, "Firma": firm(s.firmId), "Müşteri": M.pname(s.customerId, s.customer), "Pazar": MK[s.market] || s.market, "Alım": ci?.lot.code, "Ürün": ci ? M.prodName(ci.it) : "", "Model": ci?.it.model || "", "Miktar kg": +ln.kg || 0, "Fiyat /kg": ln.ppk, "Para birimi": s.cur, "Kur": s.cur === "TL" ? s.kur : "", "Tutar USD": r2(usd((+ln.kg || 0) * (+ln.ppk || 0), s.cur, s.kur)), "Fatura no": s.docNo || "", "Plaka": s.plate || "" }; })), "Satışlar");
  add(M.pays.map((p: any) => ({ "Tarih": p.date, "Tür": p.dir === "out" ? "Ödeme" : "Tahsilat", "Firma": firm(p.firmId), "Kime/kimden": M.pname(p.partyId, p.party), "Açıklama": p.kind, "Banka": p.bank || "", "Tutar": +p.amount || 0, "Para birimi": p.cur, "Kur": p.cur === "TL" ? p.kur : "", "Tutar USD": r2(usd(p.amount, p.cur, p.kur)), "Not": p.note })), "Ödemeler");
  add(M.exps.map((x: any) => ({ "Tarih": x.date, "Tür": x.cat, "Firma": firm(x.firmId), "Kime": x.payee, "Tutar": +x.amount || 0, "Para birimi": x.cur, "Kur": x.cur === "TL" ? x.kur : "", "Tutar USD": r2(usd(x.amount, x.cur, x.kur)), "Belge no": x.docNo, "Not": x.note })), "Masraflar");
  add(Object.values(M.parties).map((p: any) => ({ "Tür": p.kind === "supplier" ? "Tedarikçi" : "Müşteri / ortak", "Firma": p.name, "İlgili kişi": p.person, "Telefon": p.phone, "E-posta": p.email, "Web": p.web, "Ülke": p.country, "Adres": p.address, "Banka": p.bank })), "Rehber");
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
    firm: { type: "string", enum: ["a", "b", ""] },
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
Firmalarımız: a = ${ctx.firms?.[0] || "Asya Çerez"}, b = ${ctx.firms?.[1] || "Gökhan Altın"}. Cümlede firma geçmiyorsa firm boş bırak ve bunun için uyarı YAZMA (firma bağlı alımdan/satıştan bulunur).
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
      if (d === 3 || d === 1 || d === 0) alerts.push({ k: `eta:${l.id}:${d}`, pref: "eta", title: d === 0 ? `${w} bugün Mersin'de` : `${w} ${d === 1 ? "yarın" : "3 gün sonra"} Mersin'de`, body: `${lotLabel(l)}${via ? " · " + via : ""}`, url: `./#lot=${l.id}` });
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
