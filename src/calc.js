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
