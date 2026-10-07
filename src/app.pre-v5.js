(() => {
"use strict";
document.documentElement.lang="tr";
/* ---------- sabitler ---------- */
const ST = [
  {k:"siparis", t:"Sipariş verildi", s:"Sipariş"},
  {k:"onodeme", t:"Ön ödeme yapıldı", s:"Ön ödeme"},
  {k:"yuklendi", t:"Yüklendi", s:"Yüklendi"},
  {k:"yolda", t:"Yolda", s:"Yolda"},
  {k:"depoda", t:"Mersin SB'de", s:"Mersin SB"},
  {k:"kapandi", t:"Kapandı", s:"Kapandı"},
];
const STI = Object.fromEntries(ST.map((s,i)=>[s.k,i]));
const STD = {yuklendi:"loadDate", depoda:"arriveDate"};
const MK = {irak:"Irak", ic:"İç piyasa", diger:"İhracat (diğer)"};
const FIRM_DEF = {a:"Asya Çerez", b:"Gökhan Altın"};
const DEF_ORIGINS = ["İran","ABD","Afganistan","Hindistan","Vietnam","Şili","Arjantin","Brezilya","Çin","Özbekistan","Türkiye","Fildişi Sahili"];
const DEF_EXPC = ["Irak gümrüğü","TIR navlunu (Mersin yükleme)","Gümrük müşaviri","İhracat masrafı","Serbest bölge depo / ardiye","Liman / ordino","Sigorta","Banka masrafı","Diğer"];
const DOCK = {
  lots:["Alış faturası","Konşimento (B/L)","Menşe şahadetnamesi","Fitosanitasyon","Packing list","Proforma / sözleşme","Diğer"],
  sales:["Satış faturası","İhracat beyannamesi","CMR / taşıma belgesi","Diğer"],
  exps:["Masraf faturası","Makbuz","Diğer"],
  pays:["Dekont","Diğer"],
};
const VIEWS = [
  {k:"urunler", t:"Ürünler", ic:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'},
  {k:"alimlar", t:"Alımlar", ic:'<rect x="2" y="6" width="20" height="13" rx="1.5"/><path d="M7 9v7M12 9v7M17 9v7"/>'},
  {k:"satislar", t:"Satışlar", ic:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'},
  {k:"cari", t:"Cari", ic:'<path d="M4 7h16M4 12h16M4 17h10"/>'},
  {k:"arsiv", t:"Arşiv", ic:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>'},
];

/* ---------- durum ---------- */
const S = {lots:[],sales:[],pays:[],exps:[],firms:{},products:{},parties:{},lists:{},pending:{},
  view:"urunler",firm:"all",prod:"all",stage:"all",market:"all",cari:"ted",q:"",pq:"",year:"all",atype:"all",stack:[],conn:""};
let db=null, user=null, dl=null, assets=null, me=null, canWrite=true;
const C = {lot:new Map(), sale:new Map(), item:new Map()};
try{ const v=localStorage.getItem("pd.view"); if(VIEWS.some(x=>x.k===v)) S.view=v; const f=localStorage.getItem("pd.firm"); if(["all","a","b"].includes(f)) S.firm=f; }catch(e){}
const save = (k,v)=>{ try{localStorage.setItem(k,v)}catch(e){} };

/* ---------- yardımcılar ---------- */
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nf0 = new Intl.NumberFormat("tr-TR",{maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat("tr-TR",{maximumFractionDigits:4});
const usdf = v => (v<0?"−":"")+"$"+nf0.format(Math.abs(Math.round(v)));
const moneyf = (v,c) => c==="TL" ? nf0.format(Math.round(v))+" ₺" : usdf(v);
const kgf = v => nf0.format(Math.round(v))+" kg";
const MON = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const MONL = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const fd = d => { if(!d) return "—"; const [y,m,dd]=d.slice(0,10).split("-"); return `${+dd} ${MON[+m-1]} ${y}`; };
const fds = d => { if(!d) return "—"; const [,m,dd]=d.slice(0,10).split("-"); return `${+dd} ${MON[+m-1]}`; };
const today = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`; };
const days = d => Math.round((new Date(d+"T12:00:00") - new Date(today()+"T12:00:00"))/864e5);
const usd = (a,c,k) => c==="TL" ? ((+k>0)? (+a||0)/(+k) : 0) : (+a||0);
const sum = (arr,f) => arr.reduce((a,x)=>a+(f(x)||0),0);
const parseNum = s => {
  s = String(s??"").trim().replace(/\s|₺|\$|%/g,""); if(!s) return null;
  if(s.includes(",") && s.includes(".")) s = s.replace(/\./g,"").replace(",",".");
  else if(s.includes(",")) s = s.replace(",",".");
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,"");
  const n = Number(s); return Number.isFinite(n) ? n : NaN;
};
const numv = n => n===null||n===undefined||n===""||Number.isNaN(n) ? "" : String(n).replace(".",",");
const key = s => String(s||"").trim().toLocaleLowerCase("tr");
const uniq = arr => [...new Set(arr.filter(Boolean).map(s=>String(s).trim()))].sort((a,b)=>a.localeCompare(b,"tr"));
const opt = ([v,t],cur) => `<option value="${esc(v)}" ${String(cur??"")===String(v)?"selected":""}>${esc(t)}</option>`;
const firmName = id => S.firms[id]?.name || FIRM_DEF[id] || "—";
const firmColor = id => id==="b" ? "var(--firm-b)" : "var(--firm-a)";
const firmTag = id => `<span class="firmtag"><span class="dot" style="background:${firmColor(id)}"></span>${esc(firmName(id))}</span>`;
const stPill = k => { const s=ST[STI[k]]||ST[0]; return `<span class="pill" style="color:var(--st-${s.k})"><span class="dot"></span>${s.s}</span>`; };
const inFirm = x => S.firm==="all" || x.firmId===S.firm;
const lotById = id => S.lots.find(l=>l.id===id);
const saleById = id => S.sales.find(s=>s.id===id);
const prodName = id => S.products[id]?.name || S.pending[id] || "—";
const itemProd = it => it.productId ? prodName(it.productId) : (it.product||"—");
const itemLabel = it => `${itemProd(it)}${it.model?" "+it.model:""}`;
const partyName = (id,fb) => (id && (S.parties[id]?.name || S.pending[id])) || fb || "—";
const lotSupplier = l => partyName(l.supplierId,l.supplier);
const saleCustomer = s => partyName(s.customerId,s.customer);
const payParty = p => partyName(p.partyId,p.party);
const pkey = (id,name) => id ? "i:"+id : "n:"+key(name);
const lotProducts = l => uniq(l.items.map(itemProd)).join(" + ");
const expUSD = x => usd(x.amount,x.cur,x.kur);
const lists = k => (S.lists[k]?.items?.length ? S.lists[k].items : (k==="origins"?DEF_ORIGINS:DEF_EXPC));
const productsSorted = () => Object.entries(S.products).map(([id,p])=>({id,...p})).sort((a,b)=>(a.order??99)-(b.order??99)||String(a.name).localeCompare(String(b.name),"tr"));
const partiesOf = kind => Object.entries(S.parties).filter(([,p])=>p.kind===kind).map(([id,p])=>({id,...p})).sort((a,b)=>String(a.name).localeCompare(String(b.name),"tr"));
function modelsOf(pid){
  const cat = S.products[pid]?.models || [];
  const used = []; for(const l of S.lots) for(const it of l.items) if(it.productId===pid && it.model) used.push(it.model);
  return [...cat, ...uniq(used).filter(m=>!cat.some(c=>key(c)===key(m)))];
}
const findProd = name => Object.keys(S.products).find(id=>key(S.products[id].name)===key(name)) || "";
const matchProd = (it,pid) => pid.startsWith("n:") ? (!it.productId && key(it.product)===pid.slice(2)) : it.productId===pid;
let toastT; const toast = m => { const t=document.getElementById("toast"); t.textContent=m; t.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"),2600); };
const blobA = (id,attr="src") => `data-blob${attr==="href"?"-href":""}="${esc(id)}"`;
const svg = (p,s=20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const colArr = col => ({lots:S.lots,sales:S.sales,pays:S.pays,exps:S.exps}[col]||[]);
const hasEx = () => S.lots.some(x=>x.ornek)||S.sales.some(x=>x.ornek)||S.pays.some(x=>x.ornek)||S.exps.some(x=>x.ornek)||Object.values(S.parties).some(x=>x.ornek);

/* eski kayıt biçimini (tek ürünlü) yeni biçime çevir */
function normLot(l){
  if(!Array.isArray(l.items)||!l.items.length) l.items=[{k:"i1",productId:findProd(l.product),product:l.product||"",model:"",kg:+l.kg||0,price:+l.price||0,ppk:+l.ppk||0}];
  if(!l.priceUnit) l.priceUnit="kg";
  return l;
}
function normSale(s){
  if(!Array.isArray(s.items)) s.items = s.lotId ? [{lotId:s.lotId,ik:"i1",kg:+s.kg||0,price:+s.price||0,ppk:+s.ppk||0}] : [];
  return s;
}

/* ---------- hesaplar ---------- */
function calcAll(){
  C.item.clear(); C.lot.clear(); C.sale.clear();
  for(const l of S.lots) for(const it of l.items) C.item.set(l.id+"|"+it.k,{lot:l,it,soldKg:0,cu:usd(+it.ppk||0,l.cur,l.kur)});
  const eSale=new Map(), eLot=new Map();
  const bucket=(m,k)=>{ if(!m.has(k)) m.set(k,{us:0,p:0,list:[]}); return m.get(k); };
  for(const x of S.exps){ const b = x.saleId ? bucket(eSale,x.saleId) : x.lotId ? bucket(eLot,x.lotId) : null; if(!b) continue; b[x.paidBy==="ortak"?"p":"us"]+=expUSD(x); b.list.push(x); }
  const acc=new Map(S.lots.map(l=>[l.id,{soldKg:0,soldCost:0,rev:0,expUs:0,expP:0,sales:[]}]));
  for(const s of S.sales){
    let tot=0, kg=0, olot=null; const lines=[];
    for(const ln of s.items){ const amt=(+ln.kg||0)*(+ln.ppk||0); tot+=amt; kg+=+ln.kg||0; const ci=C.item.get(ln.lotId+"|"+ln.ik); if(ci){ ci.soldKg+=+ln.kg||0; if(ci.lot.ortak?.on) olot=ci.lot; } lines.push({ln,ci,amtUSD:usd(amt,s.cur,s.kur)}); }
    const totUSD=usd(tot,s.cur,s.kur);
    const pays=S.pays.filter(p=>p.dir==="in"&&p.saleId===s.id); const got=sum(pays,p=>usd(p.amount,p.cur,p.kur));
    const e=eSale.get(s.id)||{us:0,p:0,list:[]};
    C.sale.set(s.id,{tot,totUSD,kg,got,due:totUSD-got,pays,exps:e.list,exp:e.us+e.p,olot,lines});
    for(const {ln,ci,amtUSD} of lines){ if(!ci) continue; const a=acc.get(ci.lot.id); const k=+ln.kg||0, sh=kg?k/kg:0;
      a.soldKg+=k; a.soldCost+=k*ci.cu; a.rev+=amtUSD; a.expUs+=e.us*sh; a.expP+=e.p*sh; if(!a.sales.includes(s)) a.sales.push(s); }
  }
  for(const l of S.lots){
    const cost=sum(l.items,it=>(+it.kg||0)*(+it.ppk||0)), costUSD=usd(cost,l.cur,l.kur);
    const pays=S.pays.filter(p=>p.dir==="out"&&p.lotId===l.id), paid=sum(pays,p=>usd(p.amount,p.cur,p.kur));
    const a=acc.get(l.id), e=eLot.get(l.id)||{us:0,p:0,list:[]};
    const expUs=a.expUs+e.us, expP=a.expP+e.p, profit=a.rev-a.soldCost-expUs-expP;
    const r={cost,costUSD,paid,due:costUSD-paid,pays,sales:a.sales,exps:e.list,soldKg:a.soldKg,soldCost:a.soldCost,rev:a.rev,expUs,expP,exp:expUs+expP,profit,pct:costUSD?Math.max(0,Math.min(1,paid/costUSD)):0};
    if(l.ortak?.on){ const sh=(+l.ortak.share||0)/100; const op=S.pays.filter(p=>p.dir==="in"&&p.lotId===l.id); const og=sum(op,p=>usd(p.amount,p.cur,p.kur));
      const owe=a.rev-expP-(1-sh)*profit; Object.assign(r,{share:sh,ourProfit:sh*profit,owe,ogot:og,odue:owe-og,opays:op}); }
    C.lot.set(l.id,r);
  }
}
const LC = l => C.lot.get(l.id) || {cost:0,costUSD:0,paid:0,due:0,pays:[],sales:[],exps:[],soldKg:0,soldCost:0,rev:0,expUs:0,expP:0,exp:0,profit:0,pct:0};
const SC = s => C.sale.get(s.id) || {tot:0,totUSD:0,kg:0,got:0,due:0,pays:[],exps:[],exp:0,olot:null,lines:[]};
const itemStock = ci => (+ci.it.kg||0) - ci.soldKg;
const lotHasProd = (l,pid) => l.items.some(it=>matchProd(it,pid));
const saleHasProd = (s,pid) => s.items.some(ln=>{ const ci=C.item.get(ln.lotId+"|"+ln.ik); return ci && matchProd(ci.it,pid); });

/* ürün → model istatistikleri (yalnızca o ürünün kendi içinde) */
function prodStats(pid){
  const m=new Map(); const yr=today().slice(0,4);
  const g=name=>{ const k=name||"(model yok)"; if(!m.has(k)) m.set(k,{model:k,ord:0,yol:0,dep:0,depCost:0,soldY:0,revY:0}); return m.get(k); };
  if(!pid.startsWith("n:")) for(const md of (S.products[pid]?.models||[])) g(md);
  for(const ci of C.item.values()){
    if(!matchProd(ci.it,pid) || !inFirm(ci.lot)) continue;
    const r=g(ci.it.model), st=ci.lot.status, left=Math.max(0,itemStock(ci));
    if(st==="siparis"||st==="onodeme") r.ord+=left; else if(st==="yuklendi"||st==="yolda") r.yol+=left; else if(st==="depoda"){ r.dep+=left; r.depCost+=left*ci.cu; }
  }
  for(const s of S.sales){ if(!(s.date||"").startsWith(yr) || !inFirm(s)) continue;
    for(const {ln,ci,amtUSD} of SC(s).lines){ if(!ci||!matchProd(ci.it,pid)) continue; const r=g(ci.it.model); r.soldY+=+ln.kg||0; r.revY+=amtUSD; } }
  return [...m.values()];
}
function prodList(){
  const out=productsSorted().map(p=>({id:p.id,name:p.name}));
  const extra=new Set(); for(const l of S.lots) for(const it of l.items) if(!it.productId && it.product) extra.add(it.product);
  for(const n of extra) out.push({id:"n:"+key(n),name:n});
  return out;
}

/* ---------- çizim ---------- */
function renderChrome(){
  document.getElementById("tabs").innerHTML = VIEWS.map(v=>`<button type="button" data-view="${v.k}" ${S.view===v.k?'aria-current="page"':""}>${v.t}</button>`).join("");
  document.getElementById("btabs").innerHTML = VIEWS.map(v=>`<button type="button" data-view="${v.k}" ${S.view===v.k?'aria-current="page"':""}>${svg(v.ic,22)}${v.t}</button>`).join("");
  document.getElementById("firmsel").innerHTML = [["all","Tümü"],["a",firmName("a")],["b",firmName("b")]].map(([k,t])=>
    `<button type="button" data-firm="${k}" aria-pressed="${S.firm===k}">${k!=="all"?`<span class="dot" style="background:${firmColor(k)}"></span>`:""}${esc(t)}</button>`).join("");
  document.getElementById("addbtn").hidden = !canWrite || !db;
  document.getElementById("fab").hidden = !canWrite || !db;
}
function render(){
  calcAll(); renderChrome();
  const m=document.getElementById("main");
  let h="";
  if(S.conn) h+=`<div class="conn">${esc(S.conn)}</div>`;
  if(hasEx()) h+=`<div class="banner"><b>Örnek kayıtlar</b><span>Gördüğün alımlar, satışlar, firmalar ve ödemeler sadece nasıl çalıştığını göstermek için. Kendi kayıtlarına başlamadan önce sil.</span>${canWrite?`<button class="btn sm" type="button" data-act="clear-ex">Örnekleri sil</button>`:""}</div>`;
  h+=({urunler:vUrunler,alimlar:vAlimlar,satislar:vSatislar,cari:vCari,arsiv:vArsiv}[S.view]||vUrunler)();
  m.innerHTML=h;
  fillNames(m); window.__blobHook?.(m);
  const top=S.stack[S.stack.length-1];
  if(top && top.type!=="form" && top.type!=="scan") renderSheet();
}
const prodChips = () => `<div class="chips" role="group" aria-label="Ürün"><button type="button" class="chip" data-prod="all" aria-pressed="${S.prod==="all"}">Tüm ürünler</button>${prodList().map(p=>`<button type="button" class="chip" data-prod="${esc(p.id)}" aria-pressed="${S.prod===p.id}">${esc(p.name)}</button>`).join("")}</div>`;

/* --- Ürünler --- */
function modelTable(rows){
  if(!rows.length) return `<div class="empty">Henüz model yok. Ayarlar → Ürünler ve modeller'den ekleyebilir ya da alım girerken yazabilirsin.</div>`;
  const c=v=>v?nf0.format(Math.round(v)):`<span class="muted">—</span>`;
  return `<div class="tablewrap"><table><thead><tr><th>Model</th><th class="r">Sipariş</th><th class="r">Yolda</th><th class="r">Mersin SB</th><th class="r">${today().slice(0,4)} satış</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.model)}</b></td><td class="r">${c(r.ord)}</td><td class="r">${c(r.yol)}</td><td class="r">${r.dep?`${nf0.format(Math.round(r.dep))}<br><span class="muted" style="font-size:12px">$${nf2.format(r.depCost/r.dep)}/kg</span>`:`<span class="muted">—</span>`}</td><td class="r">${r.soldY?`${nf0.format(r.soldY)}<br><span class="muted" style="font-size:12px">ort. $${nf2.format(r.revY/r.soldY)}/kg</span>`:`<span class="muted">—</span>`}</td></tr>`).join("")}</tbody></table></div><div class="muted" style="font-size:12px;padding:6px 14px 10px">Miktarlar kg. Satılan kısım düşülmüş, kalan mal gösterilir.</div>`;
}
function vUrunler(){
  let h=`<div class="vh"><h2>Ürünler</h2>${canWrite&&db?`<button class="btn" type="button" data-act="set-products">Ürün / model düzenle</button>`:""}</div>`;
  const ps=prodList();
  if(!ps.length) return h+`<div class="panel"><div class="empty">Ürün listesi yükleniyor…</div></div>`;
  h+=`<div class="prods">${ps.map(p=>{ const rows=prodStats(p.id).filter(r=>r.ord||r.yol||r.dep||r.soldY||!p.id.startsWith("n:"));
    const n=S.lots.filter(l=>inFirm(l)&&lotHasProd(l,p.id)&&l.status!=="kapandi").length;
    return `<section><div class="prod-h"><h3>${esc(p.name)}</h3><span class="muted">${n?n+" açık alım":"açık alım yok"}</span><button class="btn sm" type="button" data-prodsheet="${esc(p.id)}">Ayrıntı</button></div><div class="panel">${modelTable(rows)}</div></section>`; }).join("")}</div>`;
  return h;
}

/* --- Alımlar --- */
function lotCard(l){
  const c=LC(l); const d=l.eta && (l.status==="yolda"||l.status==="yuklendi") ? days(l.eta) : null;
  const lines=l.items.slice(0,4).map(it=>{ const ci=C.item.get(l.id+"|"+it.k); const left=ci?itemStock(ci):it.kg;
    return `<div>${esc(itemLabel(it))} <span class="muted">· ${nf0.format(+it.kg||0)} kg${(l.status==="depoda"||l.status==="kapandi")&&ci?.soldKg?` · kalan ${nf0.format(Math.max(0,left))}`:""}</span></div>`; }).join("")+(l.items.length>4?`<div class="muted">+${l.items.length-4} satır daha</div>`:"");
  let line3="";
  if(d!==null) line3=`Varış ${fds(l.eta)} · ${d<0?`<span style="color:var(--bad)">${-d} gün gecikti</span>`:d===0?"bugün":d+" gün"}`;
  else if(l.orderDate && STI[l.status]<=1) line3=`Sipariş ${fds(l.orderDate)}`;
  return `<button type="button" class="card" data-lot="${l.id}">
    <div class="top1"><span class="mono muted">${esc(l.code||"—")}</span>${l.ortak?.on?`<span class="badge">Ortak</span>`:firmTag(l.firmId)}</div>
    <div class="prod">${esc(lotSupplier(l))}</div>
    <div class="lines">${lines}</div>
    ${line3?`<div class="meta">${line3}</div>`:""}
    <div class="bar" aria-hidden="true"><i style="width:${Math.round(c.pct*100)}%"></i></div>
    <div class="barl"><span>Ödenen %${Math.round(c.pct*100)}</span><span>${c.due>1?"Kalan "+usdf(c.due):"Ödendi"}</span></div>
  </button>`;
}
function lotMatches(l,q){ if(!q) return true; return key([l.code,lotSupplier(l),l.origin,l.cntNos,l.bl,l.vessel,l.note,...l.items.map(itemLabel)].join(" ")).includes(key(q)); }
function vAlimlar(){
  const lots=S.lots.filter(inFirm).filter(l=>S.prod==="all"||lotHasProd(l,S.prod)).filter(l=>lotMatches(l,S.pq));
  const cnt=k=>lots.filter(l=>l.status===k).length;
  const stages = S.stage==="all" ? ST : ST.filter(s=>s.k===S.stage);
  let h=`<div class="vh"><h2>Alımlar</h2><input class="search" id="pq" type="search" placeholder="Ara: ürün, kod, tedarikçi, konteyner no…" value="${esc(S.pq)}">${canWrite&&db?`<button class="btn pri" type="button" data-act="new-lot">+ Yeni alım</button>`:""}</div>`;
  h+=prodChips();
  h+=`<div class="chips" role="group" aria-label="Aşama"><button type="button" class="chip" data-stage="all" aria-pressed="${S.stage==="all"}">Tüm aşamalar <span class="c">${lots.length}</span></button>${ST.map(s=>`<button type="button" class="chip" data-stage="${s.k}" aria-pressed="${S.stage===s.k}"><span class="dot" style="background:var(--st-${s.k})"></span>${s.s} <span class="c">${cnt(s.k)}</span></button>`).join("")}</div>`;
  if(!S.lots.length) return h+`<div class="panel"><div class="empty">Henüz alım yok. Yurtdışından sipariş verdiğinde <b>+ Yeni alım</b> ile gir. Bir konteynerde birden fazla model varsa her birini ayrı satır olarak fiyatıyla yaz.</div></div>`;
  h+=`<div class="board" style="--cols:${stages.length}">${stages.map(s=>{
    let ls=lots.filter(l=>l.status===s.k).sort((a,b)=>(b.orderDate||b.createdAt||"").localeCompare(a.orderDate||a.createdAt||""));
    const more = s.k==="kapandi" && S.stage==="all" && ls.length>6 ? ls.length-6 : 0; if(more) ls=ls.slice(0,6);
    return `<div class="col"><div class="col-h"><span class="dot" style="background:var(--st-${s.k})"></span>${s.t}<span class="c">${cnt(s.k)}</span></div>${ls.length?ls.map(lotCard).join(""):`<div class="none">Bu aşamada alım yok</div>`}${more?`<button class="btn sm" type="button" data-stage="kapandi">+${more} kapanmış alım</button>`:""}</div>`;
  }).join("")}</div>`;
  return h;
}

/* --- Satışlar --- */
const saleLinesTxt = s => SC(s).lines.map(({ln,ci})=>`${ci?itemLabel(ci.it):"?"} ${nf0.format(+ln.kg||0)} kg`).join(" + ");
function vSatislar(){
  const all=S.sales.filter(inFirm).filter(s=>S.prod==="all"||saleHasProd(s,S.prod));
  const sales=all.filter(s=>S.market==="all"||s.market===S.market).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const cnt=k=>all.filter(s=>s.market===k).length;
  let h=`<div class="vh"><h2>Satışlar</h2>${canWrite&&db?`<button class="btn pri" type="button" data-act="new-sale">+ Yeni satış</button>`:""}</div>`;
  h+=prodChips();
  h+=`<div class="chips" role="group" aria-label="Pazar"><button type="button" class="chip" data-market="all" aria-pressed="${S.market==="all"}">Tüm pazarlar <span class="c">${all.length}</span></button>${Object.entries(MK).map(([k,t])=>`<button type="button" class="chip" data-market="${k}" aria-pressed="${S.market===k}">${t} <span class="c">${cnt(k)}</span></button>`).join("")}</div>`;
  if(!sales.length) return h+`<div class="panel"><div class="empty">${all.length?"Bu seçime uyan satış yok.":"Henüz satış yok. Bir alımdan satış yaptığında <b>+ Yeni satış</b> ile gir; o modelin stoğu otomatik düşer."}</div></div>`;
  h+=`<div class="panel"><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Pazar</th><th>Mallar</th><th class="r">Tutar</th><th class="r">Kalan alacak</th></tr></thead><tbody>${sales.map(s=>{const c=SC(s); return `<tr class="click" data-sale="${s.id}" tabindex="0"><td>${fd(s.date)}</td><td>${esc(saleCustomer(s))}${c.olot?` <span class="badge">Ortak</span>`:""}</td><td>${esc(MK[s.market]||"—")}</td><td style="white-space:normal;min-width:200px">${esc(saleLinesTxt(s))}</td><td class="r">${moneyf(c.tot,s.cur)}${s.cur==="TL"?`<br><span class="muted" style="font-size:12px">${usdf(c.totUSD)}</span>`:""}</td><td class="r" style="color:${c.olot?"var(--muted)":c.due>1?"var(--warn)":"var(--good)"}">${c.olot?"Ortak hesabında":c.due>1?usdf(c.due):"Tahsil edildi"}</td></tr>`;}).join("")}</tbody></table></div></div>`;
  return h;
}

/* --- Cari --- */
function cariData(){
  const sup=new Map(), cus=new Map();
  const g=(m,pk,name,id)=>{ if(!m.has(pk)) m.set(pk,{pk,id,name,a:0,p:0,n:0,last:""}); return m.get(pk); };
  for(const [id,p] of Object.entries(S.parties)) g(p.kind==="supplier"?sup:cus,"i:"+id,p.name,id);
  for(const l of S.lots.filter(inFirm)){ const c=LC(l); const r=g(sup,pkey(l.supplierId,l.supplier),lotSupplier(l),l.supplierId); r.a+=c.costUSD; r.n++;
    if(l.ortak?.on){ const o=g(cus,pkey(l.ortak.partnerId,""),partyName(l.ortak.partnerId),l.ortak.partnerId); o.a+=c.owe||0; o.n++; } }
  for(const s of S.sales.filter(inFirm)){ if(SC(s).olot) continue; const r=g(cus,pkey(s.customerId,s.customer),saleCustomer(s),s.customerId); r.a+=SC(s).totUSD; r.n++; }
  for(const p of S.pays.filter(inFirm)){ const r=g(p.dir==="out"?sup:cus,pkey(p.partyId,p.party),payParty(p),p.partyId); r.p+=usd(p.amount,p.cur,p.kur); if((p.date||"")>r.last) r.last=p.date; }
  const srt=m=>[...m.values()].sort((a,b)=>(b.a-b.p)-(a.a-a.p)||String(a.name).localeCompare(String(b.name),"tr"));
  return {sup:srt(sup), cus:srt(cus)};
}
function vCari(){
  let h=`<div class="vh"><h2>Cari</h2>${canWrite&&db?(S.cari==="mas"?`<button class="btn pri" type="button" data-act="new-exp">+ Masraf</button>`:S.cari==="ted"?`<button class="btn" type="button" data-act="new-party" data-kind="supplier">+ Tedarikçi</button><button class="btn pri" type="button" data-act="new-pay-out">+ Ödeme</button>`:S.cari==="mus"?`<button class="btn" type="button" data-act="new-party" data-kind="customer">+ Müşteri</button><button class="btn pri" type="button" data-act="new-pay-in">+ Tahsilat</button>`:`<button class="btn pri" type="button" data-act="new-pay">+ Ödeme / tahsilat</button>`):""}</div>`;
  h+=`<div class="seg" role="radiogroup" style="max-width:640px">${[["ted","Tedarikçiler"],["mus","Müşteriler"],["mas","Masraflar"],["hep","Tüm ödemeler"]].map(([k,t])=>`<button type="button" role="radio" data-cari="${k}" aria-checked="${S.cari===k}">${t}</button>`).join("")}</div>`;
  if(S.cari==="mas") return h+vMasraf();
  if(S.cari==="hep"){
    const ps=S.pays.filter(inFirm).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    if(!ps.length) return h+`<div class="panel"><div class="empty">Henüz ödeme veya tahsilat yok.</div></div>`;
    return h+`<div class="panel"><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Yön</th><th>Kime / kimden</th><th>Açıklama</th><th>İlgili kayıt</th><th class="r">Tutar</th></tr></thead><tbody>${ps.map(p=>`<tr class="click" data-pay="${p.id}" tabindex="0"><td>${fd(p.date)}</td><td><span class="pill" style="color:${p.dir==="out"?"var(--warn)":"var(--good)"}">${p.dir==="out"?"Ödeme":"Tahsilat"}</span></td><td>${esc(payParty(p))}</td><td>${esc(p.kind||"")}${p.method?` <span class="muted">· ${esc(p.method)}</span>`:""}</td><td class="muted">${esc(payRel(p))}</td><td class="r">${p.dir==="out"?"−":"+"}${moneyf(+p.amount||0,p.cur)}${p.cur==="TL"?`<br><span class="muted" style="font-size:12px">${usdf(usd(p.amount,p.cur,p.kur))} · kur ${nf4.format(+p.kur||0)}</span>`:""}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  const d=cariData(), ted=S.cari==="ted", list=ted?d.sup:d.cus;
  if(!list.length) return h+`<div class="panel"><div class="empty">${ted?"Henüz tedarikçi yok. <b>+ Tedarikçi</b> ile iletişim bilgileriyle birlikte ekle.":"Henüz müşteri yok. <b>+ Müşteri</b> ile ekle. Irak'taki ortak firmanı da buraya müşteri olarak ekle."}</div></div>`;
  const tA=sum(list,r=>r.a), tP=sum(list,r=>r.p);
  h+=`<div class="panel"><div class="tablewrap"><table><thead><tr><th>${ted?"Tedarikçi":"Müşteri / ortak"}</th><th class="r">${ted?"Alış":"Satış / ortak hesap"}</th><th class="r">${ted?"Ödenen":"Tahsil edilen"}</th><th class="r">${ted?"Borcumuz":"Alacağımız"}</th><th class="r">Son ödeme</th></tr></thead><tbody>${list.map(r=>{const b=r.a-r.p; return `<tr class="click" data-party="${esc(r.pk)}" data-pdir="${ted?"out":"in"}" tabindex="0"><td><b>${esc(r.name)}</b>${r.id&&S.parties[r.id]?.country?` <span class="muted">· ${esc(S.parties[r.id].country)}</span>`:""}</td><td class="r">${usdf(r.a)}</td><td class="r">${usdf(r.p)}</td><td class="r" style="color:${b>1?"var(--warn)":b<-1?"var(--firm-b)":"var(--good)"}">${!r.a&&!r.p?`<span class="muted">işlem yok</span>`:b>1?usdf(b):b<-1?usdf(-b)+" avans":"Kapalı"}</td><td class="r">${r.last?fds(r.last):"—"}</td></tr>`;}).join("")}</tbody><tfoot><tr><td>Toplam</td><td class="r">${usdf(tA)}</td><td class="r">${usdf(tP)}</td><td class="r">${usdf(tA-tP)}</td><td></td></tr></tfoot></table></div></div>`;
  h+=`<p class="muted" style="font-size:13px;margin:0">Tutarlar dolar karşılığıdır; TL kayıtlar girildiği günün kuruyla çevrilir. ${ted?"":"Ortak alımlarda alacak, ortağın satışları üzerinden sana dönmesi gereken tutardır (sermaye + masraf + kâr payın)."} Satıra dokununca iletişim bilgileri ve hesap dökümü açılır.</p>`;
  return h;
}
function payRel(p){ if(p.dir==="out"){ const l=lotById(p.lotId); return l?`${l.code} · ${lotProducts(l)}`:"—"; } const s=saleById(p.saleId); if(s) return `${fds(s.date)} satışı`; const l=lotById(p.lotId); return l?`${l.code} ortak hesabı`:"—"; }

/* --- Masraflar --- */
function expRel(x){ const s=saleById(x.saleId), l=lotById(x.lotId); return s?`${fds(s.date)} · ${saleCustomer(s)} satışı`:l?`${l.code} · ${lotProducts(l)}`:"Genel"; }
function vMasraf(){
  const es=S.exps.filter(inFirm).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  if(!es.length) return `<div class="panel"><div class="empty">Henüz masraf yok. Irak gümrüğü, TIR navlunu, gümrükçü ücreti gibi masrafları bir satışa ya da alıma bağlayarak gir; o işin kârından düşer.</div></div>`;
  const yr=today().slice(0,4); const byC={};
  for(const x of es){ if(!(x.date||"").startsWith(yr)) continue; byC[x.cat||"Diğer"]=(byC[x.cat||"Diğer"]||0)+expUSD(x); }
  const cats=Object.entries(byC).sort((a,b)=>b[1]-a[1]); const tot=sum(cats,c=>c[1]);
  let h=`<section><div class="sec-h"><h3>${yr} masrafları türe göre</h3></div><div class="panel">${cats.length?`<div class="tablewrap"><table><tbody>${cats.map(([c,v])=>`<tr><td>${esc(c)}</td><td class="r">${usdf(v)}</td><td class="r muted">%${tot?Math.round(v/tot*100):0}</td></tr>`).join("")}</tbody><tfoot><tr><td>Toplam</td><td class="r">${usdf(tot)}</td><td></td></tr></tfoot></table></div>`:`<div class="empty">Bu yıl masraf yok.</div>`}</div></section>`;
  h+=`<section><div class="sec-h"><h3>Tüm masraflar</h3></div><div class="panel"><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Kime</th><th>İlgili iş</th><th class="r">Tutar</th></tr></thead><tbody>${es.map(x=>`<tr class="click" data-exp="${x.id}" tabindex="0"><td>${fd(x.date)}</td><td>${esc(x.cat||"—")}${x.paidBy==="ortak"?` <span class="badge">ortak ödedi</span>`:""}</td><td>${esc(x.payee||x.party||"—")}</td><td class="muted">${esc(expRel(x))}</td><td class="r">${moneyf(+x.amount||0,x.cur)}${x.cur==="TL"?`<br><span class="muted" style="font-size:12px">${usdf(expUSD(x))}</span>`:""}</td></tr>`).join("")}</tbody></table></div></div></section>`;
  return h;
}

/* --- Arşiv --- */
const docN = r => r.docs?.length ? ` · ${r.docs.length} belge` : "";
function archiveEntries(){
  const out=[];
  for(const l of S.lots.filter(inFirm)) out.push({d:l.orderDate||(l.createdAt||"").slice(0,10),type:"p",ti:`${lotProducts(l)} alımı`,sub:`${l.code||""} · ${lotSupplier(l)}${docN(l)}`,amt:moneyf(LC(l).cost,l.cur),attr:`data-lot="${l.id}"`,txt:[l.code,lotSupplier(l),l.origin,l.cntNos,l.bl,l.vessel,l.note,...l.items.map(itemLabel)].join(" "),prod:p=>lotHasProd(l,p)});
  for(const s of S.sales.filter(inFirm)) out.push({d:s.date,type:"s",ti:`${saleCustomer(s)} · ${MK[s.market]||""}`,sub:`${saleLinesTxt(s)}${docN(s)}`,amt:moneyf(SC(s).tot,s.cur),attr:`data-sale="${s.id}"`,txt:[saleCustomer(s),saleLinesTxt(s),s.docNo,s.plate,s.note,MK[s.market]].join(" "),prod:p=>saleHasProd(s,p)});
  for(const p of S.pays.filter(inFirm)) out.push({d:p.date,type:p.dir==="out"?"o":"t",ti:`${p.dir==="out"?"Ödeme":"Tahsilat"} · ${payParty(p)}`,sub:`${p.kind||""} · ${payRel(p)}${docN(p)}`,amt:(p.dir==="out"?"−":"+")+moneyf(+p.amount||0,p.cur),attr:`data-pay="${p.id}"`,txt:[payParty(p),p.kind,p.method,p.note,payRel(p)].join(" ")});
  for(const x of S.exps.filter(inFirm)) out.push({d:x.date,type:"m",ti:`Masraf · ${x.cat||""}`,sub:`${x.payee?x.payee+" · ":""}${expRel(x)}${docN(x)}`,amt:"−"+moneyf(+x.amount||0,x.cur),attr:`data-exp="${x.id}"`,txt:[x.cat,x.payee,x.note,expRel(x)].join(" ")});
  return out.sort((a,b)=>(b.d||"").localeCompare(a.d||""));
}
const TYL={p:"ALM",s:"SAT",o:"ÖDE",t:"TAH",m:"MSR"};
const entryRow = e => `<button type="button" class="row" ${e.attr}><span class="typeic ${e.type}">${TYL[e.type]}</span><span class="main"><div class="t">${esc(e.ti)}</div><div class="sub">${esc(e.sub)}</div></span><span class="end"><div class="a">${e.amt}</div><div class="b">${fd(e.d)}</div></span></button>`;
function vArsiv(){
  let es=archiveEntries();
  const years=uniq(es.map(e=>(e.d||"").slice(0,4))).reverse();
  if(S.year!=="all") es=es.filter(e=>(e.d||"").startsWith(S.year));
  if(S.atype!=="all") es=es.filter(e=>S.atype==="o"?(e.type==="o"||e.type==="t"):e.type===S.atype);
  if(S.prod!=="all") es=es.filter(e=>e.prod?.(S.prod));
  if(S.q) es=es.filter(e=>key(e.txt+" "+e.ti+" "+e.sub).includes(key(S.q)));
  let h=`<div class="vh"><h2>Arşiv</h2>${dl?`<button class="btn" type="button" data-act="export">Excel'e aktar</button>`:""}</div>`;
  h+=`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><input class="search" id="aq" type="search" placeholder="Ara: müşteri, ürün, model, konteyner, plaka…" value="${esc(S.q)}" style="max-width:none">
    <select id="ay" class="btn" aria-label="Yıl"><option value="all">Tüm yıllar</option>${years.map(y=>`<option ${S.year===y?"selected":""}>${y}</option>`).join("")}</select></div>`;
  h+=prodChips();
  h+=`<div class="chips" role="group" aria-label="Kayıt türü">${[["all","Tüm kayıtlar"],["p","Alımlar"],["s","Satışlar"],["o","Ödemeler"],["m","Masraflar"]].map(([k,t])=>`<button type="button" class="chip" data-atype="${k}" aria-pressed="${S.atype===k}">${t}</button>`).join("")}</div>`;
  if(!es.length) return h+`<div class="panel"><div class="empty">${S.q||S.year!=="all"||S.atype!=="all"||S.prod!=="all"?"Bu aramaya uyan kayıt yok.":"Henüz kayıt yok."}</div></div>`;
  const groups=[]; let cur=null;
  for(const e of es){ const m=(e.d||"").slice(0,7)||"—"; if(!cur||cur.m!==m){cur={m,items:[]};groups.push(cur);} cur.items.push(e); }
  h+=`<div>${groups.map(g=>{const [y,mm]=g.m.split("-"); return `<div class="month">${mm?MONL[+mm-1]+" "+y:"Tarihsiz"} <span style="font-family:var(--f-body);font-size:12px;letter-spacing:0;text-transform:none">· ${g.items.length} kayıt</span></div><div class="panel rows">${g.items.map(entryRow).join("")}</div>`;}).join("")}</div>`;
  return h;
}

/* ---------- isimler ---------- */
async function fillNames(root){
  if(!user) return;
  const els=[...root.querySelectorAll("[data-uid]")]; if(!els.length) return;
  try{ const ps=await user.profiles([...new Set(els.map(e=>e.dataset.uid))]); for(const e of els) e.textContent=ps[e.dataset.uid]?.name||"Bir kullanıcı"; }catch(e){}
}
const who = id => id ? `<span data-uid="${esc(id)}">…</span>` : "";
const byline = r => r.createdAt ? `<p class="muted" style="font-size:13px;margin:0">Ekleyen: ${who(r.createdBy)||"—"} · ${fd(r.createdAt.slice(0,10))}</p>` : "";

/* ---------- sheet yığını ---------- */
function openSheet(d){ const t=S.stack[S.stack.length-1]; if(t?.type==="form") t.v={...t.v,...readForm()}; S.stack.push(d); renderSheet(); }
function closeSheet(){ S.stack.pop(); renderSheet(); }
function closeAll(){ S.stack=[]; renderSheet(); }
const loadingR = t => ({title:t,body:`<div class="empty">Yükleniyor…</div>`});
function renderSheet(){
  const root=document.getElementById("sheetroot");
  const top=S.stack[S.stack.length-1];
  if(!top){ root.innerHTML=""; root.dataset.k=""; document.body.style.overflow=""; return; }
  document.body.style.overflow="hidden";
  const R={lot:()=>sLot(top.id),sale:()=>sSale(top.id),pay:()=>sPay(top.id),exp:()=>sExp(top.id),party:()=>sParty(top.pk,top.dir),prod:()=>sProd(top.id),
    choose:sChoose,settings:sSettings,setprods:sSetProds,users:sUsers,setparties:()=>sSetParties(top.kind),doc:()=>sDoc(top),form:()=>formR(top),scan:()=>sScan(top)};
  let r=(R[top.type]||(()=>null))();
  if(!r) r=loadingR("");
  const k=top.type+"|"+(top.id||top.pk||top.kind||"")+"|"+S.stack.length;
  const same=root.dataset.k===k; const prev=root.querySelector(".sh-body")?.scrollTop||0;
  root.dataset.k=k;
  root.innerHTML=`<div class="scrim" data-act="close-all"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t">
    <div class="sh-head">${S.stack.length>1?`<button class="iconbtn" type="button" data-act="back" aria-label="Geri">${svg('<path d="M15 18l-6-6 6-6"/>',18)}</button>`:""}<h3 id="sh-t">${r.title}</h3><button class="iconbtn" type="button" data-act="close-all" aria-label="Kapat">${svg('<path d="M18 6L6 18M6 6l12 12"/>',18)}</button></div>
    <div class="sh-body">${r.body}</div>${r.foot?`<div class="sh-foot">${r.foot}</div>`:""}</div>`;
  if(same) root.querySelector(".sh-body").scrollTop=prev;
  if(top.type==="scan") mountScan(top);
  if(top.type==="form"){ bindForm(top); if(!same && !top.focused){ top.focused=true; setTimeout(()=>root.querySelector(".sh-body input[type=text]:not([hidden]),.sh-body select")?.focus({preventScroll:true}),30); } }
  fillNames(root); window.__blobHook?.(root);
}
const kvHTML = arr => `<dl class="kv">${arr.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
const exBadge = r => r.ornek?`<span class="pill" style="color:var(--warn)">örnek</span>`:"";

/* --- belgeler --- */
function docsSec(col,rec,hint){
  const docs=rec.docs||[];
  const up = assets&&canWrite ? `<div class="upl"><select id="dkind" aria-label="Belge türü">${DOCK[col].map(k=>`<option>${esc(k)}</option>`).join("")}</select><label class="btn sm pri">${svg(IC_CAM,15)}Belge tara<input type="file" accept="image/*" capture="environment" hidden data-scan="${col}" data-id="${rec.id}"></label><label class="btn sm">${svg(IC_IMG,15)}Galeriden tara<input type="file" accept="image/*" hidden data-scan="${col}" data-id="${rec.id}"></label><label class="btn sm">${svg('<path d="M12 5v14M5 12h14"/>',14)}Dosya ekle<input type="file" accept="image/*,application/pdf" multiple hidden data-upload="${col}" data-id="${rec.id}"></label></div>` : "";
  return `<div class="dsec"><div class="h"><h4>Belgeler</h4>${up}</div>${docs.length?`<div class="docs">${docs.map((d,i)=>`<button type="button" class="doc" data-doc="${col}|${rec.id}|${i}">${d.thumb?`<span class="th"><img ${blobA(d.thumb)} alt="${esc(d.kind)}" loading="lazy"></span>`:d.ct==="application/pdf"?`<span class="th">PDF</span>`:`<span class="th"><img ${blobA(d.id)} alt="${esc(d.kind)}" loading="lazy"></span>`}<span class="dn">${esc(d.kind)}${d.ct==="application/pdf"?` · PDF${d.pages?" "+d.pages+" s.":""}`:""}</span></button>`).join("")}</div>`:`<div class="muted" style="font-size:13px">${assets&&canWrite?hint:"Belge eklenmemiş."}</div>`}</div>`;
}
function sDoc(t){
  const rec=colArr(t.col).find(x=>x.id===t.id); const d=rec?.docs?.[t.i]; if(!d) return null;
  
  const body=`<div class="docview">${d.thumb?`<img ${blobA(d.thumb)} alt="${esc(d.kind)}"><p class="muted" style="font-size:13px;margin:6px 0 0">İlk sayfanın önizlemesi. Tamamı için PDF'i aç${d.pages>1?` (${d.pages} sayfa)`:""}.</p>`:d.ct==="application/pdf"?`<div class="panel"><div class="empty">PDF belgesi${d.name?": "+esc(d.name):""}</div></div>`:`<img ${blobA(d.id)} alt="${esc(d.kind)}">`}</div>
    <a class="btn" ${blobA(d.id,"href")} target="_blank" rel="noopener" style="align-self:flex-start">Yeni sekmede aç</a>
    ${kvHTML([["Tür",esc(d.kind)],["Dosya",esc(d.name||"—")],["Eklenme",fd((d.at||"").slice(0,10))],["Ekleyen",who(d.by)||"—"]])}`;
  const foot=canWrite&&assets?`<span class="sp"></span><button class="btn danger" type="button" data-act="doc-del" data-col="${t.col}" data-id="${t.id}" data-i="${t.i}">Belgeyi sil</button>`:"";
  return {title:esc(d.kind),body,foot};
}
async function compress(file){
  if(!file.type.startsWith("image/") || file.type==="image/gif") return file;
  try{
    const bmp=await createImageBitmap(file); const mx=2200; const sc=Math.min(1,mx/Math.max(bmp.width,bmp.height));
    if(sc===1 && file.size<1.5e6 && /jpe?g|png|webp/.test(file.type)) return file;
    const c=document.createElement("canvas"); c.width=Math.round(bmp.width*sc); c.height=Math.round(bmp.height*sc);
    c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
    return await new Promise(r=>c.toBlob(b=>r(b||file),"image/jpeg",0.85));
  }catch(e){ return file; }
}
const assetErr = e => ({too_large:"Dosya çok büyük (en fazla 20 MB).",unsupported_type:"Bu dosya türü desteklenmiyor. Fotoğraf (JPG/PNG) ya da PDF yükle.",quota_or_state:"Belge depolama alanı doldu.",rate_limited:"Çok hızlı yükleme yapıldı, biraz bekleyip tekrar dene."}[e?.code] || "Belge yüklenemedi. Tekrar dene.");
async function uploadDocs(input){
  const col=input.dataset.upload, id=input.dataset.id, files=[...input.files]; input.value="";
  if(!files.length||!assets) return;
  const kind=document.getElementById("dkind")?.value||DOCK[col][0];
  const rec=colArr(col).find(x=>x.id===id); if(!rec) return;
  const docs=[...(rec.docs||[])]; let ok=0;
  for(const [i,f] of files.entries()){
    toast(`Yükleniyor ${i+1}/${files.length}…`);
    try{ const b=await compress(f); const type=b.type||(/\.pdf$/i.test(f.name)?"application/pdf":"image/jpeg");
      const r=await assets.upload(b,{type}); docs.push({id:r.id,kind,name:String(f.name||"").slice(0,120),ct:r.contentType,at:new Date().toISOString(),by:me||null}); ok++; }
    catch(e){ toast(assetErr(e)); await new Promise(r=>setTimeout(r,1500)); }
  }
  if(ok){ try{ await db.doc(col+"/"+id).update({docs}); toast(ok===1?"Belge eklendi":`${ok} belge eklendi`); }catch(e){ toast(dbErr(e)); } }
}
let docArm=null;
async function delDoc(btn){
  if(docArm!==btn){ docArm=btn; btn.textContent="Emin misin? Kalıcı silinir"; setTimeout(()=>{ if(docArm===btn){ docArm=null; btn.textContent="Belgeyi sil"; } },4000); return; }
  docArm=null; btn.disabled=true;
  const {col,id}=btn.dataset, i=+btn.dataset.i; const rec=colArr(col).find(x=>x.id===id); const d=rec?.docs?.[i]; if(!d) return;
  try{ await db.doc(col+"/"+id).update({docs:rec.docs.filter((_,j)=>j!==i)}); for(const aid of [d.id,d.thumb].filter(Boolean)) try{ await assets.delete(aid); }catch(e){} closeSheet(); toast("Belge silindi"); }
  catch(e){ btn.disabled=false; toast(dbErr(e)); }
}

/* --- alım detayı --- */
function sLot(id){
  const l=lotById(id); if(!l) return null; const c=LC(l); const si=STI[l.status]??0; const sd=l.statusDates||{};
  const step=ST.map((s,i)=>`<button type="button" class="step ${i<=si?"done":""} ${i===si?"cur":""}" style="--sc:var(--st-${l.status})" ${canWrite?`data-setst="${s.k}"`:"disabled"} aria-label="${s.t}"><i></i><span>${s.s}</span><small>${sd[s.k]?fds(sd[s.k]):""}</small></button>`).join("");
  const next=ST[si+1];
  const unit=l.priceUnit==="ton"?"ton":"kg";
  const itRows=l.items.map(it=>{ const ci=C.item.get(l.id+"|"+it.k); const sold=ci?.soldKg||0;
    return `<tr><td><b>${esc(itemProd(it))}</b> ${esc(it.model||"")}</td><td class="r">${nf0.format(+it.kg||0)}</td><td class="r">${sold?nf0.format(sold):`<span class="muted">—</span>`}</td><td class="r">${nf0.format(Math.max(0,(+it.kg||0)-sold))}</td><td class="r">${l.cur==="TL"?nf2.format(+it.price||0)+" ₺":"$"+nf4.format(+it.price||0)}/${unit}</td></tr>`; }).join("");
  const o=l.ortak?.on;
  const money=`<div class="money">
      <div><div class="l">Alış tutarı</div><div class="v">${moneyf(c.cost,l.cur)}</div></div>
      <div><div class="l">Tedarikçiye ödenen</div><div class="v">${usdf(c.paid)}</div></div>
      <div><div class="l">Kalan borç</div><div class="v ${c.due>1?"warn":"good"}">${c.due>1?usdf(c.due):"Yok"}</div></div>
      <div><div class="l">Satış (satılan kısım)</div><div class="v">${c.rev?usdf(c.rev):"—"}</div></div>
      <div><div class="l">Masraflar</div><div class="v">${c.exp?usdf(c.exp):"—"}</div></div>
      <div><div class="l">${o?"Toplam kâr":"Kâr"}</div><div class="v ${c.profit>0?"good":c.profit<0?"bad":""}">${c.soldKg?usdf(c.profit):"—"}</div></div>
    </div>`;
  const ortak = o ? `<div class="dsec"><div class="h"><h4>Ortak hesap · ${esc(partyName(l.ortak.partnerId))} · kâr payımız %${nf0.format(+l.ortak.share||0)}</h4></div>
    <div class="panel"><div class="tablewrap"><table><tbody>
      <tr><td>Satılan malın alış maliyeti</td><td class="r">${usdf(c.soldCost)}</td></tr>
      <tr><td>Bizim ödediğimiz masraflar</td><td class="r">${usdf(c.expUs)}</td></tr>
      ${c.expP?`<tr><td>Ortağın ödediği masraflar</td><td class="r">${usdf(c.expP)}</td></tr>`:""}
      <tr><td>Ortağın bildirdiği satış</td><td class="r">${usdf(c.rev)}</td></tr>
      <tr><td>Toplam kâr</td><td class="r">${usdf(c.profit)}</td></tr>
      <tr><td><b>Bizim kâr payımız</b></td><td class="r"><b>${usdf(c.ourProfit)}</b></td></tr>
      <tr><td><b>Ortağın bize göndermesi gereken</b><br><span class="muted" style="font-size:12px">sermaye + bizim masraflar + kâr payımız</span></td><td class="r"><b>${usdf(c.owe)}</b></td></tr>
      <tr><td>Ortaktan gelen havaleler</td><td class="r">${usdf(c.ogot)}</td></tr>
    </tbody><tfoot><tr><td>Kalan alacak</td><td class="r" style="color:${c.odue>1?"var(--warn)":"var(--good)"}">${c.odue>1?usdf(c.odue):"Yok"}</td></tr></tfoot></table></div></div>
    ${c.soldKg<sum(l.items,it=>+it.kg||0)?`<div class="muted" style="font-size:13px">Henüz satılmamış ${nf0.format(sum(l.items,it=>+it.kg||0)-c.soldKg)} kg var. Rakamlar şu ana kadar bildirilen satışlara göre; mal bitince kesinleşir.</div>`:""}
    ${canWrite?`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="sale-lot" data-id="${l.id}">+ Ortağın satışını gir</button><button class="btn sm" type="button" data-act="pay-ortak" data-id="${l.id}">+ Ortaktan gelen havale</button></div>`:""}
    ${(c.opays||[]).length?`<div class="panel rows">${c.opays.map(payRow).join("")}</div>`:""}</div>` : "";
  const log=(l.log||[]).slice().reverse().map(x=>`<div><time>${fds(x.t)} ${String(x.t).slice(0,4)}</time><span>${esc(x.x)}${x.by?" · "+who(x.by):""}</span></div>`).join("");
  const body=`<div class="dhead"><div class="code"><span>${esc(l.code||"")}</span>${stPill(l.status)}${o?`<span class="badge">Ortak alım</span>`:""}${exBadge(l)}</div><div class="ttl">${esc(lotProducts(l))}</div><div class="muted">${esc(lotSupplier(l))}${l.origin?" · "+esc(l.origin):""}</div></div>
    <div class="stepper" role="group" aria-label="Aşama">${step}</div>
    ${canWrite&&next?`<button class="btn pri" type="button" data-setst="${next.k}">${next.t} olarak işaretle →</button>`:""}
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>Ürün / model</th><th class="r">Alınan kg</th><th class="r">Satılan</th><th class="r">Kalan</th><th class="r">Fiyat</th></tr></thead><tbody>${itRows}</tbody></table></div></div>
    ${money}${ortak}
    ${kvHTML([["Firma",firmTag(l.firmId)],["Tedarikçi",`<button class="btn sm" type="button" data-party="${esc(pkey(l.supplierId,l.supplier))}" data-pdir="out">${esc(lotSupplier(l))}</button>`],["Menşe",esc(l.origin||"—")],["Teslim",esc(l.incoterm||"—")],["Konteyner",l.cnt?`${l.cnt} adet`:"—"],["Konteyner no",l.cntNos?`<span class="mono">${esc(l.cntNos)}</span>`:"—"],["Konşimento (B/L)",l.bl?`<span class="mono">${esc(l.bl)}</span>`:"—"],["Gemi / sefer",esc(l.vessel||"—")],["Sipariş",fd(l.orderDate)],["Yükleme",fd(l.loadDate)],["Tahmini varış",fd(l.eta)],["Mersin'e varış",fd(l.arriveDate)],...(l.cur==="TL"?[["Kur",nf4.format(+l.kur||0)]]:[])])}
    ${l.note?`<div class="note">${esc(l.note)}</div>`:""}
    ${docsSec("lots",l,"Alış faturası, konşimento, menşe şahadetnamesi gibi belgelerin fotoğrafını ya da PDF'ini ekle.")}
    <div class="dsec"><div class="h"><h4>Tedarikçiye ödemeler</h4>${canWrite?`<button class="btn sm" type="button" data-act="pay-lot" data-id="${l.id}">+ Ödeme</button>`:""}</div><div class="panel rows">${c.pays.length?c.pays.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(payRow).join(""):`<div class="empty">Ödeme girilmedi.</div>`}</div></div>
    ${o?"":`<div class="dsec"><div class="h"><h4>Bu alımdan satışlar</h4>${canWrite?`<button class="btn sm" type="button" data-act="sale-lot" data-id="${l.id}">+ Satış</button>`:""}</div><div class="panel rows">${c.sales.length?c.sales.map(saleRow).join(""):`<div class="empty">Henüz satış yok.</div>`}</div></div>`}
    ${o&&c.sales.length?`<div class="dsec"><div class="h"><h4>Ortağın bildirdiği satışlar</h4></div><div class="panel rows">${c.sales.map(saleRow).join("")}</div></div>`:""}
    <div class="dsec"><div class="h"><h4>Alımın masrafları</h4>${canWrite?`<button class="btn sm" type="button" data-act="exp-lot" data-id="${l.id}">+ Masraf</button>`:""}</div><div class="panel rows">${expRows(c.exps)||`<div class="empty">Alıma bağlı masraf yok. Satışa bağlı masraflar (Irak gümrüğü, TIR) satış ekranında görünür ve buradaki kâra dahildir.</div>`}</div></div>
    <div class="dsec"><div class="h"><h4>Geçmiş</h4></div><div class="log">${log||"Kayıt yok"}</div></div>`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-lot" data-id="${l.id}">Düzenle</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="lots" data-id="${l.id}">Sil</button>`:"";
  return {title:esc(l.code||"Alım"),body,foot};
}
const payRow = p => `<button type="button" class="row" data-pay="${p.id}"><span class="typeic ${p.dir==="out"?"o":"t"}">${p.dir==="out"?"ÖDE":"TAH"}</span><span class="main"><div class="t">${esc(p.kind||(p.dir==="out"?"Ödeme":"Tahsilat"))}</div><div class="sub">${fd(p.date)}${p.method?" · "+esc(p.method):""}${docN(p)}</div></span><span class="end"><div class="a">${moneyf(+p.amount||0,p.cur)}</div>${p.cur==="TL"?`<div class="b">${usdf(usd(p.amount,p.cur,p.kur))}</div>`:""}</span></button>`;
const saleRow = s => { const sc=SC(s); return `<button type="button" class="row" data-sale="${s.id}"><span class="typeic s">SAT</span><span class="main"><div class="t">${esc(saleCustomer(s))} · ${esc(MK[s.market]||"")}</div><div class="sub">${fd(s.date)} · ${esc(saleLinesTxt(s))}</div></span><span class="end"><div class="a">${moneyf(sc.tot,s.cur)}</div><div class="b">${sc.olot?"ortak hesabında":sc.due>1?"kalan "+usdf(sc.due):"tahsil edildi"}</div></span></button>`; };
const expRows = es => es.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(x=>`<button type="button" class="row" data-exp="${x.id}"><span class="typeic m">MSR</span><span class="main"><div class="t">${esc(x.cat||"Masraf")}${x.paidBy==="ortak"?` <span class="badge">ortak ödedi</span>`:""}</div><div class="sub">${fd(x.date)}${x.payee?" · "+esc(x.payee):""}${docN(x)}</div></span><span class="end"><div class="a">${moneyf(+x.amount||0,x.cur)}</div>${x.cur==="TL"?`<div class="b">${usdf(expUSD(x))}</div>`:""}</span></button>`).join("");

/* --- satış detayı --- */
function sSale(id){
  const s=saleById(id); if(!s) return null; const c=SC(s);
  const unit=s.priceUnit==="ton"?"ton":"kg";
  const rows=c.lines.map(({ln,ci,amtUSD})=>`<tr><td><b>${ci?esc(itemProd(ci.it)):"?"}</b> ${ci?esc(ci.it.model||""):""}<br><span class="muted mono">${ci?esc(ci.lot.code):""}</span></td><td class="r">${nf0.format(+ln.kg||0)}</td><td class="r">${s.cur==="TL"?nf2.format(+ln.price||0)+" ₺":"$"+nf4.format(+ln.price||0)}/${unit}</td><td class="r">${moneyf((+ln.kg||0)*(+ln.ppk||0),s.cur)}</td><td class="r">${ci?usdf(amtUSD-(+ln.kg||0)*ci.cu):"—"}</td></tr>`).join("");
  const body=`<div class="dhead"><div class="code"><span>${fd(s.date)}</span><span class="pill" style="color:var(--firm-b)">${esc(MK[s.market]||"")}</span>${c.olot?`<span class="badge">Ortak alım satışı</span>`:""}${exBadge(s)}</div><div class="ttl">${esc(saleCustomer(s))}</div></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>Ürün / model</th><th class="r">kg</th><th class="r">Fiyat</th><th class="r">Tutar</th><th class="r">Brüt kâr</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    ${c.olot?`<div class="fnote">Bu satış ortak alım <b>${esc(c.olot.code)}</b> hesabına işlenir. Tahsilatı ortak alımın sayfasından "Ortaktan gelen havale" ile gir.</div>`:`<div class="money"><div><div class="l">Satış tutarı</div><div class="v">${moneyf(c.tot,s.cur)}</div></div><div><div class="l">Tahsil edilen</div><div class="v">${usdf(c.got)}</div></div><div><div class="l">Kalan alacak</div><div class="v ${c.due>1?"warn":"good"}">${c.due>1?usdf(c.due):"Yok"}</div></div></div>`}
    ${kvHTML([["Firma",firmTag(s.firmId)],["Dolar karşılığı",usdf(c.totUSD)+(s.cur==="TL"?` (kur ${nf4.format(+s.kur||0)})`:"")],["Masraflar",c.exp?usdf(c.exp):"—"],["Belge no",esc(s.docNo||"—")],["Araç / plaka",esc(s.plate||"—")]])}
    ${s.note?`<div class="note">${esc(s.note)}</div>`:""}
    ${docsSec("sales",s,"Satış faturası, beyanname ya da CMR fotoğrafını ekle.")}
    ${c.olot?"":`<div class="dsec"><div class="h"><h4>Tahsilatlar</h4>${canWrite?`<button class="btn sm" type="button" data-act="pay-sale" data-id="${s.id}">+ Tahsilat</button>`:""}</div><div class="panel rows">${c.pays.length?c.pays.map(payRow).join(""):`<div class="empty">Tahsilat girilmedi.</div>`}</div></div>`}
    <div class="dsec"><div class="h"><h4>Bu satışın masrafları</h4>${canWrite?`<button class="btn sm" type="button" data-act="exp-sale" data-id="${s.id}">+ Masraf</button>`:""}</div><div class="panel rows">${expRows(c.exps)||`<div class="empty">Irak gümrüğü, TIR navlunu, gümrükçü gibi masrafları buraya ekle.</div>`}</div></div>
    ${byline(s)}`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-sale" data-id="${s.id}">Düzenle</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="sales" data-id="${s.id}">Sil</button>`:"";
  return {title:"Satış",body,foot};
}
/* --- ödeme detayı --- */
function sPay(id){
  const p=S.pays.find(x=>x.id===id); if(!p) return null;
  const s=saleById(p.saleId), l=lotById(p.lotId);
  const rel = s?`<button class="btn sm" type="button" data-sale="${s.id}">${fds(s.date)} · ${esc(saleCustomer(s))}</button>` : l?`<button class="btn sm" type="button" data-lot="${l.id}">${esc(l.code)} · ${esc(lotProducts(l))}</button>` : "—";
  const body=`<div class="dhead"><div class="code"><span>${fd(p.date)}</span><span class="pill" style="color:${p.dir==="out"?"var(--warn)":"var(--good)"}">${p.dir==="out"?"Tedarikçiye ödeme":"Tahsilat"}</span>${exBadge(p)}</div><div class="ttl">${moneyf(+p.amount||0,p.cur)}</div></div>
    ${kvHTML([["Firma",firmTag(p.firmId)],[p.dir==="out"?"Kime":"Kimden",esc(payParty(p))],["Açıklama",esc(p.kind||"—")],["Yöntem",esc(p.method||"—")],["Dolar karşılığı",usdf(usd(p.amount,p.cur,p.kur))+(p.cur==="TL"?` (kur ${nf4.format(+p.kur||0)})`:"")],["İlgili kayıt",rel]])}
    ${p.note?`<div class="note">${esc(p.note)}</div>`:""}
    ${docsSec("pays",p,"Banka dekontunun fotoğrafını ya da PDF'ini ekle.")}
    ${byline(p)}`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-pay" data-id="${p.id}">Düzenle</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="pays" data-id="${p.id}">Sil</button>`:"";
  return {title:p.dir==="out"?"Ödeme":"Tahsilat",body,foot};
}
/* --- masraf detayı --- */
function sExp(id){
  const x=S.exps.find(e=>e.id===id); if(!x) return null; const s=saleById(x.saleId), l=lotById(x.lotId);
  const body=`<div class="dhead"><div class="code"><span>${fd(x.date)}</span><span class="pill" style="color:var(--bad)">Masraf</span>${x.paidBy==="ortak"?`<span class="badge">ortak ödedi</span>`:""}${exBadge(x)}</div><div class="ttl">${moneyf(+x.amount||0,x.cur)}</div></div>
    ${kvHTML([["Tür",esc(x.cat||"—")],["Kime ödendi",esc(x.payee||x.party||"—")],["Firma",firmTag(x.firmId)],["Dolar karşılığı",usdf(expUSD(x))+(x.cur==="TL"?` (kur ${nf4.format(+x.kur||0)})`:"")],["İlgili iş",s?`<button class="btn sm" type="button" data-sale="${s.id}">${fds(s.date)} · ${esc(saleCustomer(s))}</button>`:l?`<button class="btn sm" type="button" data-lot="${l.id}">${esc(l.code)} · ${esc(lotProducts(l))}</button>`:"Genel masraf"],["Belge no",esc(x.docNo||"—")]])}
    ${x.note?`<div class="note">${esc(x.note)}</div>`:""}
    ${docsSec("exps",x,"Masraf faturası ya da makbuzun fotoğrafını ekle.")}
    ${byline(x)}`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-exp" data-id="${x.id}">Düzenle</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="exps" data-id="${x.id}">Sil</button>`:"";
  return {title:"Masraf",body,foot};
}
/* --- firma kartı + ekstre --- */
function contactCard(p,id){
  const web=p.web?String(p.web).trim():""; const href=web?(/^https?:\/\//i.test(web)?web:"https://"+web):"";
  const cp=v=>v?`<button class="btn sm" type="button" data-copy="${esc(v)}">Kopyala</button>`:"";
  const rows=[["İlgili kişi",esc(p.person||"")],["Telefon",p.phone?`${esc(p.phone)}`:"",cp(p.phone)],["E-posta",esc(p.email||""),cp(p.email)],["Web sitesi",href?`<a href="${esc(href)}" target="_blank" rel="noopener">${esc(web)}</a>`:""],["Ülke / şehir",esc([p.country,p.city].filter(Boolean).join(" / "))],["Adres",esc(p.address||"")],["Banka bilgisi",esc(p.bank||"")],["Not",esc(p.note||"")]].filter(r=>r[1]);
  return `<div class="contact">${rows.length?rows.map(([k,v,b])=>`<div class="cr"><span class="ck">${k}</span><span class="cv">${v}</span>${b||""}</div>`).join(""):`<div class="cr"><span class="cv muted">İletişim bilgisi girilmemiş.</span></div>`}</div>${canWrite?`<button class="btn sm" type="button" data-act="edit-party" data-id="${id}" style="align-self:flex-start">Bilgileri düzenle</button>`:""}`;
}
function sParty(pk,dir){
  const id=pk.startsWith("i:")?pk.slice(2):null; const p=id?S.parties[id]:null; const ted=(p?p.kind==="supplier":dir==="out");
  const nm=p?.name||S.pending[id]||pk.slice(2);
  const rows=[];
  if(ted){ for(const l of S.lots.filter(inFirm)) if(pkey(l.supplierId,l.supplier)===pk) rows.push({d:l.orderDate||(l.createdAt||"").slice(0,10),t:`${l.code} · ${l.items.map(itemLabel).join(", ")} alımı`,a:LC(l).costUSD,p:0,attr:`data-lot="${l.id}"`}); }
  else{
    for(const s of S.sales.filter(inFirm)) if(!SC(s).olot && pkey(s.customerId,s.customer)===pk) rows.push({d:s.date,t:`${MK[s.market]||"Satış"} · ${saleLinesTxt(s)}`,a:SC(s).totUSD,p:0,attr:`data-sale="${s.id}"`});
    for(const l of S.lots.filter(inFirm)) if(l.ortak?.on && pkey(l.ortak.partnerId,"")===pk){ const c=LC(l); const lastSale=c.sales.map(s=>s.date).sort().pop(); rows.push({d:lastSale||l.arriveDate||l.orderDate,t:`${l.code} ortak alım · dönmesi gereken (sermaye + masraf + %${nf0.format(+l.ortak.share||0)} kâr)`,a:c.owe||0,p:0,attr:`data-lot="${l.id}"`}); }
  }
  for(const x of S.pays.filter(inFirm)) if(x.dir===(ted?"out":"in") && pkey(x.partyId,x.party)===pk) rows.push({d:x.date,t:`${ted?"Ödeme":"Tahsilat"}${x.kind?" · "+x.kind:""}${x.cur==="TL"?` (${moneyf(+x.amount||0,"TL")})`:""}`,a:0,p:usd(x.amount,x.cur,x.kur),attr:`data-pay="${x.id}"`});
  rows.sort((a,b)=>(a.d||"").localeCompare(b.d||""));
  let bal=0;
  const body=`${p?contactCard(p,id):""}
   <div class="dsec"><div class="h"><h4>Hesap dökümü</h4>${canWrite?`<button class="btn sm" type="button" data-act="pay-party" data-pk="${esc(pk)}" data-dir="${ted?"out":"in"}">+ ${ted?"Ödeme":"Tahsilat"}</button>`:""}</div>
   ${rows.length?`<div class="panel"><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th class="r">${ted?"Alış":"Borç"}</th><th class="r">${ted?"Ödeme":"Tahsilat"}</th><th class="r">Bakiye</th></tr></thead><tbody>${rows.map(r=>{bal+=r.a-r.p; return `<tr class="click" ${r.attr} tabindex="0"><td>${fds(r.d)} ${String(r.d||"").slice(0,4)}</td><td style="white-space:normal;min-width:180px">${esc(r.t)}</td><td class="r">${r.a?usdf(r.a):""}</td><td class="r">${r.p?usdf(r.p):""}</td><td class="r"><b>${usdf(bal)}</b></td></tr>`;}).join("")}</tbody></table></div></div><p class="muted" style="font-size:13px;margin:0">Tutarlar dolar karşılığıdır. ${ted?"Alışlar borcunu artırır, ödemeler azaltır.":"Satışlar alacağını artırır, tahsilatlar azaltır."}</p>`:`<div class="panel"><div class="empty">Bu firmayla henüz işlem yok.</div></div>`}</div>`;
  return {title:esc(nm),body};
}
/* --- ürün sayfası --- */
function sProd(pid){
  const p=prodList().find(x=>x.id===pid); if(!p) return null;
  const lots=S.lots.filter(l=>inFirm(l)&&lotHasProd(l,pid)).sort((a,b)=>(b.orderDate||"").localeCompare(a.orderDate||""));
  const sales=S.sales.filter(s=>inFirm(s)&&saleHasProd(s,pid)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const lotRow=l=>`<button type="button" class="row" data-lot="${l.id}"><span class="main"><div class="t">${esc(l.code)} · ${esc(lotSupplier(l))}</div><div class="sub">${l.items.filter(it=>matchProd(it,pid)).map(it=>{const ci=C.item.get(l.id+"|"+it.k); return `${it.model||"model yok"} ${nf0.format(+it.kg||0)} kg${ci?.soldKg?` (kalan ${nf0.format(Math.max(0,itemStock(ci)))})`:""}`;}).join(" · ")}</div></span><span class="end"><div class="a">${stPill(l.status)}</div><div class="b">${fd(l.orderDate)}</div></span></button>`;
  const body=`<div class="panel">${modelTable(prodStats(pid))}</div>
    <div class="dsec"><div class="h"><h4>Alımlar</h4></div><div class="panel rows">${lots.length?lots.map(lotRow).join(""):`<div class="empty">Bu ürünün alımı yok.</div>`}</div></div>
    <div class="dsec"><div class="h"><h4>Satışlar</h4></div><div class="panel rows">${sales.length?sales.slice(0,40).map(saleRow).join(""):`<div class="empty">Bu ürünün satışı yok.</div>`}</div></div>`;
  return {title:esc(p.name),body};
}
/* --- ekle seçici --- */
function sChoose(){
  const b=(act,ic,t,s)=>`<button type="button" data-act="${act}">${svg(ic,28)}<div><b>${t}</b><span>${s}</span></div></button>`;
  return {title:"Ne eklemek istiyorsun?",body:`<div class="chooser">
    ${b("new-lot",'<rect x="2" y="6" width="20" height="13" rx="1.5"/><path d="M7 9v7M12 9v7M17 9v7"/>',"Yeni alım","Yurtdışından sipariş verdiğin mal; ortak alım da buradan")}
    ${b("new-pay-out",'<path d="M12 19V5M5 12l7-7 7 7"/>',"Tedarikçiye ödeme","Ön ödeme, ara ödeme ya da bakiye")}
    ${b("new-sale",'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',"Satış","Irak'a, iç piyasaya ya da ihracat")}
    ${b("new-pay-in",'<path d="M12 5v14M19 12l-7 7-7-7"/>',"Tahsilat","Müşteriden ya da ortaktan gelen para")}
    ${b("new-exp",'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',"Masraf","Irak gümrüğü, TIR navlunu, gümrükçü, ihracat masrafı")}
  </div>`};
}
/* --- ayarlar --- */
function sSettings(){
  const r=(act,t,s,extra="")=>`<button type="button" class="row" data-act="${act}" ${extra}><span class="main"><div class="t">${t}</div><div class="sub">${s}</div></span><span class="end muted">›</span></button>`;
  const body=`<div class="panel menu">
      ${r("set-firms","Firmalar",`${esc(firmName("a"))} · ${esc(firmName("b"))}`)}
      ${r("set-products","Ürünler ve modeller",esc(productsSorted().map(p=>p.name).join(", ")||"—"))}
      ${r("set-origins","Menşe ülkeleri",esc(lists("origins").slice(0,6).join(", "))+(lists("origins").length>6?"…":""))}
      ${r("set-parties","Tedarikçiler",`${partiesOf("supplier").length} kayıt · telefon, e-posta, web, ilgili kişi`,'data-kind="supplier"')}
      ${r("set-parties","Müşteriler ve ortaklar",`${partiesOf("customer").length} kayıt`,'data-kind="customer"')}
      ${r("set-expcats","Masraf türleri",esc(lists("expcats").slice(0,4).join(", "))+"…")}
      ${window.__members?r("set-users","Kullanıcılar",window.__members.me.role==="owner"?"Defteri kimlerin kullanabileceği":"Defteri kullananlar"):""}
    </div>
    <div class="dsec"><div class="h"><h4>Dışa aktar</h4></div><p class="muted" style="margin:0;font-size:14px">Bütün alımlar, satışlar, ödemeler, masraflar, cari ve ürün stokları tek Excel dosyasında. Mali müşavire göndermek ya da yedek almak için.</p>${dl?`<button class="btn" type="button" data-act="export" style="align-self:flex-start">Excel'e aktar</button>`:`<p class="muted" style="margin:0;font-size:13px">Dışa aktarma bu görünümde kullanılamıyor.</p>`}</div>
    <div class="dsec"><div class="h"><h4>Hesap</h4></div><p class="muted" style="margin:0;font-size:14px">Giriş yapan: <b>${esc(window.__members?.me.email||"")}</b></p><button class="btn" type="button" data-act="logout" style="align-self:flex-start">Çıkış yap</button></div>
    ${canWrite&&hasEx()?`<div class="dsec"><div class="h"><h4>Örnek kayıtlar</h4></div><button class="btn danger" type="button" data-act="clear-ex" style="align-self:flex-start">Örnek kayıtları sil</button></div>`:""}`;
  return {title:"Ayarlar",body};
}
function sUsers(){
  const M=window.__members; const owner=M.me.role==="owner"; const list=S.members;
  const RL={owner:"Sahip",editor:"Kayıt girebilir",viewer:"Sadece görür"};
  const body=`<p class="muted" style="margin:0;font-size:14px">Buraya eklediğin e-posta sahibi, <b>${esc(location.host)}</b> adresinde aynı e-postayla "Hesap oluştur" deyip şifresini belirler ve girer. Listede olmayan kimse kayıtları göremez.</p>
    <div class="panel rows">${list?list.map(u=>`<div class="row"><span class="main"><div class="t">${esc(u.name||u.email)}</div><div class="sub">${esc(u.email)} · ${RL[u.role]||u.role}</div></span>${owner&&u.role!=="owner"?`<button class="btn sm danger" type="button" data-act="user-del" data-email="${esc(u.email)}">Çıkar</button>`:""}</div>`).join(""):`<div class="empty">Yükleniyor…</div>`}</div>
    ${owner?`<button class="btn pri" type="button" data-act="user-add" style="align-self:flex-start">+ Kullanıcı ekle</button>`:""}`;
  return {title:"Kullanıcılar",body};
}
async function loadMembers(){ try{ S.members=await window.__members.list(); }catch(e){ S.members=[]; toast("Kullanıcı listesi alınamadı."); } const t=S.stack[S.stack.length-1]; if(t?.type==="users") renderSheet(); }
function userForm(){
  openForm({title:"Kullanıcı ekle",values:{role:"editor"},fields:[
    {k:"email",label:"E-posta",req:true,itype:"email",im:"email"},
    {k:"name",label:"Adı (listede görünür)"},
    {k:"role",label:"Yetki",type:"seg",options:[["editor","Kayıt girebilir"],["viewer","Sadece görür"]]},
  ],onSave:async v=>{ if(!/^\S+@\S+\.\S+$/.test(v.email)) return "Geçerli bir e-posta yaz."; try{ await window.__members.add(v.email.toLowerCase(),v.role,v.name||""); }catch(e){ return "Eklenemedi: "+(e?.message||"bilinmeyen hata"); } loadMembers(); }});
}
function sSetProds(){
  const ps=productsSorted();
  const body=`<p class="muted" style="margin:0;font-size:14px">Ürüne dokunup adını ve modellerini düzenle. Alım girerken yeni bir model yazarsan o da otomatik listeye eklenir.</p>
    <div class="panel rows">${ps.map(p=>`<button type="button" class="row" data-act="edit-product" data-id="${p.id}"><span class="main"><div class="t">${esc(p.name)}</div><div class="sub">${p.models?.length?esc(p.models.join(" · ")):"Model eklenmemiş"}</div></span><span class="end muted">›</span></button>`).join("")||`<div class="empty">Ürün yok.</div>`}</div>
    ${canWrite?`<button class="btn pri" type="button" data-act="new-product" style="align-self:flex-start">+ Yeni ürün</button>`:""}`;
  return {title:"Ürünler ve modeller",body};
}
function sSetParties(kind){
  const ps=partiesOf(kind);
  const body=`<div class="panel rows">${ps.map(p=>`<button type="button" class="row" data-party="i:${p.id}" data-pdir="${kind==="supplier"?"out":"in"}"><span class="main"><div class="t">${esc(p.name)}${p.ornek?` <span class="pill" style="color:var(--warn)">örnek</span>`:""}</div><div class="sub">${esc([p.person,p.phone,p.email,p.country].filter(Boolean).join(" · ")||"İletişim bilgisi yok")}</div></span><span class="end muted">›</span></button>`).join("")||`<div class="empty">Henüz kayıt yok.</div>`}</div>
    ${canWrite?`<button class="btn pri" type="button" data-act="new-party" data-kind="${kind}" style="align-self:flex-start">+ Yeni ${kind==="supplier"?"tedarikçi":"müşteri / ortak"}</button>`:""}`;
  return {title:kind==="supplier"?"Tedarikçiler":"Müşteriler ve ortaklar",body};
}

/* ---------- formlar ---------- */
function openForm(o){ openSheet({type:"form",o,v:JSON.parse(JSON.stringify(o.values||{}))}); }
function formR(d){ return {title:d.o.title, body:`<form class="form" id="frm" novalidate>${d.o.fields.map(f=>fieldHTML(f,d.v)).join("")}</form>`,
  foot:`<div class="ferr" id="ferr" hidden></div>${d.o.onDelete?`<button class="btn danger" type="button" data-act="form-del">Sil</button>`:""}<button class="btn" type="button" data-act="back">Vazgeç</button><span class="sp"></span><button class="btn pri" type="button" data-act="form-save">Kaydet</button>`}; }
function selOptions(f,v,val){
  let opts=typeof f.options==="function"?f.options(v):f.options;
  if(val!==""&&val!=null&&!opts.some(o=>String(o[0])===String(val))) opts=[...opts,[val,f.labelOf?f.labelOf(val):val]];
  if(f.quick && canWrite) opts=[...opts,["__new",f.quickLabel||"+ Yeni ekle…"]];
  return opts;
}
function fieldHTML(f,v){
  if(f.section) return `<h4 class="fsec" ${f.showIf?`data-f="${f.section}" data-sec="1"`:""}>${f.section}</h4>`;
  if(f.type==="note") return `<div class="fnote" data-f="${f.k}">${f.text}</div>`;
  if(f.type==="lotitems") return lotItemsHTML(f,v);
  if(f.type==="saleitems") return saleItemsHTML(f,v);
  const id="f_"+f.k; let val=v[f.k]; if(val===undefined||val===null) val=f.def??"";
  const cls=`fld ${f.half?"half":""} ${f.third?"third":""}`;
  const lbl=f.label?`<span class="lbl">${f.label}${f.req?" *":""}</span>`:"";
  const hint=f.hint?`<span class="hint">${f.hint}</span>`:"";
  if(f.type==="seg") return `<div class="${cls}" data-f="${f.k}">${lbl}<div class="seg" role="radiogroup" aria-label="${esc(f.label||f.k)}" data-k="${f.k}" data-t="seg">${f.options.map(([o,t])=>`<button type="button" role="radio" aria-checked="${String(val)===String(o)}" data-v="${esc(o)}">${esc(t)}</button>`).join("")}</div>${hint}</div>`;
  let inp;
  if(f.type==="select") inp=`<select id="${id}" data-k="${f.k}" ${f.quick?`data-quick="${f.quick}"`:""}>${selOptions(f,v,val).map(o=>opt(o,val)).join("")}</select>`;
  else if(f.type==="textarea") inp=`<textarea id="${id}" data-k="${f.k}" rows="${f.rows||3}" ${f.ph?`placeholder="${esc(f.ph)}"`:""}>${esc(val)}</textarea>`;
  else if(f.type==="num") inp=`<input id="${id}" data-k="${f.k}" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(val))}" ${f.ph?`placeholder="${esc(f.ph)}"`:""}>`;
  else if(f.type==="date") inp=`<input id="${id}" data-k="${f.k}" type="date" value="${esc(val)}">`;
  else { const list=typeof f.list==="function"?f.list(v):f.list; inp=`<input id="${id}" data-k="${f.k}" type="${f.itype||"text"}" ${f.im?`inputmode="${f.im}"`:""} autocomplete="off" value="${esc(val)}" ${list?`list="dl_${f.k}"`:""} ${f.ph?`placeholder="${esc(f.ph)}"`:""}>${list?`<datalist id="dl_${f.k}">${list.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>`:""}`; }
  return `<label class="${cls}" data-f="${f.k}">${lbl}${inp}${hint}</label>`;
}
function lotItemsHTML(f,v){
  const items=v.items&&v.items.length?v.items:[{}];
  const pOpts=[["","Ürün seç…"],...productsSorted().map(p=>[p.id,p.name])];
  const rows=items.map((it,i)=>{ let po=pOpts; if(it.productId&&!po.some(o=>o[0]===it.productId)) po=[...po,[it.productId,prodName(it.productId)]]; if(canWrite) po=[...po,["__new","+ Yeni ürün…"]];
    return `<div class="irow" data-row="${i}" data-rk="${esc(it.k||"")}">
    <label class="wide">Ürün<select data-ik="productId" data-rowsel="${i}">${po.map(o=>opt(o,it.productId)).join("")}</select></label>
    <label>Model<input data-ik="model" type="text" list="ml_${i}" autocomplete="off" value="${esc(it.model||"")}" placeholder="ör. W320"><datalist id="ml_${i}">${modelsOf(it.productId).map(m=>`<option value="${esc(m)}">`).join("")}</datalist></label>
    <label>Miktar (kg)<input data-ik="kg" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.kg))}"></label>
    <label>Fiyat<input data-ik="price" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.price))}"></label>
    <button type="button" class="iconbtn" data-act="row-del" data-i="${i}" aria-label="Satırı sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',16)}</button></div>`; }).join("");
  return `<div class="fld" data-f="items"><span class="lbl">${f.label}</span><div class="items">${rows}</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn sm" type="button" data-act="row-add">+ ${f.addLabel}</button><span class="hint" id="itot"></span></div></div>`;
}
function stockOptions(v,curSale){
  const groups=new Map();
  const extra=new Map(); if(curSale) for(const ln of curSale.items) extra.set(ln.lotId+"|"+ln.ik,(extra.get(ln.lotId+"|"+ln.ik)||0)+(+ln.kg||0));
  const chosen=new Set((v.items||[]).map(r=>r.ref).filter(Boolean));
  for(const [ref,ci] of C.item){
    const left=itemStock(ci)+(extra.get(ref)||0);
    if(!(left>0.0001) && !chosen.has(ref)) continue;
    if(ci.lot.status==="kapandi" && !chosen.has(ref)) continue;
    const g=itemProd(ci.it); if(!groups.has(g)) groups.set(g,[]);
    groups.get(g).push([ref,`${ci.it.model||"model yok"} · ${ci.lot.code} · ${nf0.format(Math.max(0,left))} kg kaldı · ${ci.lot.ortak?.on?"ORTAK":firmName(ci.lot.firmId)}${STI[ci.lot.status]<4?" · "+ST[STI[ci.lot.status]].s:""}`]);
  }
  return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],"tr"));
}
function saleItemsHTML(f,v){
  const items=v.items&&v.items.length?v.items:[{}];
  const groups=stockOptions(v,v.__orig);
  const rows=items.map((it,i)=>`<div class="irow sale" data-row="${i}">
    <label class="wide">Stoktaki mal<select data-ik="ref"><option value="">Seç…</option>${groups.map(([g,os])=>`<optgroup label="${esc(g)}">${os.map(o=>opt(o,it.ref)).join("")}</optgroup>`).join("")}</select></label>
    <label>Miktar (kg)<input data-ik="kg" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.kg))}"></label>
    <label>Fiyat<input data-ik="price" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.price))}"></label>
    <button type="button" class="iconbtn" data-act="row-del" data-i="${i}" aria-label="Kalemi sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',16)}</button></div>`).join("");
  return `<div class="fld" data-f="items"><span class="lbl">${f.label}</span>${groups.length?"":`<span class="hint" style="color:var(--warn)">Stokta satılacak mal görünmüyor. Önce alım gir.</span>`}<div class="items">${rows}</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn sm" type="button" data-act="row-add">+ ${f.addLabel}</button><span class="hint" id="itot"></span></div></div>`;
}
function readForm(){
  const v={}; const f=document.getElementById("frm"); if(!f) return v;
  f.querySelectorAll("[data-k]").forEach(el=>{
    const k=el.dataset.k;
    if(el.dataset.t==="seg") v[k]=el.querySelector('[aria-checked="true"]')?.dataset.v ?? "";
    else if(el.dataset.t==="num") v[k]=parseNum(el.value);
    else v[k]=el.value.trim();
  });
  const rows=[...f.querySelectorAll(".irow")];
  if(rows.length){ v.items=rows.map(r=>{ const o={}; if(r.dataset.rk) o.k=r.dataset.rk; r.querySelectorAll("[data-ik]").forEach(e=>{ o[e.dataset.ik]=e.dataset.t==="num"?parseNum(e.value):e.value.trim(); }); return o; }); }
  return v;
}
function bindForm(d){
  const f=document.getElementById("frm"); if(!f) return;
  const upd=()=>{ const v=readForm(); for(const fl of d.o.fields){ if(!fl.showIf) continue; const el=f.querySelector(`[data-f="${fl.section||fl.k}"]`); if(el) el.hidden=!fl.showIf(v); } d.o.onChange?.(v,f); };
  f.addEventListener("click",e=>{ const b=e.target.closest(".seg button"); if(!b) return; b.parentElement.querySelectorAll("button").forEach(x=>x.setAttribute("aria-checked",String(x===b))); upd(); });
  f.addEventListener("input",upd);
  f.addEventListener("change",e=>{
    const t=e.target;
    if(t.tagName==="SELECT" && t.value==="__new"){
      t.value="";
      if(t.dataset.rowsel!==undefined){ const i=+t.dataset.rowsel; return quickAdd("product",(v,id)=>{ if(v.items?.[i]) v.items[i].productId=id; }); }
      if(t.dataset.quick){ const k=t.dataset.k; return quickAdd(t.dataset.quick,(v,id)=>{ v[k]=id; }); }
    }
    if(t.dataset.rowsel!==undefined){ const dlEl=f.querySelector(`#ml_${t.dataset.rowsel}`); if(dlEl) dlEl.innerHTML=modelsOf(t.value).map(m=>`<option value="${esc(m)}">`).join(""); }
    upd();
  });
  f.addEventListener("submit",e=>e.preventDefault());
  upd();
}
function quickAdd(kind,assign){
  const parent=S.stack[S.stack.length-1]; parent.v={...parent.v,...readForm()};
  const done=(id,name)=>{ S.pending[id]=name; assign(parent.v,id); };
  if(kind==="supplier"||kind==="customer") partyForm(null,kind,done);
  else if(kind==="product") productForm(null,done);
  else listAddForm(kind,done);
}
async function formSave(){
  const top=S.stack[S.stack.length-1]; if(top?.type!=="form") return;
  const v={...top.v,...readForm()}; const err=document.getElementById("ferr");
  const fail=m=>{ err.textContent=m; err.hidden=false; };
  for(const fl of top.o.fields){ if(fl.section||fl.type==="note"||fl.type==="lotitems"||fl.type==="saleitems") continue; if(fl.showIf&&!fl.showIf(v)) continue;
    const x=v[fl.k]; if(fl.req && (x===""||x===null||x===undefined)) return fail(`"${fl.label}" boş olamaz.`);
    if(fl.type==="num" && Number.isNaN(x)) return fail(`"${fl.label}" sayı olmalı. Örnek: 12.500 ya da 7,45`); }
  if(v.items) for(const it of v.items) for(const k of ["kg","price"]) if(Number.isNaN(it[k])) return fail("Miktar ve fiyat sayı olmalı. Örnek: 12.500 ya da 7,45");
  const btn=document.querySelector('[data-act="form-save"]'); btn.disabled=true; btn.textContent="Kaydediliyor…";
  try{ const r=await top.o.onSave(v); if(typeof r==="string"){ btn.disabled=false; btn.textContent="Kaydet"; return fail(r); }
    S.stack.pop(); if(typeof r==="object"&&r?.open){ S.stack.push(r.open); } renderSheet(); toast("Kaydedildi"); }
  catch(e){ btn.disabled=false; btn.textContent="Kaydet"; fail(dbErr(e)); }
}
let formDelArm=false;
async function formDelete(btn){
  const top=S.stack[S.stack.length-1]; if(!top?.o?.onDelete) return;
  if(!formDelArm){ formDelArm=true; btn.textContent="Emin misin? Sil"; setTimeout(()=>{formDelArm=false; btn.textContent="Sil";},4000); return; }
  formDelArm=false; btn.disabled=true;
  try{ const r=await top.o.onDelete(); if(typeof r==="string"){ btn.disabled=false; btn.textContent="Sil"; const e=document.getElementById("ferr"); e.textContent=r; e.hidden=false; return; } S.stack.pop(); if(S.stack[S.stack.length-1]?.type==="party") S.stack.pop(); renderSheet(); toast("Silindi"); }
  catch(e){ btn.disabled=false; toast(dbErr(e)); }
}
const dbErr = e => { const c=e?.code; if(c==="invalid_argument") return "Bu kaydı değiştirme iznin yok ya da kayıt hatalı. Sayfa sahibinden Düzenleyen yetkisi iste."; if(c==="quota_exceeded") return "Kayıt alanı doldu."; if(c==="resource_exhausted") return "Çok hızlı işlem yapıldı. Birkaç saniye bekleyip tekrar dene."; return "Kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene."; };
function lastKur(){ try{ return parseNum(localStorage.getItem("pd.kur")); }catch(e){ return null; } }
function rememberKur(k){ if(k>0) save("pd.kur",String(k)); }
const stamp = (o,isNew) => { const n=new Date().toISOString(); if(isNew){ o.createdAt=n; o.createdBy=me||null; } o.updatedAt=n; o.updatedBy=me||null; return o; };
const addLog = (l,x) => [...(l.log||[]), {t:new Date().toISOString(), by:me||null, x}].slice(-80);
const defFirm = () => S.firm==="all" ? "a" : S.firm;
const firmSeg = (extra={}) => ({k:"firmId",label:"Hangi firma üzerinden?",type:"seg",options:[["a",firmName("a")],["b",firmName("b")]],...extra});
const curFields = (unit=true) => [
  ...(unit?[{k:"priceUnit",label:"Fiyat birimi",type:"seg",options:[["kg","/ kg"],["ton","/ ton"]],half:true,def:"kg"}]:[]),
  {k:"cur",label:"Para birimi",type:"seg",options:[["USD","USD $"],["TL","TL ₺"]],def:"USD",half:true},
  {k:"kur",label:"Kur (1 $ = ? ₺)",type:"num",half:true,req:true,showIf:v=>v.cur==="TL",def:lastKur()??"",hint:"Dolar karşılığı bu kurla hesaplanır"},
];
const partySel = (k,kind,label,extra={}) => ({k,label,type:"select",quick:kind,quickLabel:kind==="supplier"?"+ Yeni tedarikçi ekle…":"+ Yeni müşteri / ortak ekle…",options:()=>[["","Seç…"],...partiesOf(kind).map(p=>[p.id,p.name])],labelOf:id=>partyName(id),...extra});
const listSel = (k,lk,label,extra={}) => ({k,label,type:"select",quick:lk,quickLabel:lk==="origins"?"+ Yeni ülke ekle…":"+ Yeni masraf türü ekle…",options:()=>[["","Seç…"],...lists(lk).map(x=>[x,x])],...extra});

/* --- alım formu --- */
function lotForm(l){
  const isNew=!l;
  const v=l?{...l,items:l.items.map(it=>({...it})),ortakOn:l.ortak?.on?"1":"0",partnerId:l.ortak?.partnerId||"",share:l.ortak?.share??50,supplierId:l.supplierId||""}
           :{firmId:defFirm(),status:"siparis",incoterm:"CIF Mersin",orderDate:today(),cur:"USD",priceUnit:"kg",cnt:1,items:[{}],ortakOn:"0",share:50};
  openForm({title:isNew?"Yeni alım":"Alımı düzenle", values:v, fields:[
    {section:"Alım"},
    firmSeg(),
    partySel("supplierId","supplier","Tedarikçi",{req:true}),
    listSel("origin","origins","Menşe"),
    {k:"items",type:"lotitems",label:"Ürünler — her model ayrı satır, kendi fiyatıyla",addLabel:"Model / ürün ekle"},
    ...curFields(),
    {k:"incoterm",label:"Teslim şekli",half:true,list:["CIF Mersin","CFR Mersin","FOB","EXW"]},
    {section:"Ortak alım"},
    {k:"ortakOn",label:"Bu alım Irak'taki bir firmayla ortak mı?",type:"seg",options:[["0","Hayır, sadece bizim"],["1","Evet, ortak alım"]]},
    partySel("partnerId","customer","Ortak firma",{showIf:x=>x.ortakOn==="1",req:true,half:true}),
    {k:"share",label:"Bizim kâr payımız (%)",type:"num",half:true,showIf:x=>x.ortakOn==="1",req:true},
    {k:"onote",type:"note",showIf:x=>x.ortakOn==="1",text:"Mal bizim firmamız üzerine alınır, alış ve masrafları biz öderiz. Ortak malı orada satar; sen ortağın satışlarını bu alıma girersin. Sistem ortağın sana göndermesi gerekeni hesaplar: <b>sermaye + bizim masraflar + kâr payımız</b>. Gelen havaleleri bu alımın sayfasından girersin."},
    {section:"Sevkiyat"},
    {k:"status",label:"Aşama",type:"select",options:ST.map(s=>[s.k,s.t])},
    {k:"cnt",label:"Konteyner sayısı",type:"num",third:true},
    {k:"cntNos",label:"Konteyner no",third:true,ph:"MSCU1234567"},
    {k:"bl",label:"Konşimento no",third:true},
    {k:"vessel",label:"Gemi / sefer"},
    {section:"Tarihler"},
    {k:"orderDate",label:"Sipariş",type:"date",half:true},
    {k:"loadDate",label:"Yükleme",type:"date",half:true},
    {k:"eta",label:"Tahmini varış",type:"date",half:true},
    {k:"arriveDate",label:"Mersin'e varış",type:"date",half:true},
    {section:"Not"},
    {k:"note",label:"Not",type:"textarea"},
  ], onChange:(x,f)=>{
    const t=f.querySelector("#itot"); if(!t) return; const its=(x.items||[]).filter(it=>it.kg>0&&it.price>0);
    const tot=sum(its,it=>it.kg*(x.priceUnit==="ton"?it.price/1000:it.price)); t.textContent=tot?`Toplam alış: ${moneyf(tot,x.cur)}`:"";
  },
  onSave: async x=>{
    let items=(x.items||[]).filter(it=>it.productId||it.kg||it.model||it.price);
    if(!items.length) return "En az bir ürün satırı gir.";
    for(const [i,it] of items.entries()){ if(!it.productId) return `${i+1}. satırda ürün seç.`; if(!(it.kg>0)) return `${i+1}. satırda miktar gir.`; if(it.price==null) return `${i+1}. satırda fiyat gir.`; }
    let mx=0; items.forEach(it=>{ const n=parseInt(String(it.k||"").slice(1),10)||0; if(n>mx) mx=n; });
    items=items.map(it=>({k:it.k||("i"+(++mx)),productId:it.productId,model:it.model||"",kg:it.kg,price:it.price,ppk:x.priceUnit==="ton"?it.price/1000:it.price}));
    if(l){ const keep=new Map(items.map(it=>[it.k,it]));
      for(const old of l.items){ const ci=C.item.get(l.id+"|"+old.k); const sold=ci?.soldKg||0; if(!sold) continue;
        const nw=keep.get(old.k); if(!nw) return `${itemLabel(old)} satırından ${nf0.format(sold)} kg satılmış; bu satırı silemezsin.`;
        if(nw.kg<sold) return `${itemLabel(old)} için ${nf0.format(sold)} kg satılmış; miktar bundan az olamaz.`; } }
    const ortak = x.ortakOn==="1" ? {on:true,partnerId:x.partnerId,share:x.share??50} : null;
    if(ortak && !(ortak.share>=0 && ortak.share<=100)) return "Kâr payı 0 ile 100 arasında olmalı.";
    if(x.cur==="TL") rememberKur(x.kur);
    const doc={...(l||{})}; delete doc.id; for(const k of ["product","kg","price","ppk","supplier","model"]) delete doc[k];
    Object.assign(doc,{firmId:x.firmId,supplierId:x.supplierId,origin:x.origin||"",items,priceUnit:x.priceUnit||"kg",cur:x.cur,kur:x.cur==="TL"?x.kur:null,incoterm:x.incoterm||"",ortak,
      status:x.status,cnt:x.cnt||0,cntNos:x.cntNos||"",bl:x.bl||"",vessel:x.vessel||"",orderDate:x.orderDate||"",loadDate:x.loadDate||"",eta:x.eta||"",arriveDate:x.arriveDate||"",note:x.note||""});
    const sd={...(doc.statusDates||{})};
    if(isNew){ doc.code=nextCode(x.orderDate); sd[x.status]=today(); doc.log=addLog({},`Alım oluşturuldu (${ST[STI[x.status]].t})`); }
    else if(l.status!==x.status){ sd[x.status]=today(); doc.log=addLog(l,`Aşama: ${ST[STI[l.status]].t} → ${ST[STI[x.status]].t}`); }
    else doc.log=addLog(l,"Bilgiler düzenlendi");
    doc.statusDates=sd; stamp(doc,isNew);
    let id=l?.id;
    if(isNew){ const ref=db.collection("lots").doc(); id=ref.id; await ref.set(doc); } else await db.doc("lots/"+l.id).set(doc);
    await addModels(items);
    return isNew ? {open:{type:"lot",id}} : undefined;
  }});
}
async function addModels(items){
  const add=new Map();
  for(const it of items){ const p=S.products[it.productId]; if(!p||!it.model) continue; const cur=[...(add.get(it.productId)||p.models||[])]; if(!cur.some(m=>key(m)===key(it.model))){ cur.push(it.model); add.set(it.productId,cur); } }
  for(const [pid,models] of add) try{ await db.doc("products/"+pid).update({models}); }catch(e){}
}
function nextCode(d){ const yy=(d||today()).slice(2,4); const n=S.lots.map(l=>String(l.code||"")).filter(c=>/^[AP]\d\d-/.test(c)&&c.slice(1,3)===yy).map(c=>parseInt(c.slice(4),10)||0); return `A${yy}-${String((n.length?Math.max(...n):0)+1).padStart(3,"0")}`; }

/* --- satış formu --- */
const saleOrtakLot = x => { for(const r of (x.items||[])){ const ci=r.ref&&C.item.get(r.ref); if(ci?.lot.ortak?.on) return ci.lot; } return null; };
function saleForm(s,lotId){
  const isNew=!s;
  let v;
  if(s) v={...s,__orig:s,items:s.items.map(ln=>({ref:ln.lotId+"|"+ln.ik,kg:ln.kg,price:ln.price}))};
  else { const l=lotById(lotId); const items=l?l.items.filter(it=>{const ci=C.item.get(l.id+"|"+it.k); return ci&&itemStock(ci)>0;}).map(it=>({ref:l.id+"|"+it.k})):[{}];
    v={date:today(),market:"irak",cur:"USD",priceUnit:"kg",items:items.length?items:[{}],customerId:l?.ortak?.on?l.ortak.partnerId:""}; }
  openForm({title:isNew?"Yeni satış":"Satışı düzenle", values:v, fields:[
    {k:"items",type:"saleitems",label:"Satılan mallar — her model ayrı kalem",addLabel:"Kalem ekle"},
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"market",label:"Pazar",type:"seg",options:Object.entries(MK),half:true},
    partySel("customerId","customer","Müşteri",{req:true,showIf:x=>!saleOrtakLot(x)}),
    {k:"onote",type:"note",showIf:x=>!!saleOrtakLot(x),text:"Ortak alım malı seçtin. Bu satış ortak firma adına, ortak alımın hesabına kaydedilir. Ortağın orada yaptığı satışın kg ve fiyatını gir."},
    ...curFields(),
    {k:"docNo",label:"Fatura / belge no",half:true},
    {k:"plate",label:"Araç / plaka",half:true},
    {k:"note",label:"Not",type:"textarea"},
  ], onChange:(x,f)=>{ const t=f.querySelector("#itot"); if(!t) return; const tot=sum((x.items||[]).filter(r=>r.kg>0&&r.price>0),r=>r.kg*(x.priceUnit==="ton"?r.price/1000:r.price)); t.textContent=tot?`Toplam: ${moneyf(tot,x.cur)}`:""; },
  onSave: async x=>{
    const rows=(x.items||[]).filter(r=>r.ref||r.kg||r.price);
    if(!rows.length) return "En az bir kalem gir.";
    const used=new Map(); const lines=[]; let firm=null, olot=null, plain=false;
    const extra=new Map(); if(s) for(const ln of s.items) extra.set(ln.lotId+"|"+ln.ik,(extra.get(ln.lotId+"|"+ln.ik)||0)+(+ln.kg||0));
    for(const [i,r] of rows.entries()){
      if(!r.ref) return `${i+1}. kalemde stoktaki malı seç.`; const ci=C.item.get(r.ref); if(!ci) return `${i+1}. kalemdeki mal bulunamadı.`;
      if(!(r.kg>0)) return `${i+1}. kalemde miktar gir.`; if(r.price==null) return `${i+1}. kalemde fiyat gir.`;
      const left=itemStock(ci)+(extra.get(r.ref)||0)-(used.get(r.ref)||0);
      if(r.kg>left+0.001) return `${ci.lot.code} ${itemLabel(ci.it)}: sadece ${nf0.format(Math.max(0,left))} kg var.`;
      used.set(r.ref,(used.get(r.ref)||0)+r.kg);
      if(firm&&firm!==ci.lot.firmId) return "Farklı firmaların malları aynı satışta olamaz; ayrı satış gir."; firm=ci.lot.firmId;
      if(ci.lot.ortak?.on){ if(olot&&olot.id!==ci.lot.id) return "İki farklı ortak alımın malı aynı satışta olamaz."; olot=ci.lot; } else plain=true;
      const [lotId,ik]=r.ref.split("|");
      lines.push({lotId,ik,kg:r.kg,price:r.price,ppk:x.priceUnit==="ton"?r.price/1000:r.price});
    }
    if(olot&&plain) return "Ortak alım malları ayrı bir satış olarak girilmeli.";
    const customerId = olot ? olot.ortak.partnerId : x.customerId; if(!customerId) return "Müşteri seç.";
    if(x.cur==="TL") rememberKur(x.kur);
    const doc={...(s||{})}; delete doc.id; delete doc.__orig; for(const k of ["lotId","kg","price","ppk","customer"]) delete doc[k];
    Object.assign(doc,{firmId:firm,date:x.date,market:x.market,customerId,items:lines,priceUnit:x.priceUnit||"kg",cur:x.cur,kur:x.cur==="TL"?x.kur:null,docNo:x.docNo||"",plate:x.plate||"",note:x.note||"",ortakLotId:olot?.id||""});
    stamp(doc,isNew);
    let id=s?.id;
    if(isNew){ const ref=db.collection("sales").doc(); id=ref.id; await ref.set(doc);
      const byLot=new Map(); for(const ln of lines) byLot.set(ln.lotId,(byLot.get(ln.lotId)||0)+ln.kg);
      for(const [lid,kg] of byLot){ const l=lotById(lid); if(l) await db.doc("lots/"+lid).update({log:addLog(l,`Satış: ${partyName(customerId)} · ${nf0.format(kg)} kg`)}).catch(()=>{}); } }
    else await db.doc("sales/"+s.id).set(doc);
    return isNew ? {open:{type:"sale",id}} : undefined;
  }});
}

/* --- ödeme / tahsilat formu --- */
function payForm(p,pre){
  const isNew=!p;
  let v;
  if(p) v={...p,supId:p.dir==="out"?p.partyId||"":"",cusId:p.dir==="in"?p.partyId||"":"",target:p.dir==="in"?(p.saleId?"s:"+p.saleId:p.lotId?"l:"+p.lotId:""):""};
  else v={dir:"out",date:today(),cur:"USD",method:"Havale",kind:"Ön ödeme",firmId:defFirm(),...(pre||{})};
  if(isNew && v.dir==="in" && !pre?.kind) v.kind="Tahsilat";
  const lotOpts=()=>[["","— Alıma bağlama —"],...S.lots.filter(l=>l.id===v.lotId||l.status!=="kapandi"||LC(l).due>1).sort((a,b)=>String(b.code).localeCompare(String(a.code))).map(l=>[l.id,`${l.code} · ${lotProducts(l)} · ${lotSupplier(l)}${LC(l).due>1?" · kalan "+usdf(LC(l).due):""}`])];
  const tgtOpts=()=>[["","— Bağlama —"],
    ...S.sales.filter(s=>!SC(s).olot&&(SC(s).due>1||"s:"+s.id===v.target)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(s=>["s:"+s.id,`Satış ${fds(s.date)} · ${saleCustomer(s)} · kalan ${usdf(SC(s).due)}`]),
    ...S.lots.filter(l=>l.ortak?.on&&(LC(l).odue>1||"l:"+l.id===v.target)).map(l=>["l:"+l.id,`Ortak alım ${l.code} · ${partyName(l.ortak.partnerId)} · kalan ${usdf(LC(l).odue)}`])];
  openForm({title:isNew?(v.dir==="out"?"Tedarikçiye ödeme":"Tahsilat"):"Kaydı düzenle", values:v, fields:[
    {k:"dir",label:"Tür",type:"seg",options:[["out","Tedarikçiye ödeme"],["in","Tahsilat"]]},
    {k:"lotId",label:"Hangi alım için?",type:"select",options:lotOpts,showIf:x=>x.dir==="out",hint:"Seçersen tedarikçi ve firma alımdan gelir"},
    partySel("supId","supplier","Tedarikçi",{showIf:x=>x.dir==="out"&&!x.lotId,req:true}),
    {k:"target",label:"Hangi satış / ortak alım için?",type:"select",options:tgtOpts,showIf:x=>x.dir==="in",hint:"Seçersen müşteri ve firma oradan gelir"},
    partySel("cusId","customer","Müşteri / ortak",{showIf:x=>x.dir==="in"&&!x.target,req:true}),
    firmSeg({label:"Firma",showIf:x=>!(x.dir==="out"?x.lotId:x.target)}),
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"amount",label:"Tutar",type:"num",half:true,req:true},
    ...curFields(false),
    {k:"kind",label:"Açıklama",half:true,list:["Ön ödeme","Ara ödeme","Bakiye","Tahsilat","Kısmi tahsilat","Avans","Ortak hesap havalesi"]},
    {k:"method",label:"Yöntem",half:true,list:["Havale","Nakit","Akreditif","Vesaik mukabili","Çek"]},
    {k:"note",label:"Not",type:"textarea"},
  ], onSave: async x=>{
    if(x.cur==="TL") rememberKur(x.kur);
    const doc={...(p||{})}; delete doc.id; delete doc.party;
    Object.assign(doc,{dir:x.dir,date:x.date,amount:x.amount,cur:x.cur,kur:x.cur==="TL"?x.kur:null,kind:x.kind||"",method:x.method||"",note:x.note||"",firmId:x.firmId||defFirm(),lotId:"",saleId:"",partyId:""});
    let lot=null;
    if(x.dir==="out"){ lot=lotById(x.lotId); if(lot){ doc.lotId=lot.id; doc.partyId=lot.supplierId||""; if(!lot.supplierId) doc.party=lot.supplier||""; doc.firmId=lot.firmId; } else doc.partyId=x.supId; }
    else if(x.target){ const [t,id]=x.target.split(":"); if(t==="s"){ const s=saleById(id); doc.saleId=id; doc.partyId=s?.customerId||""; if(s&&!s.customerId) doc.party=s.customer||""; doc.firmId=s?.firmId||doc.firmId; } else { const l=lotById(id); doc.lotId=id; doc.partyId=l?.ortak?.partnerId||""; doc.firmId=l?.firmId||doc.firmId; } }
    else doc.partyId=x.cusId;
    if(!doc.partyId && !doc.party) return x.dir==="out"?"Tedarikçi seç.":"Müşteri seç.";
    stamp(doc,isNew);
    let id=p?.id;
    if(isNew){ const ref=db.collection("pays").doc(); id=ref.id; await ref.set(doc); } else await db.doc("pays/"+p.id).set(doc);
    if(isNew && lot){ const upd={log:addLog(lot,`${x.kind||"Ödeme"}: ${moneyf(x.amount,x.cur)}`)};
      if(lot.status==="siparis"){ upd.status="onodeme"; upd.statusDates={...(lot.statusDates||{}),onodeme:x.date||today()}; upd.log=addLog({log:upd.log},"Aşama: Sipariş verildi → Ön ödeme yapıldı"); }
      await db.doc("lots/"+lot.id).update(upd).catch(()=>{}); }
    return isNew ? {open:{type:"pay",id}} : undefined;
  }});
}

/* --- masraf formu --- */
const expLinkLot = x => x.link==="lot" ? lotById(x.lotId) : x.link==="sale" ? SC(saleById(x.saleId)||{}).olot : null;
function expForm(x,pre){
  const isNew=!x;
  const v=x?{...x,link:x.saleId?"sale":x.lotId?"lot":"none",paidBy:x.paidBy||"biz"}:{date:today(),cur:"USD",cat:"Irak gümrüğü",link:"sale",paidBy:"biz",firmId:defFirm(),...(pre||{})};
  const saleOpts=()=>[["","Satış seç…"],...S.sales.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(s=>[s.id,`${fds(s.date)} ${String(s.date||"").slice(0,4)} · ${saleCustomer(s)} · ${MK[s.market]||""} · ${saleLinesTxt(s)}`])];
  const lotOpts=()=>[["","Alım seç…"],...S.lots.slice().sort((a,b)=>String(b.code).localeCompare(String(a.code))).map(l=>[l.id,`${l.code} · ${lotProducts(l)} · ${l.ortak?.on?"ortak":firmName(l.firmId)}`])];
  openForm({title:isNew?"Yeni masraf":"Masrafı düzenle", values:v, fields:[
    listSel("cat","expcats","Masraf türü",{req:true}),
    {k:"link",label:"Hangi işin masrafı?",type:"seg",options:[["sale","Bir satış"],["lot","Bir alım"],["none","Genel"]],hint:"Bağladığın işin kârından düşülür"},
    {k:"saleId",label:"Satış",type:"select",options:saleOpts,showIf:y=>y.link==="sale",req:true},
    {k:"lotId",label:"Alım",type:"select",options:lotOpts,showIf:y=>y.link==="lot",req:true},
    firmSeg({label:"Firma",showIf:y=>y.link==="none"}),
    {k:"paidBy",label:"Bu masrafı kim ödedi?",type:"seg",options:[["biz","Biz ödedik"],["ortak","Ortak ödedi"]],showIf:y=>!!expLinkLot(y),hint:"Ortak alım: biz ödediysek ortaktan geri alınır, ortak ödediyse onun payından düşülür"},
    {k:"payee",label:"Kime ödendi",list:()=>uniq(S.exps.map(e=>e.payee||e.party)),ph:"Gümrükçü, nakliyeci…"},
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"amount",label:"Tutar",type:"num",half:true,req:true},
    ...curFields(false),
    {k:"docNo",label:"Belge / fatura no"},
    {k:"note",label:"Not",type:"textarea"},
  ], onSave: async y=>{
    if(y.cur==="TL") rememberKur(y.kur);
    const doc={...(x||{})}; delete doc.id; delete doc.party;
    Object.assign(doc,{cat:y.cat,payee:y.payee||"",date:y.date,amount:y.amount,cur:y.cur,kur:y.cur==="TL"?y.kur:null,docNo:y.docNo||"",note:y.note||"",saleId:"",lotId:"",paidBy:expLinkLot(y)?y.paidBy:"biz",firmId:y.firmId||defFirm()});
    if(y.link==="sale"){ const s=saleById(y.saleId); doc.saleId=y.saleId; if(s) doc.firmId=s.firmId; }
    else if(y.link==="lot"){ const l=lotById(y.lotId); doc.lotId=y.lotId; if(l) doc.firmId=l.firmId; }
    stamp(doc,isNew);
    let id=x?.id;
    if(isNew){ const ref=db.collection("exps").doc(); id=ref.id; await ref.set(doc); } else await db.doc("exps/"+x.id).set(doc);
    return isNew ? {open:{type:"exp",id}} : undefined;
  }});
}

/* --- katalog formları --- */
function partyForm(p,kind,done){
  const id=p?.id;
  const used = id && (S.lots.some(l=>l.supplierId===id||l.ortak?.partnerId===id)||S.sales.some(s=>s.customerId===id)||S.pays.some(x=>x.partyId===id));
  openForm({title:p?"Firma bilgileri":kind==="supplier"?"Yeni tedarikçi":"Yeni müşteri / ortak", values:p?{...p}:{kind}, fields:[
    {k:"kind",label:"Tür",type:"seg",options:[["supplier","Tedarikçi"],["customer","Müşteri / ortak"]]},
    {k:"name",label:"Firma adı",req:true},
    {k:"person",label:"İlgili kişi",half:true},
    {k:"phone",label:"Telefon",half:true,itype:"tel",im:"tel",ph:"+964 …"},
    {k:"email",label:"E-posta",half:true,itype:"email",im:"email"},
    {k:"web",label:"Web sitesi",half:true,ph:"ornek.com"},
    {k:"country",label:"Ülke",half:true,list:()=>lists("origins")},
    {k:"city",label:"Şehir",half:true},
    {k:"address",label:"Adres",type:"textarea",rows:2},
    {k:"bank",label:"Banka bilgisi (banka, IBAN, SWIFT)",type:"textarea",rows:2},
    {k:"note",label:"Not",type:"textarea",rows:2},
  ], onSave: async v=>{
    const dup=Object.entries(S.parties).find(([pid,x])=>pid!==id&&key(x.name)===key(v.name)&&x.kind===v.kind); if(dup) return "Bu adla bir kayıt zaten var.";
    const doc={...(p||{})}; delete doc.id; Object.assign(doc,{kind:v.kind,name:v.name,person:v.person||"",phone:v.phone||"",email:v.email||"",web:v.web||"",country:v.country||"",city:v.city||"",address:v.address||"",bank:v.bank||"",note:v.note||""});
    stamp(doc,!p);
    if(p) await db.doc("parties/"+id).set(doc); else { const ref=db.collection("parties").doc(); await ref.set(doc); done?.(ref.id,v.name); }
  }, onDelete: p ? async()=>{ if(used) return "Bu firmayla kayıtlı işlemler var; silinemez."; await db.doc("parties/"+id).delete(); } : null });
}
function productForm(p,done){
  const id=p?.id;
  const used = id && S.lots.some(l=>l.items.some(it=>it.productId===id));
  openForm({title:p?"Ürünü düzenle":"Yeni ürün", values:p?{name:p.name,models:(p.models||[]).join("\n")}:{}, fields:[
    {k:"name",label:"Ürün adı",req:true,ph:"ör. Kaju"},
    {k:"models",label:"Modeller — her satıra bir model",type:"textarea",rows:6,ph:"W180\nW240\nW320",hint:"Alım girerken bu listeden seçersin ya da yeni model yazarsın"},
  ], onSave: async v=>{
    const dup=Object.entries(S.products).find(([pid,x])=>pid!==id&&key(x.name)===key(v.name)); if(dup) return "Bu adla bir ürün zaten var.";
    const models=[]; for(const m of String(v.models||"").split("\n").map(s=>s.trim()).filter(Boolean)) if(!models.some(x=>key(x)===key(m))) models.push(m);
    if(p) await db.doc("products/"+id).set({...S.products[id],name:v.name,models});
    else { const ref=db.collection("products").doc(); const order=Math.max(0,...Object.values(S.products).map(x=>+x.order||0))+1; await ref.set({name:v.name,models,order}); done?.(ref.id,v.name); }
  }, onDelete: p ? async()=>{ if(used) return "Bu ürünle girilmiş alımlar var; silinemez. Adını değiştirebilirsin."; await db.doc("products/"+id).delete(); } : null });
}
function listForm(lk){
  openForm({title:lk==="origins"?"Menşe ülkeleri":"Masraf türleri", values:{items:lists(lk).join("\n")}, fields:[
    {k:"items",label:"Her satıra bir tane",type:"textarea",rows:12},
  ], onSave: async v=>{ const items=uniq(String(v.items||"").split("\n")).filter(Boolean); if(!items.length) return "Liste boş olamaz."; await db.doc("lists/"+lk).set({items}); }});
}
function listAddForm(lk,done){
  openForm({title:lk==="origins"?"Yeni ülke":"Yeni masraf türü", values:{}, fields:[{k:"name",label:lk==="origins"?"Ülke adı":"Masraf türü",req:true}],
    onSave: async v=>{ const items=lists(lk); if(!items.some(x=>key(x)===key(v.name))) await db.doc("lists/"+lk).set({items:[...items,v.name]}); done?.(v.name,v.name); }});
}
function firmsForm(){
  openForm({title:"Firmalar", values:{a:firmName("a"),b:firmName("b")}, fields:[{k:"a",label:"1. firma",req:true},{k:"b",label:"2. firma",req:true}],
    onSave: async v=>{ for(const k of ["a","b"]) if(v[k]!==firmName(k)) await db.doc("firms/"+k).set({name:v[k]}); }});
}

async function setStatus(id,k){
  const l=lotById(id); if(!l||l.status===k) return;
  const upd={status:k, statusDates:{...(l.statusDates||{}),[k]:today()}, log:addLog(l,`Aşama: ${ST[STI[l.status]].t} → ${ST[STI[k]].t}`), updatedAt:new Date().toISOString(), updatedBy:me||null};
  const f=STD[k]; if(f && !l[f]) upd[f]=today();
  try{ await db.doc("lots/"+id).update(upd); toast(ST[STI[k]].t); }catch(e){ toast(dbErr(e)); }
}

/* ---------- silme ---------- */
let delArm=null;
async function doDelete(btn){
  const col=btn.dataset.col, id=btn.dataset.id;
  if(delArm!==btn){ delArm=btn;
    let extra="";
    if(col==="lots"){ const c=C.lot.get(id); if(c?.sales.length) { toast("Bu alımdan satış yapılmış. Önce satışları sil."); delArm=null; return; } const n=(c?.pays.length||0)+(c?.exps.length||0); if(n) extra=` (${n} bağlı kayıt bağlantısız kalır)`; }
    if(col==="sales"){ const n=(C.sale.get(id)?.pays.length||0)+(C.sale.get(id)?.exps.length||0); if(n) extra=` (${n} bağlı kayıt bağlantısız kalır)`; }
    const rec=colArr(col).find(x=>x.id===id); if(rec?.docs?.length) extra+=` · ${rec.docs.length} belge de silinir`;
    btn.textContent="Emin misin? Sil"+extra; btn.classList.add("pri"); setTimeout(()=>{ if(delArm===btn){ delArm=null; btn.textContent="Sil"; btn.classList.remove("pri"); } },4500); return; }
  delArm=null; btn.disabled=true;
  const rec=colArr(col).find(x=>x.id===id);
  try{ await db.doc(col+"/"+id).delete(); if(assets) for(const d of (rec?.docs||[])) for(const aid of [d.id,d.thumb].filter(Boolean)) try{ await assets.delete(aid); }catch(e){} closeSheet(); toast("Silindi"); }
  catch(e){ btn.disabled=false; toast(dbErr(e)); }
}
let exArm=false;
async function clearExamples(btn){
  if(!exArm){ exArm=true; btn.textContent="Tüm örnekler silinsin mi? Onayla"; setTimeout(()=>{exArm=false; btn.textContent="Örnekleri sil";},4000); return; }
  exArm=false; btn.disabled=true;
  const jobs=[...S.sales.filter(x=>x.ornek).map(x=>"sales/"+x.id),...S.pays.filter(x=>x.ornek).map(x=>"pays/"+x.id),...S.exps.filter(x=>x.ornek).map(x=>"exps/"+x.id),...S.lots.filter(x=>x.ornek).map(x=>"lots/"+x.id),
    ...Object.entries(S.parties).filter(([,p])=>p.ornek).map(([id])=>"parties/"+id)];
  try{ for(const p of jobs) await db.doc(p).delete();
    for(const [pid,p] of Object.entries(S.products)){ if(!p.exModels?.length) continue; await db.doc("products/"+pid).set({name:p.name,order:p.order??99,models:(p.models||[]).filter(m=>!p.exModels.includes(m))}); }
    toast("Örnek kayıtlar silindi"); closeAll(); }
  catch(e){ btn.disabled=false; toast(dbErr(e)); }
}

/* ---------- Excel ---------- */
let xlsxP=null;
const loadXlsx = () => xlsxP || (xlsxP=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="xlsx.full.min.js"; s.onload=()=>res(window.XLSX); s.onerror=()=>{xlsxP=null;rej();}; document.head.appendChild(s); }));
async function exportXlsx(btn){
  if(!dl) return; const t=btn.textContent; btn.disabled=true; btn.textContent="Hazırlanıyor…";
  try{
    const X=await loadXlsx(); const wb=X.utils.book_new(); const r2=n=>Math.round((+n||0)*100)/100;
    const add=(rows,name)=>X.utils.book_append_sheet(wb,X.utils.json_to_sheet(rows.length?rows:[{"":"Kayıt yok"}]),name);
    const lots=S.lots.filter(inFirm).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
    add(lots.flatMap(l=>{const c=LC(l); return l.items.map(it=>{const ci=C.item.get(l.id+"|"+it.k); return {"Kod":l.code,"Firma":firmName(l.firmId),"Ortak":l.ortak?.on?partyName(l.ortak.partnerId)+" %"+l.ortak.share:"","Tedarikçi":lotSupplier(l),"Menşe":l.origin,"Ürün":itemProd(it),"Model":it.model,"Miktar kg":+it.kg||0,"Fiyat /kg":it.ppk,"Para birimi":l.cur,"Kur":l.cur==="TL"?l.kur:"","Satır tutarı":r2((+it.kg||0)*(+it.ppk||0)),"Satılan kg":ci?.soldKg||0,"Kalan kg":ci?itemStock(ci):it.kg,"Aşama":ST[STI[l.status]]?.t,"Alım toplam USD":r2(c.costUSD),"Ödenen USD":r2(c.paid),"Kalan borç USD":r2(c.due),"Alım kârı USD":r2(c.profit),"Sipariş":l.orderDate,"Yükleme":l.loadDate,"Tahmini varış":l.eta,"Varış":l.arriveDate,"Konteyner no":l.cntNos,"Konşimento":l.bl,"Gemi":l.vessel,"Belge sayısı":(l.docs||[]).length,"Not":l.note};});}),"Alımlar");
    add(S.sales.filter(inFirm).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).flatMap(s=>{const c=SC(s); return c.lines.map(({ln,ci,amtUSD})=>({"Tarih":s.date,"Firma":firmName(s.firmId),"Müşteri":saleCustomer(s),"Pazar":MK[s.market],"Ortak alım":c.olot?.code||"","Alım":ci?.lot.code,"Ürün":ci?itemProd(ci.it):"","Model":ci?.it.model||"","Miktar kg":+ln.kg||0,"Fiyat /kg":ln.ppk,"Para birimi":s.cur,"Kur":s.cur==="TL"?s.kur:"","Tutar":r2((+ln.kg||0)*(+ln.ppk||0)),"Tutar USD":r2(amtUSD),"Brüt kâr USD":ci?r2(amtUSD-(+ln.kg||0)*ci.cu):"","Satış tahsil USD":r2(c.got),"Belge no":s.docNo,"Plaka":s.plate,"Not":s.note}));}),"Satışlar");
    add(S.pays.filter(inFirm).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(p=>({"Tarih":p.date,"Tür":p.dir==="out"?"Ödeme":"Tahsilat","Firma":firmName(p.firmId),"Kime/kimden":payParty(p),"Açıklama":p.kind,"Yöntem":p.method,"Tutar":+p.amount||0,"Para birimi":p.cur,"Kur":p.cur==="TL"?p.kur:"","Tutar USD":r2(usd(p.amount,p.cur,p.kur)),"İlgili":payRel(p),"Not":p.note})),"Ödemeler");
    add(S.exps.filter(inFirm).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(x=>({"Tarih":x.date,"Tür":x.cat,"Firma":firmName(x.firmId),"Kime":x.payee,"İlgili iş":expRel(x),"Kim ödedi":x.paidBy==="ortak"?"Ortak":"Biz","Tutar":+x.amount||0,"Para birimi":x.cur,"Kur":x.cur==="TL"?x.kur:"","Tutar USD":r2(expUSD(x)),"Belge no":x.docNo,"Not":x.note})),"Masraflar");
    add(prodList().flatMap(p=>prodStats(p.id).map(r=>({"Ürün":p.name,"Model":r.model,"Siparişte kg":r.ord,"Yolda kg":r.yol,"Serbest bölgede kg":r.dep,"Ort. maliyet $/kg":r.dep?r2(r.depCost/r.dep):"","Bu yıl satılan kg":r.soldY}))),"Ürün stok");
    const d=cariData();
    add(d.sup.map(r=>({"Tedarikçi":r.name,"Alış USD":r2(r.a),"Ödenen USD":r2(r.p),"Bakiye USD":r2(r.a-r.p)})),"Cari Tedarikçi");
    add(d.cus.map(r=>({"Müşteri / ortak":r.name,"Satış / ortak hesap USD":r2(r.a),"Tahsil USD":r2(r.p),"Bakiye USD":r2(r.a-r.p)})),"Cari Müşteri");
    add(Object.values(S.parties).sort((a,b)=>String(a.name).localeCompare(String(b.name),"tr")).map(p=>({"Tür":p.kind==="supplier"?"Tedarikçi":"Müşteri / ortak","Firma":p.name,"İlgili kişi":p.person,"Telefon":p.phone,"E-posta":p.email,"Web":p.web,"Ülke":p.country,"Şehir":p.city,"Adres":p.address,"Banka":p.bank,"Not":p.note})),"Rehber");
    const buf=X.write(wb,{bookType:"xlsx",type:"array"});
    await dl.save({filename:`urun-defteri-${S.firm==="all"?"tum":firmName(S.firm).toLocaleLowerCase("tr").replace(/\s+/g,"-")}-${today()}.xlsx`,data:new Blob([buf])});
    toast("Excel dosyası hazır");
  }catch(e){ if(e?.code!=="declined") toast(e?.code==="unavailable"?"Dışa aktarma bu görünümde kullanılamıyor.":"Excel hazırlanamadı. Tekrar dene."); }
  finally{ btn.disabled=false; btn.textContent=t; }
}

/* ---------- belge tarayıcı: kenar bul, düzelt, netleştir, PDF ---------- */
const IC_CAM='<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const IC_IMG='<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>';
const SCAN_MAX=2600, OUT_MAX=1800, DEFQ=[[.04,.04],[.96,.04],[.96,.96],[.04,.96]];
const FILTERS=[["color","Renkli net"],["bw","Siyah-beyaz"],["orig","Orijinal"]];
const clamp01=v=>v<0?0:v>1?1:v;
const sstep=(a,b,x)=>{ const t=clamp01((x-a)/(b-a)); return t*t*(3-2*t); };
const pause=()=>new Promise(r=>setTimeout(r,16));

function fileToCanvas(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file); const im=new Image();
    im.onload=()=>{ const w=im.naturalWidth,h=im.naturalHeight,sc=Math.min(1,SCAN_MAX/Math.max(w,h));
      const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(w*sc)); c.height=Math.max(1,Math.round(h*sc));
      const x=c.getContext("2d"); x.imageSmoothingQuality="high"; x.drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(url); res(c); };
    im.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("img")); };
    im.src=url;
  });
}
/* açık renkli kağıdı koyu zeminden ayır, en büyük parçanın 4 köşesini bul */
function detectQuad(src){
  const S=320, sc=S/Math.max(src.width,src.height), w=Math.max(8,Math.round(src.width*sc)), h=Math.max(8,Math.round(src.height*sc)), N=w*h;
  const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d"); x.drawImage(src,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data; let g=new Float32Array(N);
  for(let i=0;i<N;i++) g[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
  for(let pass=0;pass<2;pass++){ const o=new Float32Array(N);
    for(let y=0;y<h;y++) for(let xx=0;xx<w;xx++){ let s=0,n=0; for(let dy=-2;dy<=2;dy++){ const yy=y+dy; if(yy<0||yy>=h) continue; for(let dx=-2;dx<=2;dx++){ const x2=xx+dx; if(x2<0||x2>=w) continue; s+=g[yy*w+x2]; n++; } } o[y*w+xx]=s/n; }
    g=o; }
  const hist=new Float64Array(256); for(let i=0;i<N;i++) hist[Math.min(255,g[i]|0)]++;
  let all=0; for(let i=0;i<256;i++) all+=i*hist[i];
  let sB=0,wB=0,best=-1,t=128; for(let i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; const wF=N-wB; if(!wF) break; sB+=i*hist[i]; const mB=sB/wB,mF=(all-sB)/wF,bt=wB*wF*(mB-mF)*(mB-mF); if(bt>best){best=bt;t=i;} }
  const lab=new Uint8Array(N), st=new Int32Array(N); let bestC=null;
  for(let s0=0;s0<N;s0++){
    if(g[s0]<=t||lab[s0]) continue;
    let sp=0; st[sp++]=s0; lab[s0]=1; let n=0,mnS=1e9,mxS=-1e9,mnD=1e9,mxD=-1e9; const P={};
    while(sp){ const p=st[--sp]; n++; const px=p%w, py=(p/w)|0, a=px+py, b=px-py;
      if(a<mnS){mnS=a;P.tl=[px,py];} if(a>mxS){mxS=a;P.br=[px,py];} if(b>mxD){mxD=b;P.tr=[px,py];} if(b<mnD){mnD=b;P.bl=[px,py];}
      if(px>0){const q=p-1; if(!lab[q]&&g[q]>t){lab[q]=1;st[sp++]=q;}} if(px<w-1){const q=p+1; if(!lab[q]&&g[q]>t){lab[q]=1;st[sp++]=q;}}
      if(py>0){const q=p-w; if(!lab[q]&&g[q]>t){lab[q]=1;st[sp++]=q;}} if(py<h-1){const q=p+w; if(!lab[q]&&g[q]>t){lab[q]=1;st[sp++]=q;}} }
    if(!bestC||n>bestC.n) bestC={n,...P};
  }
  if(!bestC) return null;
  const r=bestC.n/N; if(r<0.12||r>0.96) return null;
  const q=[bestC.tl,bestC.tr,bestC.br,bestC.bl].map(([px,py])=>[(px+.5)/w,(py+.5)/h]);
  const area=Math.abs((q[0][0]*q[1][1]-q[1][0]*q[0][1])+(q[1][0]*q[2][1]-q[2][0]*q[1][1])+(q[2][0]*q[3][1]-q[3][0]*q[2][1])+(q[3][0]*q[0][1]-q[0][0]*q[3][1]))/2;
  if(area<0.1) return null;
  return q;
}
function solveH(dst,src){
  const A=[],B=[];
  for(let i=0;i<4;i++){ const [u,v]=dst[i],[x,y]=src[i]; A.push([u,v,1,0,0,0,-u*x,-v*x]); B.push(x); A.push([0,0,0,u,v,1,-u*y,-v*y]); B.push(y); }
  for(let i=0;i<8;i++){ let m=i; for(let r=i+1;r<8;r++) if(Math.abs(A[r][i])>Math.abs(A[m][i])) m=r; [A[i],A[m]]=[A[m],A[i]]; [B[i],B[m]]=[B[m],B[i]];
    for(let r=0;r<8;r++){ if(r===i) continue; const f=A[r][i]/A[i][i]; for(let c=i;c<8;c++) A[r][c]-=f*A[i][c]; B[r]-=f*B[i]; } }
  return B.map((b,i)=>b/A[i][i]);
}
function warpDoc(src,cn){
  const W=src.width,H=src.height, q=cn.map(([x,y])=>[x*W,y*H]), dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  let ow=Math.max(dist(q[0],q[1]),dist(q[3],q[2])), oh=Math.max(dist(q[0],q[3]),dist(q[1],q[2]));
  const sc=Math.min(1,OUT_MAX/Math.max(ow,oh)); ow=Math.max(1,Math.round(ow*sc)); oh=Math.max(1,Math.round(oh*sc));
  const hm=solveH([[0,0],[ow,0],[ow,oh],[0,oh]],q);
  const sd=src.getContext("2d").getImageData(0,0,W,H).data;
  const out=document.createElement("canvas"); out.width=ow; out.height=oh; const ox=out.getContext("2d"); const id=ox.createImageData(ow,oh), o=id.data;
  for(let v=0;v<oh;v++){ const vv=v+.5; for(let u=0;u<ow;u++){ const uu=u+.5, den=hm[6]*uu+hm[7]*vv+1;
    let x=(hm[0]*uu+hm[1]*vv+hm[2])/den-.5, y=(hm[3]*uu+hm[4]*vv+hm[5])/den-.5;
    if(x<0)x=0; if(y<0)y=0; if(x>W-1.001)x=W-1.001; if(y>H-1.001)y=H-1.001;
    const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,i00=(y0*W+x0)*4,i10=i00+4,i01=i00+W*4,i11=i01+4,k=(v*ow+u)*4;
    for(let c=0;c<3;c++) o[k+c]=(sd[i00+c]*(1-fx)+sd[i10+c]*fx)*(1-fy)+(sd[i01+c]*(1-fx)+sd[i11+c]*fx)*fy;
    o[k+3]=255; } }
  ox.putImageData(id,0,0); return out;
}
function dilate(img,w,h){
  const s=new Uint8ClampedArray(img.data);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let c=0;c<3;c++){ let m=0; for(let dy=-1;dy<=1;dy++){ const yy=y+dy; if(yy<0||yy>=h) continue; for(let dx=-1;dx<=1;dx++){ const xx=x+dx; if(xx<0||xx>=w) continue; const v=s[(yy*w+xx)*4+c]; if(v>m) m=v; } } img.data[(y*w+x)*4+c]=m; }
}
/* ışığı eşitle (gölgeyi sil), kağıdı beyazlat, yazıyı koyulaştır */
function enhance(wc,mode){
  if(mode==="orig") return wc;
  const w=wc.width,h=wc.height, sw=Math.max(4,Math.round(w/22)), sh=Math.max(4,Math.round(h/22));
  const s=document.createElement("canvas"); s.width=sw; s.height=sh; const sx=s.getContext("2d"); sx.imageSmoothingQuality="high"; sx.drawImage(wc,0,0,sw,sh);
  const sm=sx.getImageData(0,0,sw,sh); dilate(sm,sw,sh); dilate(sm,sw,sh); sx.putImageData(sm,0,0);
  const bg=document.createElement("canvas"); bg.width=w; bg.height=h; const bx=bg.getContext("2d"); bx.imageSmoothingEnabled=true; bx.imageSmoothingQuality="high"; bx.drawImage(s,0,0,w,h);
  const B=bx.getImageData(0,0,w,h).data;
  const out=document.createElement("canvas"); out.width=w; out.height=h; const ox=out.getContext("2d");
  const id=wc.getContext("2d").getImageData(0,0,w,h), d=id.data;
  const cc=v=>{ let n=(v/255-0.1)/0.82; if(n<=0) return 0; if(n>=1) return 255; return Math.pow(n,1.35)*255; };
  for(let i=0;i<d.length;i+=4){
    const r=d[i]/Math.max(8,B[i])*255, g=d[i+1]/Math.max(8,B[i+1])*255, b=d[i+2]/Math.max(8,B[i+2])*255;
    if(mode==="bw"){ const y=255*sstep(0.5,0.9,(0.299*r+0.587*g+0.114*b)/255); d[i]=d[i+1]=d[i+2]=y; }
    else { d[i]=cc(r); d[i+1]=cc(g); d[i+2]=cc(b); }
  }
  ox.putImageData(id,0,0); return out;
}
const procOf=(p,f)=>{ p.proc=p.proc||{}; if(!p.proc[f]) p.proc[f]=enhance(p.warp,f); return p.proc[f]; };
function rotateCanvas(c){ const o=document.createElement("canvas"); o.width=c.height; o.height=c.width; const x=o.getContext("2d"); x.translate(o.width,0); x.rotate(Math.PI/2); x.drawImage(c,0,0); return o; }
let jspdfP=null;
const loadJsPDF=()=>jspdfP||(jspdfP=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="jspdf.umd.min.js"; s.onload=()=>window.jspdf?.jsPDF?res(window.jspdf.jsPDF):rej(); s.onerror=()=>{jspdfP=null;rej();}; document.head.appendChild(s); }));
async function makePdf(cs){
  const J=await loadJsPDF(); let pdf=null;
  for(const c of cs){ const wmm=210, hmm=+(210*c.height/c.width).toFixed(2), o=wmm>hmm?"l":"p";
    if(!pdf) pdf=new J({orientation:o,unit:"mm",format:[wmm,hmm],compress:true}); else pdf.addPage([wmm,hmm],o);
    pdf.addImage(c.toDataURL("image/jpeg",0.8),"JPEG",0,0,wmm,hmm,undefined,"FAST"); await pause(); }
  return pdf.output("blob");
}
const canvasBlob=(c,maxW,q)=>{ let src=c; if(c.width>maxW){ const t=document.createElement("canvas"); t.width=maxW; t.height=Math.round(c.height*maxW/c.width); const x=t.getContext("2d"); x.imageSmoothingQuality="high"; x.drawImage(c,0,0,t.width,t.height); src=t; } return new Promise(r=>src.toBlob(r,"image/jpeg",q)); };

