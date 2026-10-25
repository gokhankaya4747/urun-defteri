// Hesap motoru testleri: node tools/test_calc.mjs  (build.py her derlemede çalıştırır; biri bozulursa yayına çıkmaz)
// Beklenen rakamlar elle hesaplandı (motorun kendi çıktısından kopyalanmadı).
import fs from "node:fs"; import vm from "node:vm"; import assert from "node:assert/strict";
const root = new URL("..", import.meta.url).pathname;
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(root + "src/calc.js", "utf8") + "\nthis.CALC = CALC;", ctx);
const CALC = ctx.CALC;
const rows = JSON.parse(fs.readFileSync(root + "baslangic.json", "utf8"));
const base = () => { const D = { lots: [], sales: [], pays: [], exps: [], kap: [], trf: [], parties: {}, products: {} };
  for (const r of structuredClone(rows)) { if (Array.isArray(D[r.col])) D[r.col].push({ id: r.id, ...r.data }); else if (r.col === "parties" || r.col === "products") D[r.col][r.id] = r.data; } return D; };
const near = (a, b, msg, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
const sale = (D, id) => D.sales.find((s) => s.id === id), lot = (D, id) => D.lots.find((l) => l.id === id);
let n = 0; const T = (name, f) => { try { f(); n++; } catch (e) { console.error("✗ " + name + "\n  " + e.message); process.exitCode = 1; } };

// genel tutarlılık: her senaryoda geçerli olması gerekenler
const invariants = (D, R, tag) => {
  for (const ci of R.item.values()) near(CALC.itemStock(ci), ci.kgIn - ci.consumed - ci.adjKg - ci.supRetKg, `${tag} stok formülü ${ci.lot.code}`);
  // kâr olaylarının toplamı = alımların kâr toplamı (genel gider hariç)
  const evT = R.events.filter((e) => e.kind !== "ovh").reduce((a, e) => a + (e.rev || 0) - (e.cogs || 0) - (e.exp || 0) + (e.kur || 0) - (e.kes || 0) - (e.loss || 0), 0);
  const lotT = [...R.lot.values()].reduce((a, c) => a + c.totalProfit, 0);
  near(evT, lotT, `${tag} olay toplamı = alım kârları`);
  // cari: müşteri bakiyeleri toplamı = satış alacakları + ortak alacakları − dağıtılmamış avans
  const PB = CALC.partyBalances(D, R, () => true);
  for (const r of PB.sup) assert.ok(Number.isFinite(r.a - r.p), `${tag} tedarikçi bakiyesi sayı`);
};

T("örnek veri: maliyet, satış kârı, alacak", () => {
  const D = base(), R = CALC.compute(D);
  const ci = R.item.get("ex-l1|i1"); near(CALC.landedOf(ci), 6.9 + 400 / 19200, "W320 kg maliyeti (gümrükçü 18.000₺/45 dağıtılmış)", 1e-6);
  const c = R.sale.get("ex-sa1"); near(c.totUSD, 6000 * 8.6 + 3000 * 9.7, "fatura"); near(c.due, 80700 - 50000, "kalan alacak");
  const P = R.events.filter((e) => e.saleId === "ex-sa1").reduce((a, e) => a + (e.rev || 0) - (e.cogs || 0) - (e.exp || 0), 0);
  const cogs = 6000 * (6.9 + 400 / 19200) + 3000 * (R.item.get("ex-l1|i2").cu + 400 / 19200);
  near(P, 80700 - cogs - (2400 + 63000 / 45), "satış kârı");
  invariants(D, R, "örnek");
});

T("kapama: dinar kurlarından kur farkı ve kesinti", () => {
  const D = base(); D.kap.push({ id: "k1", firmId: "a", saleId: "ex-sa1", date: "2026-10-01", out: 10000, ins: [{ date: "2026-10-03", amt: 11200 }], cRate: 1480, bRate: 1310 });
  const kc = CALC.kapCalc(D.kap[0]); near(kc.expected, 10000 * 1480 / 1310, "beklenen"); near(kc.kur, 10000 * 1480 / 1310 - 10000, "kur farkı"); near(kc.kes, 10000 * 1480 / 1310 - 11200, "kesinti"); near(kc.gain, 1200, "net");
  const R = CALC.compute(D); const ev = R.events.filter((e) => e.kind === "kap"); near(ev.reduce((a, e) => a + e.kur - e.kes, 0), 1200, "olaylara dağıtılan net kur farkı");
  near(R.sale.get("ex-sa1").due, 30700, "kapama gerçek alacağı değiştirmez"); near(R.sale.get("ex-sa1").offPaid, 11200, "resmi gelen");
  invariants(D, R, "kapama");
});

T("kapama: devamı gelecek → kâra yazılmaz; kursuz kapamada fark = kur farkı", () => {
  const D = base(); D.kap.push({ id: "k1", firmId: "a", saleId: "ex-sa1", date: "2026-10-01", out: 10000, ins: [{ amt: 6000, date: "2026-10-02" }], done: false });
  let R = CALC.compute(D); assert.equal(R.events.filter((e) => e.kind === "kap").length, 0, "bekleyen kapama olay üretmemeli"); assert.ok(CALC.kapCalc(D.kap[0]).part);
  D.kap[0].done = true; D.kap[0].ins.push({ amt: 5100, date: "2026-10-04" }); R = CALC.compute(D);
  near(CALC.kapCalc(D.kap[0]).kur, 1100, "kursuz kur farkı"); invariants(D, R, "kapama-parça");
});

T("konsinye: satıldı, geri gelen, kayıp", () => {
  const D = base(); D.sales.push({ id: "ks", firmId: "b", customerId: "ex-c1", market: "irak", date: "2026-10-05", realLater: true, cur: "USD", items: [{ lotId: "ex-l2", ik: "i1", kg: 1000, price: 9, ppk: 9 }],
    real: [{ id: "r1", date: "2026-10-10", lines: [{ i: 0, kg: 400, price: 10, ppk: 10 }] }], ret: [{ id: "t1", date: "2026-10-12", i: 0, kg: 100, kind: "iade" }, { id: "t2", date: "2026-10-12", i: 0, kg: 50, kind: "kayip" }] });
  const R = CALC.compute(D), c = R.sale.get("ks"), ci = R.item.get("ex-l2|i1");
  near(c.pendKg, 1000 - 400 - 100 - 50, "bekleyen kg"); near(c.revUSD, 4000, "gelir sadece satılan"); near(ci.konsKg, 450, "konsinyede");
  near(CALC.itemStock(ci), 21000 - 900, "stok: geri gelen 100 kg stoğa döndü"); near(c.due, 4000, "alacak sadece satılan kısım");
  const loss = R.events.filter((e) => e.kind === "lost").reduce((a, e) => a + e.loss, 0); near(loss, 50 * CALC.landedOf(ci), "kayıp maliyetiyle");
  const sold = R.events.find((e) => e.kind === "sale" && e.saleId === "ks"); assert.equal(sold.date, "2026-10-10", "kâr satıldı tarihinde");
  invariants(D, R, "konsinye");
});

T("normal satış iadesi alacağı ve geliri düşürür, stoğa döner", () => {
  const D = base(); sale(D, "ex-sa1").ret = [{ id: "t", date: "2026-10-01", i: 0, kg: 1000, kind: "iade" }];
  const R = CALC.compute(D); near(R.sale.get("ex-sa1").due, 30700 - 8600, "alacak"); near(R.item.get("ex-l1|i1").consumed, 5000 + 2000, "çıkan kg");
  invariants(D, R, "iade");
});

T("tedarikçi: mal iadesi, indirim, para iadesi", () => {
  const D = base(); lot(D, "ex-l1").cred = [{ id: "c1", date: "2026-10-01", amount: 1500, cur: "USD", ik: "i1", kg: 200 }, { id: "c2", date: "2026-10-01", amount: 300, cur: "USD" }];
  D.pays.push({ id: "rf", dir: "in", firmId: "a", lotId: "ex-l1", saleId: "", partyId: "ex-s1", amount: 700, cur: "USD", date: "2026-10-02" });
  const R = CALC.compute(D), c = R.lot.get("ex-l1"); near(c.due, -(1500 + 300) + 700, "avans = iade+indirim − geri gelen para");
  near(R.item.get("ex-l1|i1").supRetKg, 200, "iade kg"); near(R.item.get("ex-l1|i1").perKg, (400 - 300) / 19200, "indirim kg maliyetini düşürür", 1e-6);
  const PB = CALC.partyBalances(D, R, () => true); const s = PB.sup.find((r) => r.id === "ex-s1"); near(s.a - s.p, R.lot.get("ex-l1").due + R.lot.get("ex-l3").due, "cari = alımların borcu");
  invariants(D, R, "tedarikçi");
});

T("bağlanmamış tahsilat en eski açık satışa düşer", () => {
  const D = base(); D.pays.push({ id: "u", dir: "in", firmId: "a", partyId: "ex-c1", saleId: "", lotId: "", amount: 10000, cur: "USD", date: "2026-10-05" });
  const R = CALC.compute(D); near(R.sale.get("ex-sa1").due, 20700, "kalan"); near(R.sale.get("ex-sa1").alloc, 10000, "cariden düşülen");
  invariants(D, R, "fifo");
});

T("ortak alım: ortağın borcu = satış − ortağın masrafı − ortağın kâr payı", () => {
  const D = base(), R = CALC.compute(D), l = lot(D, "ex-l3"), c = R.lot.get("ex-l3"), sh = l.ortak.share / 100;
  near(c.owe, c.rev - c.expP - (1 - sh) * c.totalProfit, "formül"); near(c.ourProfit, sh * c.totalProfit, "bizim pay");
  invariants(D, R, "ortak");
});

T("fire stoktan ve kârdan düşer", () => {
  const D = base(); lot(D, "ex-l1").adj = [{ id: "a", date: "2026-10-01", ik: "i2", kg: 100, reason: "fire" }];
  const R = CALC.compute(D), ci = R.item.get("ex-l1|i2"); near(ci.adjKg, 100, "fire kg");
  near(R.events.filter((e) => e.kind === "fire").reduce((a, e) => a + e.loss, 0), 100 * CALC.landedOf(ci), "fire zararı");
  invariants(D, R, "fire");
});

T("resmi iade faturası resmi kalanı düşürür, kesilmezse düşürmez", () => {
  const D = base(); sale(D, "ex-sa1").ret = [{ id: "t", date: "2026-10-01", i: 0, kg: 1000, kind: "iade", off: true }];
  let R = CALC.compute(D); near(R.sale.get("ex-sa1").offDue, 80700 - 8600, "resmi kalan (nakit tahsilat resmi sayılmaz)");
  sale(D, "ex-sa1").ret[0].off = false; R = CALC.compute(D); near(R.sale.get("ex-sa1").offDue, 80700, "iade faturası yoksa resmi kalan aynı");
  near(R.sale.get("ex-sa1").due, 30700 - 8600, "gerçek alacak her iki durumda düşer");
});

T("TL satış: tahsilat başka kurla gelince alacak kapanır, fark TL kur farkı olur", () => {
  const D = base(); D.pays.find((p) => p.id === "ex-p7").kur = 46;
  const R = CALC.compute(D); near(R.sale.get("ex-sa2").due, 0, "TL'si ödenen satış dolarda da kapalı");
  const fx = R.events.filter((e) => e.kind === "fx" && e.saleId === "ex-sa2").reduce((a, e) => a + e.kur, 0);
  near(fx, 780000 / 46 - 780000 / 45, "kur farkı (lira değer kaybetti → zarar)");
  const PB = CALC.partyBalances(D, R, () => true); const c3 = PB.cus.find((r) => r.id === "ex-c3"); near(c3.a - c3.p, 0, "cari de kapalı");
  invariants(D, R, "tl-satış");
});

T("TL alım: ödeme başka kurla yapılınca borç kapanır, fark TL kur farkı olur", () => {
  const D = base(); D.lots.push({ id: "tl", code: "A26-009", firmId: "a", supplierId: "ex-s1", cur: "TL", kur: 40, status: "depoda", items: [{ k: "i1", productId: "kaju", model: "W320", kg: 1000, price: 280, ppk: 280 }] });
  D.pays.push({ id: "tp", dir: "out", firmId: "a", lotId: "tl", saleId: "", partyId: "ex-s1", amount: 280000, cur: "TL", kur: 42, date: "2026-10-10" });
  const R = CALC.compute(D); near(R.lot.get("tl").due, 0, "TL borç kapandı");
  near(R.events.filter((e) => e.kind === "fx" && e.lotId === "tl").reduce((a, e) => a + e.kur, 0), 280000 / 40 - 280000 / 42, "lira değer kaybetti → kazanç");
  invariants(D, R, "tl-alım");
});

T("Irak sevkinin navlunu sadece o sevkte giden kg'ye eklenir", () => {
  const D = base(); const l = lot(D, "ex-l1"); l.sevk = [{ id: "sv1", date: "2026-10-05", lines: [{ ik: "i1", kg: 1000 }] }];
  D.exps.push({ id: "nv", firmId: "a", lotId: "ex-l1", saleId: "", sevkId: "sv1", cat: "TIR navlunu", amount: 500, cur: "USD", date: "2026-10-05", paidBy: "biz" });
  D.sales.push({ id: "is", firmId: "a", customerId: "ex-c1", market: "irak", date: "2026-10-08", cur: "USD", items: [{ lotId: "ex-l1", ik: "i1", kg: 600, price: 9, ppk: 9, loc: "irak" }] });
  const R = CALC.compute(D), ci = R.item.get("ex-l1|i1");
  near(ci.perKg, 400 / 19200, "alım geneli masraf payı değişmedi", 1e-6);
  near(CALC.landedIrakOf(ci), CALC.landedOf(ci) + 0.5, "Irak maliyeti = Mersin + 500$/1000kg", 1e-6);
  const cogs = R.events.filter((e) => e.saleId === "is" && e.kind === "sale").reduce((a, e) => a + e.cogs, 0);
  near(cogs, 600 * (CALC.landedOf(ci) + 0.5), "Irak'tan satışın maliyeti navlun dahil");
  near(CALC.irakLeft(ci), 400, "Irak'ta kalan");
  invariants(D, R, "navlun");
});

T("Excel sayfaları = olaylar (Kâr hareketleri toplamı)", () => {
  const D = base(), R = CALC.compute(D);
  const SH = CALC.sheets(D, R, { firm: (x) => x, party: (i, f) => f || i, prod: (it) => it.productId, stage: (l) => l.status });
  const t = SH["Kâr hareketleri"].reduce((a, r) => a + r["Kâr USD"], 0);
  const ev = R.events.reduce((a, e) => a + (e.rev || 0) - (e.cogs || 0) - (e.exp || 0) + (e.kur || 0) - (e.kes || 0) - (e.loss || 0), 0);
  near(t, ev, "toplam", 0.5);
});

T("sunucu fonksiyonundaki motor = src/calc.js", () => {
  const ts = fs.readFileSync(root + "supabase/functions/defter/index.ts", "utf8"); const a = "// <calc.js> (build.py gömer; elle düzenleme)\n";
  const emb = ts.slice(ts.indexOf(a) + a.length, ts.indexOf("// </calc.js>")).trim(); assert.ok(emb === fs.readFileSync(root + "src/calc.js", "utf8").trim(), "sunucudaki kopya eski: python3 build.py çalıştır");
});

console.log(process.exitCode ? `TESTLER BAŞARISIZ (${n} geçti)` : `✓ ${n} test geçti`);