async function startScan(input){
  const file=input.files?.[0], col=input.dataset.scan, id=input.dataset.id; input.value="";
  if(!file) return;
  const kind=document.getElementById("dkind")?.value||DOCK[col][0];
  toast("Fotoğraf hazırlanıyor…"); await pause();
  try{ const img=await fileToCanvas(file); const q=detectQuad(img);
    openSheet({type:"scan",col,id,kind,stage:"crop",cur:{img,corners:(q||DEFQ).map(p=>[...p]),found:!!q},pages:[],filter:"color"}); }
  catch(e){ toast("Fotoğraf açılamadı. JPG ya da PNG dene."); }
}
async function scanAddPage(input){
  const file=input.files?.[0]; input.value=""; const t=S.stack[S.stack.length-1]; if(!file||t?.type!=="scan") return;
  toast("Fotoğraf hazırlanıyor…"); await pause();
  try{ const img=await fileToCanvas(file); const q=detectQuad(img); t.cur={img,corners:(q||DEFQ).map(p=>[...p]),found:!!q}; t.stage="crop"; renderSheet(); }
  catch(e){ toast("Fotoğraf açılamadı. JPG ya da PNG dene."); }
}
function sScan(t){
  if(t.stage==="crop"){
    const c=t.cur.corners;
    const body=`<p class="muted" style="margin:0;font-size:14px">${t.cur.found?"Belgenin kenarlarını buldum. Gerekirse köşeleri sürükleyerek düzelt.":"Kenarları bulamadım. Dört köşeyi belgenin köşelerine sürükle."}</p>
      <div class="scanstage"><div class="scanbox" id="scanbox"><canvas id="scancv"></canvas>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon id="scanpoly" points="${c.map(p=>p[0]*100+","+p[1]*100).join(" ")}" fill="rgba(110,170,60,.18)" stroke="#9DC56C" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
        ${c.map((p,i)=>`<div class="scan-h" data-h="${i}" style="left:${p[0]*100}%;top:${p[1]*100}%" role="slider" aria-label="${["Sol üst","Sağ üst","Sağ alt","Sol alt"][i]} köşe"></div>`).join("")}
        <canvas class="loupe" id="loupe" width="120" height="120" hidden></canvas></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="scan-rot">${svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',15)}Döndür</button><button class="btn sm" type="button" data-act="scan-auto">Kenarları bul</button><button class="btn sm" type="button" data-act="scan-full">Tüm fotoğraf</button></div>`;
    return {title:t.pages.length?`Sayfa ${t.pages.length+1}`:"Belge tara",body,foot:`<button class="btn" type="button" data-act="scan-cancel">Vazgeç</button><span class="sp"></span><button class="btn pri" type="button" data-act="scan-next">Kırp ve devam et →</button>`};
  }
  const body=`<div class="form"><label class="fld half"><span class="lbl">Belge türü</span><select id="scankind">${DOCK[t.col].map(k=>opt([k,k],t.kind)).join("")}</select></label>
      <div class="fld"><span class="lbl">Görünüm</span><div class="seg" role="radiogroup" aria-label="Görünüm">${FILTERS.map(([k,l])=>`<button type="button" role="radio" aria-checked="${t.filter===k}" data-act="scan-filter" data-f="${k}">${l}</button>`).join("")}</div></div></div>
    <div class="pages">${t.pages.map((p,i)=>`<div class="pg"><canvas data-pg="${i}"></canvas><span class="muted" style="font-size:12px">Sayfa ${i+1}</span><button class="iconbtn" type="button" data-act="scan-del" data-i="${i}" aria-label="Sayfa ${i+1}'i sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',14)}</button></div>`).join("")}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn">${svg(IC_CAM,16)}Sayfa çek<input type="file" accept="image/*" capture="environment" hidden data-scanadd="1"></label><label class="btn">${svg(IC_IMG,16)}Galeriden sayfa ekle<input type="file" accept="image/*" hidden data-scanadd="1"></label></div>
    <p class="muted" style="margin:0;font-size:13px">Çok sayfalı faturada her sayfayı ekle; hepsi tek PDF olarak kaydedilir.</p>`;
  return {title:`Taranan belge · ${t.pages.length} sayfa`,body,foot:`<button class="btn" type="button" data-act="back">Vazgeç</button><span class="sp"></span><button class="btn pri" type="button" data-act="scan-save">PDF olarak kaydet</button>`};
}
function mountScan(t){
  if(t.stage==="crop"){
    const cv=document.getElementById("scancv"), box=document.getElementById("scanbox"), poly=document.getElementById("scanpoly"), lp=document.getElementById("loupe"); if(!cv) return;
    const img=t.cur.img, sc=Math.min(1,1100/Math.max(img.width,img.height)); cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
    cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
    const sync=()=>poly.setAttribute("points",t.cur.corners.map(p=>p[0]*100+","+p[1]*100).join(" "));
    box.addEventListener("pointerdown",e=>{
      const hEl=e.target.closest(".scan-h"); if(!hEl) return; e.preventDefault();
      const i=+hEl.dataset.h; try{ hEl.setPointerCapture(e.pointerId); }catch(_){}
      const lx=lp.getContext("2d");
      const mv=ev=>{ const r=box.getBoundingClientRect(); const x=clamp01((ev.clientX-r.left)/r.width), y=clamp01((ev.clientY-r.top)/r.height);
        t.cur.corners[i]=[x,y]; hEl.style.left=x*100+"%"; hEl.style.top=y*100+"%"; sync();
        lp.hidden=false; lp.style.left=x<0.5?"auto":"8px"; lp.style.right=x<0.5?"8px":"auto";
        const px=x*cv.width, py=y*cv.height, R=24; lx.fillStyle="#000"; lx.fillRect(0,0,120,120); lx.drawImage(cv,px-R,py-R,R*2,R*2,0,0,120,120);
        lx.strokeStyle="#9DC56C"; lx.lineWidth=2; lx.beginPath(); lx.moveTo(60,44); lx.lineTo(60,76); lx.moveTo(44,60); lx.lineTo(76,60); lx.stroke(); };
      const up=()=>{ lp.hidden=true; hEl.removeEventListener("pointermove",mv); hEl.removeEventListener("pointerup",up); hEl.removeEventListener("pointercancel",up); };
      hEl.addEventListener("pointermove",mv); hEl.addEventListener("pointerup",up); hEl.addEventListener("pointercancel",up);
    });
    return;
  }
  (async()=>{ for(const [i,p] of t.pages.entries()){ await pause(); if(S.stack[S.stack.length-1]!==t) return; const el=document.querySelector(`canvas[data-pg="${i}"]`); if(!el) continue;
    const pc=procOf(p,t.filter); const w=240; el.width=w; el.height=Math.round(pc.height*w/pc.width); el.getContext("2d").drawImage(pc,0,0,el.width,el.height); } })();
}
async function scanAct(a,btn){
  const t=S.stack[S.stack.length-1]; if(t?.type!=="scan") return;
  if(a==="scan-cancel"){ if(t.pages.length){ t.stage="pages"; t.cur=null; renderSheet(); } else closeSheet(); return; }
  if(a==="scan-rot"){ t.cur.img=rotateCanvas(t.cur.img); t.cur.corners=t.cur.corners.map(([x,y])=>[1-y,x]); const c=t.cur.corners; t.cur.corners=[c[3],c[0],c[1],c[2]]; renderSheet(); return; }
  if(a==="scan-full"){ t.cur.corners=[[0,0],[1,0],[1,1],[0,1]]; renderSheet(); return; }
  if(a==="scan-auto"){ const q=detectQuad(t.cur.img); if(q){ t.cur.corners=q; t.cur.found=true; renderSheet(); } else toast("Kenar bulunamadı. Köşeleri elle sürükle; koyu bir zeminde çekersen daha iyi bulur."); return; }
  if(a==="scan-next"){ btn.disabled=true; btn.textContent="Düzeltiliyor…"; await pause();
    try{ t.pages.push({warp:warpDoc(t.cur.img,t.cur.corners),proc:{}}); t.cur=null; t.stage="pages"; renderSheet(); }
    catch(e){ btn.disabled=false; btn.textContent="Kırp ve devam et →"; toast("Sayfa işlenemedi. Tekrar dene."); } return; }
  if(a==="scan-filter"){ t.kind=document.getElementById("scankind")?.value||t.kind; t.filter=btn.dataset.f; renderSheet(); return; }
  if(a==="scan-del"){ t.kind=document.getElementById("scankind")?.value||t.kind; t.pages.splice(+btn.dataset.i,1); if(!t.pages.length) return closeSheet(); renderSheet(); return; }
  if(a==="scan-save"){
    if(!assets) return toast("Belge yükleme bu görünümde kullanılamıyor.");
    const kind=document.getElementById("scankind")?.value||t.kind;
    btn.disabled=true; btn.textContent="PDF hazırlanıyor…"; await pause();
    try{
      const procs=[]; for(const p of t.pages){ procs.push(procOf(p,t.filter)); await pause(); }
      const pdf=await makePdf(procs);
      btn.textContent="Yükleniyor…";
      const r=await assets.upload(pdf,{type:"application/pdf"});
      let thumb=""; try{ const tb=await canvasBlob(procs[0],900,0.75); if(tb){ const r2=await assets.upload(tb,{type:"image/jpeg"}); thumb=r2.id; } }catch(e){}
      const rec=colArr(t.col).find(x=>x.id===t.id); if(!rec) throw {code:"x"};
      const docs=[...(rec.docs||[]),{id:r.id,thumb,kind,name:`${kind} ${today()}.pdf`,ct:"application/pdf",pages:t.pages.length,at:new Date().toISOString(),by:me||null}];
      await db.doc(t.col+"/"+t.id).update({docs});
      S.stack.pop(); renderSheet(); toast(`${kind} PDF olarak eklendi`);
    }catch(e){ btn.disabled=false; btn.textContent="PDF olarak kaydet"; toast(e?.code&&e.code!=="x"?assetErr(e):"PDF kaydedilemedi. İnterneti kontrol edip tekrar dene."); }
  }
}

/* ---------- olaylar ---------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-view],[data-firm],[data-prod],[data-prodsheet],[data-stage],[data-market],[data-cari],[data-atype],[data-lot],[data-sale],[data-pay],[data-exp],[data-party],[data-doc],[data-setst],[data-copy],[data-act]");
  if(!t) return;
  const d=t.dataset;
  if(d.copy!==undefined){ const v=d.copy; Promise.resolve().then(()=>navigator.clipboard.writeText(v)).then(()=>toast("Kopyalandı"),()=>toast("Kopyalanamadı; metni basılı tutup seç.")); return; }
  if(d.act){
    const a=d.act;
    if(a==="close-all") return closeAll();
    if(a==="back") return closeSheet();
    if(a==="form-save") return formSave();
    if(a==="form-del") return formDelete(t);
    if(a==="row-add"||a==="row-del"){ const top=S.stack[S.stack.length-1]; top.v={...top.v,...readForm()}; const its=[...(top.v.items||[])];
      if(a==="row-add") its.push({}); else { its.splice(+d.i,1); if(!its.length) its.push({}); } top.v.items=its; renderSheet(); return; }
    if(a==="del") return doDelete(t);
    if(a==="doc-del") return delDoc(t);
    if(a.startsWith("scan-")) return scanAct(a,t);
    if(a==="clear-ex") return clearExamples(t);
    if(a==="export") return exportXlsx(t);
    if(!db) return;
    if(S.stack[S.stack.length-1]?.type==="choose") S.stack.pop();
    const M={
      "new-lot":()=>lotForm(null), "new-sale":()=>saleForm(null), "new-pay":()=>payForm(null), "new-pay-out":()=>payForm(null,{dir:"out"}), "new-pay-in":()=>payForm(null,{dir:"in",kind:"Tahsilat"}), "new-exp":()=>expForm(null),
      "edit-lot":()=>lotForm(lotById(d.id)), "edit-sale":()=>saleForm(saleById(d.id)), "edit-pay":()=>payForm(S.pays.find(p=>p.id===d.id)), "edit-exp":()=>expForm(S.exps.find(x=>x.id===d.id)),
      "pay-lot":()=>payForm(null,{dir:"out",lotId:d.id,kind:LC(lotById(d.id)).paid>0?"Bakiye":"Ön ödeme"}),
      "pay-ortak":()=>payForm(null,{dir:"in",target:"l:"+d.id,kind:"Ortak hesap havalesi"}),
      "sale-lot":()=>saleForm(null,d.id), "pay-sale":()=>payForm(null,{dir:"in",target:"s:"+d.id,kind:"Tahsilat"}),
      "pay-party":()=>{ const id=d.pk.startsWith("i:")?d.pk.slice(2):""; return payForm(null,d.dir==="out"?{dir:"out",supId:id,kind:"Ödeme"}:{dir:"in",cusId:id,kind:"Tahsilat"}); },
      "exp-lot":()=>expForm(null,{link:"lot",lotId:d.id,cat:"Gümrük müşaviri"}),
      "exp-sale":()=>{ const s=saleById(d.id); return expForm(null,{link:"sale",saleId:d.id,cat:s?.market==="irak"?"Irak gümrüğü":s?.market==="diger"?"İhracat masrafı":"TIR navlunu (Mersin yükleme)"}); },
      "new-party":()=>partyForm(null,d.kind), "edit-party":()=>partyForm({id:d.id,...S.parties[d.id]},S.parties[d.id]?.kind),
      "new-product":()=>productForm(null), "edit-product":()=>productForm({id:d.id,...S.products[d.id]}),
      "set-firms":()=>firmsForm(), "set-products":()=>openSheet({type:"setprods"}), "set-origins":()=>listForm("origins"), "set-expcats":()=>listForm("expcats"),
      "set-parties":()=>openSheet({type:"setparties",kind:d.kind}),
      "set-users":()=>{ S.members=null; openSheet({type:"users"}); loadMembers(); },
      "user-add":()=>userForm(),
      "user-del":async()=>{ if(t.dataset.armed!=="1"){ t.dataset.armed="1"; t.textContent="Emin misin?"; return; } try{ await window.__members.remove(d.email); toast("Kullanıcı çıkarıldı"); loadMembers(); }catch(e){ toast("Çıkarılamadı."); } },
      "logout":()=>window.__members?.logout(),
    };
    return M[a]?.();
  }
  if(d.view){ S.view=d.view; save("pd.view",S.view); render(); window.scrollTo(0,0); return; }
  if(d.firm){ S.firm=d.firm; save("pd.firm",S.firm); render(); return; }
  if(d.prodsheet) return openSheet({type:"prod",id:d.prodsheet});
  if(d.prod){ S.prod=d.prod; render(); return; }
  if(d.stage){ S.stage=S.stage===d.stage&&d.stage!=="all"?"all":d.stage; render(); return; }
  if(d.market){ S.market=d.market; render(); return; }
  if(d.cari){ S.cari=d.cari; render(); return; }
  if(d.atype){ S.atype=d.atype; render(); return; }
  if(d.setst){ return setStatus(S.stack[S.stack.length-1]?.id, d.setst); }
  if(d.doc){ const [col,id,i]=d.doc.split("|"); return openSheet({type:"doc",col,id,i:+i}); }
  if(d.lot) return openSheet({type:"lot",id:d.lot});
  if(d.sale) return openSheet({type:"sale",id:d.sale});
  if(d.pay) return openSheet({type:"pay",id:d.pay});
  if(d.exp) return openSheet({type:"exp",id:d.exp});
  if(d.party) return openSheet({type:"party",pk:d.party,dir:d.pdir});
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && S.stack.length) return closeSheet();
  if(e.key==="Enter" && e.target.matches("tr.click")) e.target.click();
});
let qT;
document.addEventListener("input",e=>{
  if(e.target.id==="aq"||e.target.id==="pq"){ const id=e.target.id; if(id==="aq") S.q=e.target.value; else S.pq=e.target.value; clearTimeout(qT); qT=setTimeout(()=>{ const pos=e.target.selectionStart; render(); const el=document.getElementById(id); if(el){ el.focus(); try{el.setSelectionRange(pos,pos);}catch(_){} } },180); }
});
document.addEventListener("change",e=>{ if(e.target.id==="ay"){ S.year=e.target.value; render(); } if(e.target.matches("input[data-upload]")) uploadDocs(e.target); if(e.target.matches("input[data-scan]")) startScan(e.target); if(e.target.matches("input[data-scanadd]")) scanAddPage(e.target); });
document.getElementById("addbtn").addEventListener("click",()=>openSheet({type:"choose"}));
document.getElementById("fab").addEventListener("click",()=>openSheet({type:"choose"}));
document.getElementById("setbtn").addEventListener("click",()=>openSheet({type:"settings"}));

/* ---------- veri bağlantısı ---------- */
function sub(col,fn){
  db.collection(col).onSnapshot(snap=>{ fn(snap); render(); },
    err=>{ S.conn = err?.code==="revoked" ? "Bu sayfaya erişimin değişti." : "Kayıtlarla bağlantı koptu. Sayfayı yenile."; render(); });
}
async function init(){
  render();
  if(!window.claude?.use){ S.conn="Bu sayfa kayıt tutmak için claude.ai içinde açılmalı."; render(); return; }
  const [d,u,w,a]=await Promise.all([claude.use("db"),claude.use("user"),claude.use("downloads"),claude.use("assets")]);
  db=d; user=u; dl=w; assets=a;
  if(!db){ S.conn="Kayıtlara ulaşılamadı. claude.ai hesabınla oturum açıp sayfayı yeniden aç."; render(); return; }
  if(user){ try{ me=await user.id(); const c=await user.can("data.write"); if(c===false) canWrite=false; }catch(e){} }
  const map=snap=>snap.docs.map(x=>({id:x.id,...x.data()}));
  const obj=snap=>{ const o={}; snap.docs.forEach(x=>o[x.id]=x.data()); return o; };
  sub("firms",s=>{ S.firms=obj(s); });
  sub("products",s=>{ S.products=obj(s); });
  sub("parties",s=>{ S.parties=obj(s); });
  sub("lists",s=>{ S.lists=obj(s); });
  sub("lots",s=>{ S.lots=map(s).map(normLot); });
  sub("sales",s=>{ S.sales=map(s).map(normSale); });
  sub("pays",s=>{ S.pays=map(s); });
  sub("exps",s=>{ S.exps=map(s); });
}
init();
})();
