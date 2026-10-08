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
const DEF_BANKS = ["Ziraat Bankası","İş Bankası","Garanti BBVA","Akbank","Yapı Kredi","Halkbank","VakıfBank","QNB","DenizBank","Kuveyt Türk","Albaraka","Türkiye Finans","Nakit"];
/* Gemi firması takip sayfaları. deep: numara bağlantıyla gider ve sonuç doğrudan açılır (8 Eki 2026'da denendi).
   deep olmayanlarda firmanın sitesi bağlantıdan numara almıyor: takip sayfası açılır, numara panoya kopyalanır. */
const CARRIERS = {
  "COSCO":       {deep:true, url:(n,t)=>`https://elines.coscoshipping.com/ebusiness/cargotracking?trackingType=${t==="B/L"?"BILLOFLADING":t==="Booking"?"BOOKING":"CONTAINER"}&number=${n}`, al:["cosco","coscon"], pre:["CSNU","CBHU","CCLU","CSLU","COSU","CXDU","CXRU"]},
  "Maersk":      {deep:true, url:n=>`https://www.maersk.com/tracking/${n}`, al:["maersk","mærsk","sealand","sea land"], pre:["MSKU","MRKU","MAEU","MRSU","MSFU","MCAU","SUDU"]},
  "ONE":         {deep:true, url:n=>`https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${n}`, al:["one","ocean network"], pre:["ONEU","ONEY","NYKU","MOLU","KKFU","TCLU"]},
  "Hapag-Lloyd": {deep:t=>t==="Konteyner", url:(n,t)=>`https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html${t==="Konteyner"?`?container=${n}`:""}`, al:["hapag","hlag"], pre:["HLCU","HLXU","HLBU","UACU","HAMU"]},
  "ZIM":         {deep:true, url:n=>`https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, al:["zim"], pre:["ZIMU","ZCSU","ZCLU","ZMOU"]},
  "MSC":         {url:()=>`https://www.msc.com/en/track-a-shipment`, al:["msc","mediterranean"], pre:["MSCU","MEDU","MSDU","MSMU","MSNU","MSZU"]},
  "CMA CGM":     {url:()=>`https://www.cma-cgm.com/ebusiness/tracking`, al:["cma","cgm","apl","anl"], pre:["CMAU","CGMU","CMDU","APHU","APZU","ANNU"]},
  "Evergreen":   {url:()=>`https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do`, al:["evergreen","shipmentlink","emc"], pre:["EGHU","EMCU","EISU","EGSU","EITU","EGLV"]},
  "Yang Ming":   {url:()=>`https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx`, al:["yang ming","yangming"], pre:["YMLU","YMMU"]},
  "HMM":         {url:()=>`https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do`, al:["hmm","hyundai"], pre:["HDMU","HMMU"]},
  "OOCL":        {url:()=>`https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx`, al:["oocl","orient overseas"], pre:["OOLU","OOCU"]},
  "Arkas":       {url:()=>`https://www.arkasline.com.tr/`, al:["arkas"], pre:["ARKU"]},
};
/* firma adı serbest yazılsa da bul ("Cosco Shipping", "maersk line"); yazılmadıysa numaranın ilk 4 harfinden tahmin et */
const carrierOf = (carrier,n) => {
  const c=key(carrier).replace(/[^a-zçğıöşü0-9 ]/g," ").trim();
  if(c){ const hit=Object.entries(CARRIERS).find(([k,v])=>key(k)===c||v.al.some(a=>c===a||c.startsWith(a+" ")||(a.length>3&&c.includes(a)))); if(hit) return hit[0]; }
  const p=String(n||"").toUpperCase().slice(0,4); const hit2=Object.entries(CARRIERS).find(([,v])=>v.pre.includes(p)); return hit2?hit2[0]:null;
};
const trackInfo = (carrier,n,t) => { const k=carrierOf(carrier,n); if(!k) return {url:`https://www.track-trace.com/container`,deep:false,name:null};
  const c=CARRIERS[k]; return {url:c.url(encodeURIComponent(n),t),deep:typeof c.deep==="function"?c.deep(t):!!c.deep,name:k}; };
const trackUrl = (carrier,n,t) => trackInfo(carrier,n,t).url;
const cntList = l => Array.isArray(l.cntNos) ? l.cntNos.filter(Boolean) : String(l.cntNos||"").split(/[\s,;]+/).filter(Boolean);
const isTir = x => x?.transport==="tir";
const TRANSPORT_SEG = {k:"transport",label:"Nasıl geliyor?",type:"seg",options:[["gemi","Gemi / konteyner"],["tir","TIR / kara yolu"]]};
const tirFields = () => [
  {k:"trucker",label:"Nakliye firması",half:true,list:()=>uniq(S.lots.map(z=>z.trucker)),ph:"Nakliyeci",showIf:isTir},
  {k:"cmr",label:"CMR no",half:true,showIf:isTir},
  {k:"plates",type:"list",label:"TIR plakası",addLabel:"Plaka ekle",ph:"34 ABC 123",showIf:isTir}];
const isBeyan = d => /beyanname/i.test(d?.kind||"");
const DOCK = {
  lots:["Alış faturası","Gümrük beyannamesi","Konşimento (B/L)","CMR / taşıma belgesi","Menşe şahadetnamesi","Fitosanitasyon","Packing list","Proforma / sözleşme","Diğer"],
  sales:["Satış faturası","Gümrük beyannamesi","CMR / taşıma belgesi","Diğer"],
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
const S = {lots:[],sales:[],pays:[],exps:[],trf:[],firms:{},products:{},parties:{},lists:{},settings:{},pending:{},
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
const numv = n => n===null||n===undefined||n===""||Number.isNaN(+n) ? "" : (+n).toLocaleString("tr-TR",{maximumFractionDigits:6});
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
const lists = k => (S.lists[k]?.items?.length ? S.lists[k].items : ({origins:DEF_ORIGINS,expcats:DEF_EXPC,banks:DEF_BANKS,carriers:Object.keys(CARRIERS)}[k]||[]));
const LISTNAME = {origins:["Menşe ülkeleri","ülke"],expcats:["Masraf türleri","masraf türü"],banks:["Bankalar","banka"],carriers:["Gemi firmaları","gemi firması"]};
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
  for(const l of S.lots) for(const it of l.items) C.item.set(l.id+"|"+it.k,{lot:l,it,soldKg:0,irakIn:0,soldIrak:0,cu:usd(+it.ppk||0,l.cur,l.kur)});
  for(const l of S.lots) for(const sv of (l.sevk||[])) for(const ln of (sv.lines||[])){ const ci=C.item.get(l.id+"|"+ln.ik); if(ci) ci.irakIn+=+ln.kg||0; }
  const eSale=new Map(), eLot=new Map();
  const bucket=(m,k)=>{ if(!m.has(k)) m.set(k,{us:0,p:0,list:[]}); return m.get(k); };
  for(const x of S.exps){ const b = x.saleId ? bucket(eSale,x.saleId) : x.lotId ? bucket(eLot,x.lotId) : null; if(!b) continue; b[x.paidBy==="ortak"?"p":"us"]+=expUSD(x); b.list.push(x); }
  const acc=new Map(S.lots.map(l=>[l.id,{soldKg:0,soldCost:0,rev:0,expUs:0,expP:0,sales:[]}]));
  for(const s of S.sales){
    let tot=0, kg=0, olot=null; const lines=[];
    for(const ln of s.items){ const amt=(+ln.kg||0)*(+ln.ppk||0); tot+=amt; kg+=+ln.kg||0; const ci=C.item.get(ln.lotId+"|"+ln.ik); if(ci){ ci.soldKg+=+ln.kg||0; if(ln.loc==="irak") ci.soldIrak+=+ln.kg||0; if(ci.lot.ortak?.on) olot=ci.lot; } lines.push({ln,ci,amtUSD:usd(amt,s.cur,s.kur)}); }
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
/* stok yeri: Irak deposuna sevk edilen kısım ayrı izlenir; geri kalanı alımın bulunduğu yerde (çoğunlukla Mersin SB) */
const irakLeft = ci => (ci.irakIn||0) - (ci.soldIrak||0);
const hereLeft = ci => itemStock(ci) - irakLeft(ci);
const locLeft = (ci,loc) => loc==="irak" ? irakLeft(ci) : hereLeft(ci);
const refKey = ref => String(ref||"").split("|").slice(0,2).join("|");
const refLoc = ref => String(ref||"").split("|")[2]==="irak" ? "irak" : "";
const lnRef = ln => ln.lotId+"|"+ln.ik+(ln.loc==="irak"?"|irak":"");
const lotIrak = l => l.items.reduce((a,it)=>{ const ci=C.item.get(l.id+"|"+it.k); return a+(ci?Math.max(0,irakLeft(ci)):0); },0);
const lotHasProd = (l,pid) => l.items.some(it=>matchProd(it,pid));
const saleHasProd = (s,pid) => s.items.some(ln=>{ const ci=C.item.get(ln.lotId+"|"+ln.ik); return ci && matchProd(ci.it,pid); });

/* ürün → model istatistikleri (yalnızca o ürünün kendi içinde) */
function prodStats(pid){
  const m=new Map(); const yr=today().slice(0,4);
  const g=name=>{ const k=name||"(model yok)"; if(!m.has(k)) m.set(k,{model:k,ord:0,yol:0,dep:0,depCost:0,irak:0,irakCost:0,soldY:0,revY:0}); return m.get(k); };
  if(!pid.startsWith("n:")) for(const md of (S.products[pid]?.models||[])) g(md);
  for(const ci of C.item.values()){
    if(!matchProd(ci.it,pid) || !inFirm(ci.lot)) continue;
    const r=g(ci.it.model), st=ci.lot.status, left=Math.max(0,hereLeft(ci)), ir=Math.max(0,irakLeft(ci));
    if(ir>0&&st!=="kapandi"){ r.irak+=ir; r.irakCost+=ir*ci.cu; }
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
  if(top && !["form","scan","pdf","notify","choose","beyan"].includes(top.type)) renderSheet();
  if(!S.hashDone && S.lots.length && location.hash.length>2){ if(handleHash()) S.hashDone=true; }
}
const prodChips = () => `<div class="chips" role="group" aria-label="Ürün"><button type="button" class="chip" data-prod="all" aria-pressed="${S.prod==="all"}">Tüm ürünler</button>${prodList().map(p=>`<button type="button" class="chip" data-prod="${esc(p.id)}" aria-pressed="${S.prod===p.id}">${esc(p.name)}</button>`).join("")}</div>`;

/* --- Ürünler --- */
function modelTable(rows){
  if(!rows.length) return `<div class="empty">Henüz model yok. Ayarlar → Ürünler ve modeller'den ekleyebilir ya da alım girerken yazabilirsin.</div>`;
  const c=v=>v?nf0.format(Math.round(v)):`<span class="muted">—</span>`;
  return `<div class="tablewrap"><table><thead><tr><th>Model</th><th class="r">Sipariş</th><th class="r">Yolda</th><th class="r">Mersin SB</th>${rows.some(r=>r.irak)?`<th class="r">Irak deposu</th>`:""}<th class="r">${today().slice(0,4)} satış</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.model)}</b></td><td class="r">${c(r.ord)}</td><td class="r">${c(r.yol)}</td><td class="r">${r.dep?`${nf0.format(Math.round(r.dep))}<br><span class="muted" style="font-size:12px">$${nf2.format(r.depCost/r.dep)}/kg</span>`:`<span class="muted">—</span>`}</td>${rows.some(x=>x.irak)?`<td class="r">${r.irak?`${nf0.format(Math.round(r.irak))}<br><span class="muted" style="font-size:12px">$${nf2.format(r.irakCost/r.irak)}/kg</span>`:`<span class="muted">—</span>`}</td>`:""}<td class="r">${r.soldY?`${nf0.format(r.soldY)}<br><span class="muted" style="font-size:12px">ort. $${nf2.format(r.revY/r.soldY)}/kg</span>`:`<span class="muted">—</span>`}</td></tr>`).join("")}</tbody></table></div><div class="muted" style="font-size:12px;padding:6px 14px 10px">Miktarlar kg. Satılan kısım düşülmüş, kalan mal gösterilir.</div>`;
}
function vUrunler(){
  let h=`<div class="vh"><h2>Ürünler</h2>${canWrite&&db?`<button class="btn" type="button" data-act="set-products">Ürün / model düzenle</button>`:""}</div>`;
  const ps=prodList();
  if(!ps.length) return h+`<div class="panel"><div class="empty">Ürün listesi yükleniyor…</div></div>`;
  const active=[], idle=[];
  for(const p of ps){ const st=prodStats(p.id); (st.some(r=>r.ord||r.yol||r.dep||r.irak||r.soldY)||S.lots.some(l=>inFirm(l)&&lotHasProd(l,p.id)&&l.status!=="kapandi") ? active : idle).push(p); }
  if(!active.length) h+=`<div class="panel"><div class="empty">Henüz açık alım yok. Sağ alttaki <b>+</b> ile ilk alımını gir; ürünler burada model model görünür.</div></div>`;
  h+=`<div class="prods">${active.map(p=>{ const rows=prodStats(p.id).filter(r=>r.ord||r.yol||r.dep||r.irak||r.soldY);
    const n=S.lots.filter(l=>inFirm(l)&&lotHasProd(l,p.id)&&l.status!=="kapandi").length;
    return `<section><div class="prod-h"><h3>${esc(p.name)}</h3><span class="muted">${n?n+" açık alım":"açık alım yok"}</span><button class="btn sm" type="button" data-prodsheet="${esc(p.id)}">Ayrıntı</button></div><div class="panel">${modelTable(rows)}</div></section>`; }).join("")}</div>`;
  if(idle.length) h+=`<p class="muted" style="margin:0;font-size:14px">Stokta ya da yolda malı olmayan ürünler: ${idle.map(p=>`<button class="linkbtn" type="button" data-prodsheet="${esc(p.id)}">${esc(p.name)}</button>`).join(" · ")}</p>`;
  return h;
}

/* --- Alımlar --- */
function lotCard(l){
  const c=LC(l); const d=l.eta && (l.status==="yolda"||l.status==="yuklendi") ? days(l.eta) : null;
  const lines=l.items.slice(0,4).map(it=>{ const ci=C.item.get(l.id+"|"+it.k); const left=ci?itemStock(ci):it.kg;
    return `<div>${esc(itemLabel(it))} <span class="muted">· ${nf0.format(+it.kg||0)} kg${(l.status==="depoda"||l.status==="kapandi")&&(ci?.soldKg||ci?.irakIn)?` · kalan ${nf0.format(Math.max(0,left))}`:""}${ci&&irakLeft(ci)>0?` (Irak'ta ${nf0.format(irakLeft(ci))})`:""}</span></div>`; }).join("")+(l.items.length>4?`<div class="muted">+${l.items.length-4} satır daha</div>`:"");
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
function lotMatches(l,q){ if(!q) return true; return key([l.code,lotSupplier(l),l.origin,...cntList(l),l.bl,l.booking,l.carrier,l.vessel,l.trucker,l.cmr,...(l.plates||[]),l.note,...l.items.map(itemLabel)].join(" ")).includes(key(q)); }
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
  let h=`<div class="vh"><h2>Cari</h2>${canWrite&&db?(S.cari==="bnk"?(S.firm==="b"?"":`<button class="btn" type="button" data-act="trf-new">Transfer</button><button class="btn pri" type="button" data-act="bal-new">Bakiye gir</button>`):S.cari==="mas"?`<button class="btn pri" type="button" data-act="new-exp">+ Masraf</button>`:S.cari==="ted"?`<button class="btn" type="button" data-act="new-party" data-kind="supplier">+ Tedarikçi</button><button class="btn pri" type="button" data-act="new-pay-out">+ Ödeme</button>`:S.cari==="mus"?`<button class="btn" type="button" data-act="new-party" data-kind="customer">+ Müşteri</button><button class="btn pri" type="button" data-act="new-pay-in">+ Tahsilat</button>`:`<button class="btn pri" type="button" data-act="new-pay">+ Ödeme / tahsilat</button>`):""}</div>`;
  h+=`<div class="seg" role="radiogroup" style="max-width:640px">${[["ted","Tedarikçiler"],["mus","Müşteriler"],["mas","Masraflar"],["hep","Tüm ödemeler"],["bnk","Banka / kasa"]].map(([k,t])=>`<button type="button" role="radio" data-cari="${k}" aria-checked="${S.cari===k}">${t}</button>`).join("")}</div>`;
  if(S.cari==="mas") return h+vMasraf();
  if(S.cari==="bnk") return h+vBanka();
  if(S.cari==="hep"){
    const ps=S.pays.filter(inFirm).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    if(!ps.length) return h+`<div class="panel"><div class="empty">Henüz ödeme veya tahsilat yok.</div></div>`;
    return h+`<div class="panel"><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Yön</th><th>Kime / kimden</th><th>Açıklama</th><th>İlgili kayıt</th><th class="r">Tutar</th></tr></thead><tbody>${ps.map(p=>`<tr class="click" data-pay="${p.id}" tabindex="0"><td>${fd(p.date)}</td><td><span class="pill" style="color:${p.dir==="out"?"var(--warn)":"var(--good)"}">${p.dir==="out"?"Ödeme":"Tahsilat"}</span></td><td>${esc(payParty(p))}</td><td>${esc(p.kind||"")}${p.bank?` <span class="muted">· ${esc(p.bank)}</span>`:p.method?` <span class="muted">· ${esc(p.method)}</span>`:""}</td><td class="muted">${esc(payRel(p))}</td><td class="r">${p.dir==="out"?"−":"+"}${moneyf(+p.amount||0,p.cur)}${p.cur==="TL"?`<br><span class="muted" style="font-size:12px">${usdf(usd(p.amount,p.cur,p.kur))} · kur ${nf4.format(+p.kur||0)}</span>`:""}</td></tr>`).join("")}</tbody></table></div></div>`;
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
  for(const l of S.lots.filter(inFirm)) out.push({d:l.orderDate||(l.createdAt||"").slice(0,10),type:"p",ti:`${lotProducts(l)} alımı`,sub:`${l.code||""} · ${lotSupplier(l)}${docN(l)}`,amt:moneyf(LC(l).cost,l.cur),attr:`data-lot="${l.id}"`,txt:[l.code,lotSupplier(l),l.origin,...cntList(l),l.bl,l.booking,l.carrier,l.vessel,l.note,...l.items.map(itemLabel)].join(" "),prod:p=>lotHasProd(l,p)});
  for(const s of S.sales.filter(inFirm)) out.push({d:s.date,type:"s",ti:`${saleCustomer(s)} · ${MK[s.market]||""}`,sub:`${saleLinesTxt(s)}${docN(s)}`,amt:moneyf(SC(s).tot,s.cur),attr:`data-sale="${s.id}"`,txt:[saleCustomer(s),saleLinesTxt(s),s.docNo,s.plate,s.note,MK[s.market]].join(" "),prod:p=>saleHasProd(s,p)});
  for(const p of S.pays.filter(inFirm)) out.push({d:p.date,type:p.dir==="out"?"o":"t",ti:`${p.dir==="out"?"Ödeme":"Tahsilat"} · ${payParty(p)}`,sub:`${p.kind||""} · ${payRel(p)}${docN(p)}`,amt:(p.dir==="out"?"−":"+")+moneyf(+p.amount||0,p.cur),attr:`data-pay="${p.id}"`,txt:[payParty(p),p.kind,p.method,p.bank,p.note,payRel(p)].join(" ")});
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
    choose:sChoose,settings:sSettings,setprods:sSetProds,users:sUsers,mail:sMail,notify:()=>sNotify(top),ask:()=>sAsk(top),acct:()=>sAcct(top),beyan:()=>sBeyan(top),pdf:()=>sPdf(top),firms:sFirms,setparties:()=>sSetParties(top.kind),doc:()=>sDoc(top),form:()=>formR(top),scan:()=>sScan(top)};
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
  const up = assets&&canWrite ? `<div class="upl"><select id="dkind" aria-label="Belge türü">${DOCK[col].map(k=>`<option>${esc(k)}</option>`).join("")}</select><label class="btn sm pri">${svg(IC_CAM,15)}Belge tara<input type="file" accept="image/*" capture="environment" hidden data-scan="${col}" data-id="${rec.id}"></label><label class="btn sm">${svg(IC_IMG,15)}Galeriden tara<input type="file" accept="image/*" hidden data-scan="${col}" data-id="${rec.id}"></label><label class="btn sm">${svg('<path d="M12 5v14M5 12h14"/>',14)}Dosya ekle<input type="file" accept="image/*,application/pdf" multiple hidden data-upload="${col}" data-id="${rec.id}"></label><button type="button" class="btn sm" data-act="paste-doc">${svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',14)}Yapıştır</button></div>` : "";
  return `<div class="dsec"><div class="h"><h4>Belgeler</h4>${up}</div>${docs.length?`<div class="docs">${docs.map((d,i)=>`<button type="button" class="doc" data-lbdoc="${col}|${rec.id}|${i}">${d.thumb?`<span class="th"><img ${blobA(d.thumb)} alt="${esc(d.kind)}" loading="lazy"></span>`:d.ct==="application/pdf"?`<span class="th">PDF</span>`:`<span class="th"><img ${blobA(d.id)} alt="${esc(d.kind)}" loading="lazy"></span>`}<span class="dn">${esc(d.kind)}${d.ct==="application/pdf"?` · PDF${d.pages?" "+d.pages+" s.":""}`:""}</span></button>`).join("")}</div>`:`<div class="muted" style="font-size:13px">${assets&&canWrite?hint:"Belge eklenmemiş."}</div>`}</div>`;
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
  return uploadFiles(col,id,files,document.getElementById("dkind")?.value||DOCK[col][0]);
}
async function uploadFiles(col,id,files,kind){
  if(!files.length||!assets) return;
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
/* büyük önizleme */
const blobUrl = async id => window.__blobUrl ? await window.__blobUrl(id) : "/_blob/"+id;
function lightbox({src,title,pdf,onDelete}){
  document.getElementById("lbox")?.remove();
  const el=document.createElement("div"); el.id="lbox"; el.className="lbox"; el.setAttribute("role","dialog"); el.setAttribute("aria-label",title||"Önizleme");
  el.innerHTML=`<div class="lb-img">${src?`<img alt="${esc(title||"")}" src="${esc(src)}">`:`<div class="lb-pdf">PDF</div>`}</div>
    <div class="lb-bar"><span class="lb-t">${esc(title||"")}</span>${pdf?`<a class="btn sm" href="${esc(pdf)}" target="_blank" rel="noopener">PDF'i aç</a>`:""}${onDelete?`<button class="btn sm danger" type="button" data-lb="del">Sil</button>`:""}<button class="btn sm pri" type="button" data-lb="close">Kapat</button></div>`;
  document.body.appendChild(el);
  const close=()=>{ el.remove(); document.removeEventListener("keydown",esc1,true); };
  const esc1=e=>{ if(e.key==="Escape"){ e.stopPropagation(); close(); } };
  document.addEventListener("keydown",esc1,true);
  let armed=false;
  el.addEventListener("click",async e=>{
    const b=e.target.closest("[data-lb]");
    if(b?.dataset.lb==="close") return close();
    if(b?.dataset.lb==="del"){ if(!armed){ armed=true; b.textContent="Emin misin? Kalıcı silinir"; return; } b.disabled=true; await onDelete(); return close(); }
    if(e.target.tagName==="IMG"){ el.classList.toggle("zoom"); return; }
    if(e.target===el||e.target.classList.contains("lb-img")) close();
  });
}
async function openDocLightbox(col,id,i){
  const rec=colArr(col).find(x=>x.id===id); const d=rec?.docs?.[i]; if(!d) return;
  const isPdf=d.ct==="application/pdf";
  const [src,pdf]=await Promise.all([ d.thumb||!isPdf ? blobUrl(d.thumb||d.id) : null, isPdf ? blobUrl(d.id) : null ]);
  lightbox({src,pdf,title:`${d.kind}${d.pages>1?` · ${d.pages} sayfa`:""}`,onDelete: canWrite&&assets ? async()=>{
    try{ const r2=colArr(col).find(x=>x.id===id); await db.doc(col+"/"+id).update({docs:(r2.docs||[]).filter((_,j)=>j!==i)}); for(const aid of [d.id,d.thumb].filter(Boolean)) try{ await assets.delete(aid); }catch(e){} toast("Belge silindi"); }catch(e){ toast(dbErr(e)); }
  } : null});
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
  const anyIrak=l.items.some(it=>C.item.get(l.id+"|"+it.k)?.irakIn>0);
  const itRows=l.items.map(it=>{ const ci=C.item.get(l.id+"|"+it.k); const sold=ci?.soldKg||0;
    return `<tr><td><b>${esc(itemProd(it))}</b> ${esc(it.model||"")}</td><td class="r">${nf0.format(+it.kg||0)}</td><td class="r">${sold?nf0.format(sold):`<span class="muted">—</span>`}</td>${anyIrak?`<td class="r">${nf0.format(Math.max(0,ci?hereLeft(ci):0))}</td><td class="r">${ci&&irakLeft(ci)>0?nf0.format(irakLeft(ci)):`<span class="muted">—</span>`}</td>`:`<td class="r">${nf0.format(Math.max(0,(+it.kg||0)-sold))}</td>`}<td class="r">${l.cur==="TL"?nf2.format(+it.price||0)+" ₺":"$"+nf4.format(+it.price||0)}/${unit}</td></tr>`; }).join("");
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
  const nums=[...cntList(l).map(n=>["Konteyner",n]),...(l.bl?[["B/L",l.bl]]:[]),...(l.booking?[["Booking",l.booking]]:[])];
  const eta=l.eta&&(l.status==="yuklendi"||l.status==="yolda")?days(l.eta):null;
  const plates=l.plates||[];
  const track = isTir(l) ? `<div class="trackbox"><div class="tb-h"><b>TIR · ${esc(l.trucker||"nakliye firması girilmedi")}</b>${l.eta?`<span class="muted">Tahmini varış ${fd(l.eta)}${eta!==null?` · ${eta<0?`<span style="color:var(--bad)">${-eta} gün gecikti</span>`:eta===0?"bugün":eta+" gün kaldı"}`:""}</span>`:""}</div>
    ${plates.length||l.cmr?`<div class="tb-nums">${plates.map(n=>`<button type="button" class="trk" data-trackcopy="${esc(n)}"><span class="muted">Plaka</span> <span class="mono">${esc(n)}</span></button>`).join("")}${l.cmr?`<button type="button" class="trk" data-trackcopy="${esc(l.cmr)}"><span class="muted">CMR</span> <span class="mono">${esc(l.cmr)}</span></button>`:""}</div><div class="muted" style="font-size:12px">Dokununca numara kopyalanır.</div>`:`<div class="muted" style="font-size:13px">Plaka ve CMR no'yu “Düzenle”den girebilirsin.</div>`}</div>`
    : nums.length||l.carrier||l.eta ? `<div class="trackbox"><div class="tb-h"><b>${esc(l.carrier||"Gemi firması girilmedi")}</b>${l.eta?`<span class="muted">Tahmini varış ${fd(l.eta)}${eta!==null?` · ${eta<0?`<span style="color:var(--bad)">${-eta} gün gecikti</span>`:eta===0?"bugün":eta+" gün kaldı"}`:""}</span>`:""}</div>
    ${nums.length?(()=>{ const ti=nums.map(([t,n])=>({t,n,...trackInfo(l.carrier,n,t)})); const nm=ti.find(x=>x.name)?.name; const allDeep=ti.every(x=>x.deep);
      return `<div class="tb-nums">${ti.map(x=>`<a class="trk" href="${esc(x.url)}" target="_blank" rel="noopener" data-trackcopy="${esc(x.n)}" ${x.deep?"":`data-trackpaste="1"`}><span class="muted">${x.t}</span> <span class="mono">${esc(x.n)}</span> ${svg('<path d="M7 17L17 7M9 7h8v8"/>',13)}</a>`).join("")}</div><div class="muted" style="font-size:12px">${!nm?`Gemi firması bilinmiyor; genel takip sitesi açılır ve numara kopyalanır. Düzenle'den gemi firmasını yazarsan doğrudan firmanın sayfası açılır.`:allDeep?`Numaraya dokununca ${esc(nm)} sitesinde sonuç doğrudan açılır.`:`Numaraya dokununca ${esc(nm)} takip sayfası açılır ve numara kopyalanır; sayfadaki kutuya yapıştırıp ara.`}${nm&&!l.carrier?` <span>(Firma numaradan tahmin edildi: ${esc(nm)})</span>`:""}</div>`; })():`<div class="muted" style="font-size:13px">Konteyner, B/L veya booking no girersen buradan tek dokunuşla takip edebilirsin.</div>`}</div>` : "";
  const body=`<div class="dhead"><div class="code"><span>${esc(l.code||"")}</span>${stPill(l.status)}${o?`<span class="badge">Ortak alım</span>`:""}${exBadge(l)}</div><div class="ttl">${esc(lotProducts(l))}</div><div class="muted">${esc(lotSupplier(l))}${l.origin?" · "+esc(l.origin):""}</div></div>
    <div class="stepper" role="group" aria-label="Aşama">${step}</div>
    ${canWrite&&next?`<button class="btn pri" type="button" data-setst="${next.k}">${next.t} olarak işaretle →</button>`:""}
    ${track}
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>Ürün / model</th><th class="r">Alınan kg</th><th class="r">Satılan</th>${anyIrak?`<th class="r">Mersin'de</th><th class="r">Irak'ta</th>`:`<th class="r">Kalan</th>`}<th class="r">Fiyat</th></tr></thead><tbody>${itRows}</tbody></table></div></div>
    ${sevkSec(l)}
    ${money}${ortak}
    ${docsSec("lots",l,"Alış faturası, konşimento, menşe şahadetnamesi gibi belgelerin fotoğrafını çek ya da PDF ekle.")}
    <details class="dmore"><summary>Alım bilgileri</summary>
    ${kvHTML([["Firma",firmTag(l.firmId)],["Tedarikçi",`<button class="btn sm" type="button" data-party="${esc(pkey(l.supplierId,l.supplier))}" data-pdir="out">${esc(lotSupplier(l))}</button>`],["Menşe",esc(l.origin||"—")],["Teslim",esc(l.incoterm||"—")],["Fatura no",esc(l.invoiceNo||"—")],["Bakiye vadesi",fd(l.payDue)],...(isTir(l)?[["Taşıma","TIR / kara yolu"],["Nakliye firması",esc(l.trucker||"—")],["Plaka",esc((l.plates||[]).join(", ")||"—")],["CMR no",esc(l.cmr||"—")]]:[["Konteyner",l.cnt?`${l.cnt} adet`:"—"],["Gemi firması",esc(l.carrier||l.vessel||"—")]]),["Sipariş",fd(l.orderDate)],["Yükleme",fd(l.loadDate)],["Tahmini varış",fd(l.eta)],["Mersin'e varış",fd(l.arriveDate)],...(l.cur==="TL"?[["Kur",nf4.format(+l.kur||0)]]:[])])}
    ${l.note?`<div class="note">${esc(l.note)}</div>`:""}
    </details>
    <div class="dsec"><div class="h"><h4>Tedarikçiye ödemeler</h4>${canWrite?`<button class="btn sm" type="button" data-act="pay-lot" data-id="${l.id}">+ Ödeme</button>`:""}</div><div class="panel rows">${c.pays.length?c.pays.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(payRow).join(""):`<div class="empty">Ödeme girilmedi.</div>`}</div></div>
    ${o?"":`<div class="dsec"><div class="h"><h4>Bu alımdan satışlar</h4>${canWrite?`<button class="btn sm" type="button" data-act="sale-lot" data-id="${l.id}">+ Satış</button>`:""}</div><div class="panel rows">${c.sales.length?c.sales.map(saleRow).join(""):`<div class="empty">Henüz satış yok.</div>`}</div></div>`}
    ${o&&c.sales.length?`<div class="dsec"><div class="h"><h4>Ortağın bildirdiği satışlar</h4></div><div class="panel rows">${c.sales.map(saleRow).join("")}</div></div>`:""}
    <div class="dsec"><div class="h"><h4>Alımın masrafları</h4>${canWrite?`<button class="btn sm" type="button" data-act="exp-lot" data-id="${l.id}">+ Masraf</button>`:""}</div><div class="panel rows">${expRows(c.exps)||`<div class="empty">Alıma bağlı masraf yok. Satışa bağlı masraflar (Irak gümrüğü, TIR) satış ekranında görünür ve buradaki kâra dahildir.</div>`}</div></div>
    <details class="dmore"><summary>Geçmiş</summary><div class="log">${log||"Kayıt yok"}</div></details>`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-lot" data-id="${l.id}">Düzenle</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="lots" data-id="${l.id}">Sil</button>`:"";
  return {title:esc(l.code||"Alım"),body,foot};
}
const payRow = p => `<button type="button" class="row" data-pay="${p.id}"><span class="typeic ${p.dir==="out"?"o":"t"}">${p.dir==="out"?"ÖDE":"TAH"}</span><span class="main"><div class="t">${esc(p.kind||(p.dir==="out"?"Ödeme":"Tahsilat"))}</div><div class="sub">${fd(p.date)}${p.bank?" · "+esc(p.bank):p.method?" · "+esc(p.method):""}${docN(p)}</div></span><span class="end"><div class="a">${moneyf(+p.amount||0,p.cur)}</div>${p.cur==="TL"?`<div class="b">${usdf(usd(p.amount,p.cur,p.kur))}</div>`:""}</span></button>`;
const saleRow = s => { const sc=SC(s); return `<button type="button" class="row" data-sale="${s.id}"><span class="typeic s">SAT</span><span class="main"><div class="t">${esc(saleCustomer(s))} · ${esc(MK[s.market]||"")}</div><div class="sub">${fd(s.date)} · ${esc(saleLinesTxt(s))}</div></span><span class="end"><div class="a">${moneyf(sc.tot,s.cur)}</div><div class="b">${sc.olot?"ortak hesabında":sc.due>1?"kalan "+usdf(sc.due):"tahsil edildi"}</div></span></button>`; };
const expRows = es => es.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(x=>`<button type="button" class="row" data-exp="${x.id}"><span class="typeic m">MSR</span><span class="main"><div class="t">${esc(x.cat||"Masraf")}${x.paidBy==="ortak"?` <span class="badge">ortak ödedi</span>`:""}</div><div class="sub">${fd(x.date)}${x.payee?" · "+esc(x.payee):""}${docN(x)}</div></span><span class="end"><div class="a">${moneyf(+x.amount||0,x.cur)}</div>${x.cur==="TL"?`<div class="b">${usdf(expUSD(x))}</div>`:""}</span></button>`).join("");

/* --- satış detayı --- */
function sSale(id){
  const s=saleById(id); if(!s) return null; const c=SC(s);
  const unit=s.priceUnit==="ton"?"ton":"kg";
  const rows=c.lines.map(({ln,ci,amtUSD})=>`<tr><td><b>${ci?esc(itemProd(ci.it)):"?"}</b> ${ci?esc(ci.it.model||""):""}<br><span class="muted mono">${ci?esc(ci.lot.code):""}</span>${ln.loc==="irak"?` <span class="badge">Irak deposundan</span>`:""}</td><td class="r">${nf0.format(+ln.kg||0)}</td><td class="r">${s.cur==="TL"?nf2.format(+ln.price||0)+" ₺":"$"+nf4.format(+ln.price||0)}/${unit}</td><td class="r">${moneyf((+ln.kg||0)*(+ln.ppk||0),s.cur)}</td><td class="r">${ci?usdf(amtUSD-(+ln.kg||0)*ci.cu):"—"}</td></tr>`).join("");
  const body=`<div class="dhead"><div class="code"><span>${fd(s.date)}</span><span class="pill" style="color:var(--firm-b)">${esc(MK[s.market]||"")}</span>${c.olot?`<span class="badge">Ortak alım satışı</span>`:""}${exBadge(s)}</div><div class="ttl">${esc(saleCustomer(s))}</div></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>Ürün / model</th><th class="r">kg</th><th class="r">Fiyat</th><th class="r">Tutar</th><th class="r">Brüt kâr</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    ${c.olot?`<div class="fnote">Bu satış ortak alım <b>${esc(c.olot.code)}</b> hesabına işlenir. Tahsilatı ortak alımın sayfasından "Ortaktan gelen havale" ile gir.</div>`:`<div class="money"><div><div class="l">Satış tutarı</div><div class="v">${moneyf(c.tot,s.cur)}</div></div><div><div class="l">Tahsil edilen</div><div class="v">${usdf(c.got)}</div></div><div><div class="l">Kalan alacak</div><div class="v ${c.due>1?"warn":"good"}">${c.due>1?usdf(c.due):"Yok"}</div></div></div>`}
    ${kvHTML([["Firma",firmTag(s.firmId)],["Dolar karşılığı",usdf(c.totUSD)+(s.cur==="TL"?` (kur ${nf4.format(+s.kur||0)})`:"")],["Masraflar",c.exp?usdf(c.exp):"—"],["Belge no",esc(s.docNo||"—")],["Ödeme vadesi",s.dueDate?fd(s.dueDate)+(c.due>1&&!c.olot&&days(s.dueDate)<0?` <span style="color:var(--bad)">· ${-days(s.dueDate)} gün gecikti</span>`:""):"—"],["Araç / plaka",esc(s.plate||"—")]])}
    ${s.note?`<div class="note">${esc(s.note)}</div>`:""}
    ${docsSec("sales",s,"Satış faturası, beyanname ya da CMR fotoğrafını ekle.")}
    ${c.olot?"":`<div class="dsec"><div class="h"><h4>Tahsilatlar</h4>${canWrite?`<button class="btn sm" type="button" data-act="pay-sale" data-id="${s.id}">+ Tahsilat</button>`:""}</div><div class="panel rows">${c.pays.length?c.pays.map(payRow).join(""):`<div class="empty">Tahsilat girilmedi.</div>`}</div></div>`}
    <div class="dsec"><div class="h"><h4>Bu satışın masrafları</h4>${canWrite?`<button class="btn sm" type="button" data-act="exp-sale" data-id="${s.id}">+ Masraf</button>`:""}</div><div class="panel rows">${expRows(c.exps)||`<div class="empty">Irak gümrüğü, TIR navlunu, gümrükçü gibi masrafları buraya ekle.</div>`}</div></div>
    ${byline(s)}`;
  const foot=canWrite?`<button class="btn" type="button" data-act="edit-sale" data-id="${s.id}">Düzenle</button><button class="btn" type="button" data-act="pdf-invoice" data-id="${s.id}">${svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',15)}Fatura PDF</button><span class="sp"></span><button class="btn danger" type="button" data-act="del" data-col="sales" data-id="${s.id}">Sil</button>`:"";
  return {title:"Satış",body,foot};
}
/* --- ödeme detayı --- */
function sPay(id){
  const p=S.pays.find(x=>x.id===id); if(!p) return null;
  const s=saleById(p.saleId), l=lotById(p.lotId);
  const rel = s?`<button class="btn sm" type="button" data-sale="${s.id}">${fds(s.date)} · ${esc(saleCustomer(s))}</button>` : l?`<button class="btn sm" type="button" data-lot="${l.id}">${esc(l.code)} · ${esc(lotProducts(l))}</button>` : "—";
  const body=`<div class="dhead"><div class="code"><span>${fd(p.date)}</span><span class="pill" style="color:${p.dir==="out"?"var(--warn)":"var(--good)"}">${p.dir==="out"?"Tedarikçiye ödeme":"Tahsilat"}</span>${exBadge(p)}</div><div class="ttl">${moneyf(+p.amount||0,p.cur)}</div></div>
    ${kvHTML([["Firma",firmTag(p.firmId)],[p.dir==="out"?"Kime":"Kimden",esc(payParty(p))],["Açıklama",esc(p.kind||"—")],[p.dir==="out"?"Ödenen banka":"Gelen banka",esc(p.bank||"—")],["Yöntem",esc(p.method||"—")],["Dolar karşılığı",usdf(usd(p.amount,p.cur,p.kur))+(p.cur==="TL"?` (kur ${nf4.format(+p.kur||0)})`:"")],["İlgili kayıt",rel]])}
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
   <div class="dsec"><div class="h"><h4>Hesap dökümü</h4><button class="btn sm" type="button" data-act="pdf-statement" data-pk="${esc(pk)}" data-dir="${ted?"out":"in"}">${svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',14)}Ekstre PDF</button>${canWrite?`<button class="btn sm" type="button" data-act="pay-party" data-pk="${esc(pk)}" data-dir="${ted?"out":"in"}">+ ${ted?"Ödeme":"Tahsilat"}</button>`:""}</div>
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
    <div class="dsec"><div class="h"><h4>Satışlar</h4></div><div class="panel rows">${sales.length?sales.slice(0,40).map(saleRow).join(""):`<div class="empty">Bu ürünün satışı yok.</div>`}</div></div>
    ${beyanSec(pid)}`;
  return {title:esc(p.name),body};
}
/* --- ekle seçici --- */
function sChoose(){
  const b=(act,ic,t,s)=>`<button type="button" data-act="${act}">${svg(ic,28)}<div><b>${t}</b><span>${s}</span></div></button>`;
  const quick = window.__fn&&canWrite ? `<div class="quick">
    <label for="qtext"><b>${svg(IC_SPARK,16)}Yazarak gir</b><span>Satışı, ödemeyi, tahsilatı ya da masrafı bir cümleyle yaz; form dolu gelir, sen kontrol edip kaydedersin.</span></label>
    <textarea id="qtext" rows="3" enterkeyhint="go" placeholder="Örn: Bağdat'taki Ahmet'e 6 ton W320 kaju sattım, kilosu 8,6 dolar, 30 gün vadeli">${esc(S.qtext||"")}</textarea>
    <div class="qrow"><button class="btn pri" type="button" data-act="quick-go">Forma çevir</button><span class="hint">Klavyedeki mikrofona basıp konuşarak da yazabilirsin.</span></div>
    <details class="qex"><summary>Örnekler (dokununca kutuya yazılır)</summary><ul>
      ${["Kaju tedarikçisine Ziraat'ten 42 bin dolar bakiye gönderdim","Erbil'deki Karwan 30 bin dolar yatırdı, Garanti'ye geldi","Dünkü Basra satışı için Irak gümrüğüne 1.850 dolar ödedik","34 ABC 123 plakalı TIR'ın Mersin yükleme navlunu 18.500 TL"].map(x=>`<li><button type="button" class="linkbtn" data-act="quick-ex">${esc(x)}</button></li>`).join("")}
    </ul></details></div><div class="qor"><span>ya da türünü seç</span></div>` : "";
  return {title:"Ne eklemek istiyorsun?",body:`${quick}<div class="chooser">
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
      ${r("set-banks","Bankalar",esc(lists("banks").slice(0,5).join(", "))+"…")}
      ${r("set-carriers","Gemi firmaları",esc(lists("carriers").slice(0,5).join(", "))+"…")}
      ${window.__fn?r("set-notify","Bildirimler","Konteyner varışı, vadeler ve yeni kayıtlar telefonuna gelsin"):""}
      ${window.__fn&&window.__members?.me.role==="owner"?r("set-mail","E-posta: haftalık özet ve yedek",S.settings.mail?.lastSent?`Son gönderim ${fd(S.settings.mail.lastSent.slice(0,10))}`:"Her pazartesi 08:00"):""}
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
function sMail(){
  const m=S.settings.mail||{}; const owner=(S.members||[]).find(u=>u.role==="owner")?.email||window.__members?.me.email||"";
  const k=S.settings.kurlar; const kd=k?.usd?Object.keys(k.usd).sort().pop():null;
  const seg=(id,val)=>`<div class="seg" role="radiogroup" data-mk="${id}">${[["1","Açık"],["0","Kapalı"]].map(([o,t])=>`<button type="button" role="radio" aria-checked="${(val!==false)===(o==="1")}" data-mv="${o}">${t}</button>`).join("")}</div>`;
  const body=`<div class="form">
      <div class="fld"><span class="lbl">Haftalık özet — her pazartesi 08:00, defteri kullanan herkese</span>${seg("digest",m.digest)}<span class="hint">Gelecek konteynerler, serbest bölge stoku, borçlar, alacaklar ve geçen haftanın hareketleri.</span></div>
      <div class="fld"><span class="lbl">Haftalık yedek — Excel + tam yedek dosyası, sadece aşağıdaki adrese</span>${seg("backup",m.backup)}</div>
      <label class="fld"><span class="lbl">Yedek e-posta adresi</span><input id="m_backupTo" type="email" inputmode="email" value="${esc(m.backupTo||owner)}"></label>
    </div>
    <button class="btn pri" type="button" data-act="mail-save" style="align-self:flex-start">Kaydet</button>
    <div class="dsec"><div class="h"><h4>Deneme</h4></div><p class="muted" style="margin:0;font-size:14px">Ayarları kaydettikten sonra deneme gönderebilirsin. Özet sadece sana, yedek yedek adresine gider.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-act="mail-test" data-t="digest">Bana deneme özeti gönder</button><button class="btn" type="button" data-act="mail-test" data-t="backup">Deneme yedeği gönder</button></div></div>
    <div class="dsec"><div class="h"><h4>Kur</h4></div><p class="muted" style="margin:0;font-size:14px">${kd?`Merkez Bankası kurları her iş günü 16:15'te kendiliğinden güncellenir. Son kur: ${fd(kd)} · 1 $ = ${nf4.format(k.usd[kd].a)} ₺ (döviz alış). TL girişlerinde o tarihin kuru kendiliğinden yazılır.`:"Kurlar henüz yüklenmedi."}</p></div>
    ${m.lastSent?`<p class="muted" style="font-size:13px;margin:0">Son otomatik gönderim: ${fd(m.lastSent.slice(0,10))}</p>`:""}`;
  return {title:"E-posta ve kur",body};
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
let AI_KIND=null;
/* ---------- belgeyi yapay zekâyla okuyup formu doldurma ---------- */
const IC_SPARK='<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';
const normName = s => key(s).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[.,'"()&/\\-]/g," ").replace(/\b(co|ltd|limited|llc|inc|jsc|company|corp|corporation|sti|tic|ticaret|san|as|gmbh|sa|srl|pvt|private|import|export|imp|exp|trading|group|the|and|ve)\b/g," ").replace(/\s+/g," ").trim();
function matchParty(name,kind){ const n=normName(name); if(n.length<2) return null; const ps=partiesOf(kind); return ps.find(p=>normName(p.name)===n) || ps.find(p=>{ const m=normName(p.name); return m.length>2&&(m.includes(n)||n.includes(m)); }) || null; }
function matchList(val,lk){ const n=normName(val); if(!n) return ""; const L=lists(lk); return L.find(x=>normName(x)===n) || L.find(x=>{ const m=normName(x); const w=m.split(" ")[0]; return w.length>2&&n.includes(w); }) || ""; }
const findProdFuzzy = name => { const n=normName(name); if(!n) return ""; const ps=productsSorted(); const p=ps.find(x=>normName(x.name)===n)||ps.find(x=>{ const m=normName(x.name); return n.includes(m)||m.includes(n); }); return p?.id||""; };
async function fileForAI(f){
  if((f.type||"").startsWith("image/")){ const c=await fileToCanvas(f); const mx=2000, sc=Math.min(1,mx/Math.max(c.width,c.height)); const o=document.createElement("canvas"); o.width=Math.round(c.width*sc); o.height=Math.round(c.height*sc); o.getContext("2d").drawImage(c,0,0,o.width,o.height); return {mediaType:"image/jpeg",data:o.toDataURL("image/jpeg",0.88).split(",")[1]}; }
  if(f.size>9.5e6) throw new Error("PDF çok büyük (en fazla 9 MB).");
  const buf=new Uint8Array(await f.arrayBuffer()); let bin=""; for(let i=0;i<buf.length;i+=0x8000) bin+=String.fromCharCode(...buf.subarray(i,i+0x8000));
  return {mediaType:"application/pdf",data:btoa(bin)};
}
function aiNoteHTML(ai){
  return `<div class="ainote" role="status"><div class="ai-h">${svg(IC_SPARK,16)}<b>${ai.src==="cumle"?"Yazdığından dolduruldu":"Belgeden dolduruldu"}</b><span class="muted">Kaydetmeden önce kontrol et.</span></div>
    ${ai.text?`<div class="ai-q">“${esc(ai.text)}”</div>`:""}
    ${ai.filled.length?`<div class="ai-f">${ai.filled.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}
    ${ai.warn.length?`<ul>${ai.warn.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>`:""}
    ${ai.party?`<button class="btn sm" type="button" data-act="ai-party">+ ${esc(ai.party.name)} firmasını bilgileriyle ekle</button>`:""}</div>`;
}
async function aiFill(btn){
  const top=S.stack[S.stack.length-1]; if(top?.type!=="form") return;
  top.v={...top.v,...readForm()}; const f=(top.v.__files||[])[0]; if(!f) return;
  btn.disabled=true; const old=btn.innerHTML; btn.textContent="Belge okunuyor… (10–40 sn)";
  try{
    const file=await fileForAI(f);
    const context={firms:[firmName("a"),firmName("b")],products:productsSorted().map(p=>p.name),models:Object.fromEntries(productsSorted().map(p=>[p.name,modelsOf(p.id)])),expcats:lists("expcats")};
    const r=await window.__fn("oku",{kind:top.o.aiKind,file,context});
    if(S.stack[S.stack.length-1]!==top) return;
    top.ai=applyAI(top,r.data); top.v={...top.v}; renderSheet(); document.querySelector(".sh-body").scrollTop=0; toast("Belge okundu");
  }catch(e){ btn.disabled=false; btn.innerHTML=old; toast(e?.message||"Belge okunamadı. Tekrar dene."); }
}
function applyAI(top,d){
  const v=top.v, k=top.o.aiKind, filled=[], warn=[...(d.warnings||[])]; let party=null;
  const put=(f,val,label)=>{ if(val===undefined||val===null||val===""||(typeof val==="number"&&!(val>0))) return; v[f]=val; if(label) filled.push(label); };
  const cur = d.currency==="USD"?"USD":d.currency==="TL"?"TL":"";
  if(d.currency==="EUR"||d.currency==="DIGER") warn.push(`Belge ${d.currency==="EUR"?"Euro":"farklı bir para birimi"} ile; defter USD ve TL tutuyor, tutarları kontrol et.`);
  if(k==="lot"){
    put("orderDate",d.date,"tarih"); put("invoiceNo",d.invoice_no,"fatura no"); if(cur) put("cur",cur,"para birimi");
    const sp=matchParty(d.seller?.name,"supplier"); if(sp){ v.supplierId=sp.id; filled.push("tedarikçi"); } else if(d.seller?.name){ party={kind:"supplier",field:"supplierId",...d.seller}; warn.push(`Tedarikçi listede yok: ${d.seller.name}`); }
    const og=matchList(d.seller?.country,"origins"); if(og){ v.origin=og; filled.push("menşe"); }
    const its=(d.items||[]).filter(it=>it.quantity_kg>0).map(it=>{ const pid=findProdFuzzy(it.product)||findProdFuzzy(it.description); if(!pid) warn.push(`Ürün eşleşmedi: ${it.product||it.description}`); return {productId:pid,model:it.model||"",kg:Math.round(it.quantity_kg*1000)/1000,price:Math.round(it.unit_price_per_kg*10000)/10000}; });
    if(its.length){ v.items=its; v.priceUnit="kg"; filled.push(`${its.length} ürün satırı`); }
    put("incoterm",d.incoterm,"teslim şekli");
    const sh=d.shipping||{}; put("carrier",sh.carrier,"gemi firması"); put("bl",sh.bl_no,"B/L"); put("booking",sh.booking_no,"booking"); put("eta",sh.eta,"tahmini varış");
    if(sh.container_nos?.length){ v.cntNos=sh.container_nos; v.cnt=sh.container_nos.length; filled.push(`${sh.container_nos.length} konteyner`); }
    if(d.invoice_no){ const dup=S.lots.find(l=>key(l.invoiceNo)===key(d.invoice_no)&&l.id!==top.o.docTarget?.id); if(dup) warn.push(`Bu fatura no (${d.invoice_no}) zaten ${dup.code} alımında kayıtlı. Aynı faturayı iki kez girmediğinden emin ol.`); }
    const tot=sum(its,it=>it.kg*it.price); if(d.total_amount>0&&tot>0&&Math.abs(tot-d.total_amount)/d.total_amount>0.01) warn.push(`Satırların toplamı (${moneyf(tot,cur||"USD")}) faturadaki toplamla (${moneyf(d.total_amount,cur||"USD")}) tutmuyor.`);
  } else if(k==="sale"){
    put("date",d.date,"tarih"); put("docNo",d.invoice_no,"fatura no"); if(cur) put("cur",cur,"para birimi");
    const cs=matchParty(d.buyer?.name,"customer"); if(cs){ v.customerId=cs.id; filled.push("müşteri"); } else if(d.buyer?.name){ party={kind:"customer",field:"customerId",name:d.buyer.name,country:d.buyer.country}; warn.push(`Müşteri listede yok: ${d.buyer.name}`); }
    const bc=key(d.buyer?.country); v.market = /irak|iraq/.test(bc)?"irak":/türkiye|turkiye|turkey/.test(bc)?"ic":bc?"diger":v.market;
    const rows=[]; const used=new Map();
    for(const it of (d.items||[]).filter(x=>x.quantity_kg>0)){
      const pid=findProdFuzzy(it.product)||findProdFuzzy(it.description); let need=it.quantity_kg;
      const refs0=[...C.item.entries()].filter(([,ci])=>ci.lot.status!=="kapandi"&&(!pid||ci.it.productId===pid)&&(!it.model||key(ci.it.model)===key(it.model))).sort((a,b)=>(a[1].lot.arriveDate||a[1].lot.orderDate||"").localeCompare(b[1].lot.arriveDate||b[1].lot.orderDate||""));
      const refs=[...refs0.map(([k,ci])=>[k,ci,""]),...refs0.map(([k,ci])=>[k+"|irak",ci,"irak"])];
      for(const [ref,ci,loc] of refs){ if(need<=0) break; const left=locLeft(ci,loc)-(used.get(ref)||0); if(left<=0) continue; const take=Math.min(left,need); rows.push({ref,kg:Math.round(take*1000)/1000,price:it.unit_price_per_kg}); used.set(ref,(used.get(ref)||0)+take); need-=take; }
      if(need>0.5) warn.push(`${it.product||it.description}${it.model?" "+it.model:""}: stokta ${nf0.format(need)} kg eksik, satırı kontrol et.`);
    }
    if(rows.length){ v.items=rows; v.priceUnit="kg"; filled.push(`${rows.length} satış kalemi (eski stoktan başlayarak)`); }
    if(d.invoice_no&&S.sales.some(x=>key(x.docNo)===key(d.invoice_no)&&x.id!==top.o.docTarget?.id)) warn.push(`Bu fatura no (${d.invoice_no}) daha önce bir satışta kullanılmış.`);
  } else if(k==="pay"){
    const p=d.payment||{}; if(p.direction) v.dir=p.direction;
    put("date",p.date||d.date,"tarih"); put("amount",p.amount||d.total_amount,"tutar"); if(cur) put("cur",cur,"para birimi");
    const bank=matchList(p.bank,"banks"); if(bank){ v[v.dir==="in"?"bankIn":"bankOut"]=bank; filled.push("banka"); } else if(p.bank) warn.push(`Banka listede yok: ${p.bank}`);
    if(v.dir==="out"){ const sp=matchParty(p.receiver,"supplier"); if(sp){ v.supId=sp.id; filled.push("tedarikçi");
        const open=S.lots.filter(l=>l.supplierId===sp.id&&LC(l).due>1); if(open.length===1&&!v.lotId){ v.lotId=open[0].id; filled.push(`alım ${open[0].code}`); } else if(open.length>1&&!v.lotId) warn.push(`${sp.name} için ${open.length} açık alım var; ödemenin hangisine ait olduğunu seç.`); }
      else if(p.receiver) warn.push(`Alıcı tedarikçi listede yok: ${p.receiver}`); }
    else { const cs=matchParty(p.sender,"customer"); if(cs){ v.cusId=cs.id; filled.push("müşteri"); } else if(p.sender) warn.push(`Gönderen müşteri listede yok: ${p.sender}`); }
    if(p.reference) v.note=[v.note,`Dekont ref: ${p.reference}`].filter(Boolean).join("\n");
  } else if(k==="exp"){
    put("date",d.date,"tarih"); put("amount",d.total_amount,"tutar"); if(cur) put("cur",cur,"para birimi"); put("docNo",d.invoice_no,"belge no"); put("payee",d.seller?.name,"kime ödendi");
    const cat=matchList(d.expense_category,"expcats"); if(cat){ v.cat=cat; filled.push("masraf türü"); }
    if(d.invoice_no&&S.exps.some(x=>key(x.docNo)===key(d.invoice_no)&&x.id!==top.o.docTarget?.id)) warn.push(`Bu belge no (${d.invoice_no}) daha önce bir masrafta kullanılmış.`);
  }
  if(!filled.length) warn.unshift("Belgeden kullanılabilir bilgi çıkarılamadı. Fotoğrafı daha net ve düz çekmeyi dene.");
  return {filled,warn,party};
}
/* --- tek cümleden kayıt --- */
function quickContext(){
  const sales=S.sales.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).filter((x,i)=>i<40||SC(x).due>1).slice(0,70)
    .map(x=>{ const c=SC(x); return `s:${x.id} · satış ${fd(x.date)} · ${saleCustomer(x)} · ${MK[x.market]||""} · ${saleLinesTxt(x)}${c.olot?" · ortak alım malı":c.due>1?" · kalan alacak "+usdf(c.due):" · tahsil edildi"}`; });
  const lots=S.lots.slice().sort((a,b)=>String(b.code).localeCompare(String(a.code))).filter((l,i)=>i<40||l.status!=="kapandi"||LC(l).due>1).slice(0,70)
    .map(l=>{ const c=LC(l); return `l:${l.id} · alım ${l.code} · ${lotProducts(l)} · ${lotSupplier(l)} · ${ST[STI[l.status]]?.t||l.status}${c.due>1?" · tedarikçiye kalan borç "+usdf(c.due):""}${l.ortak?.on?` · ORTAK ALIM (ortak: ${partyName(l.ortak.partnerId)}${c.odue>1?", ortaktan alacak "+usdf(c.odue):""})`:` · ${firmName(l.firmId)}`}`; });
  return {firms:[firmName("a"),firmName("b")],products:productsSorted().map(p=>p.name),models:Object.fromEntries(productsSorted().map(p=>[p.name,modelsOf(p.id)])),
    expcats:lists("expcats"),banks:lists("banks"),customers:partiesOf("customer").map(p=>p.name),suppliers:partiesOf("supplier").map(p=>p.name),sales,lots};
}
async function quickGo(btn){
  const ta=document.getElementById("qtext"); const txt=(ta?.value||"").trim(); S.qtext=ta?.value||"";
  if(txt.length<4){ ta?.focus(); return toast("Önce ne yaptığını bir cümleyle yaz."); }
  btn.disabled=true; const old=btn.textContent; btn.textContent="Anlıyorum… (5–15 sn)"; ta.disabled=true;
  let d;
  try{ d=(await window.__fn("cumle",{text:txt,context:quickContext()})).data; }
  catch(e){ btn.disabled=false; btn.textContent=old; ta.disabled=false; return toast(e?.message||"Anlaşılamadı. Tekrar dene."); }
  if(S.stack[S.stack.length-1]?.type!=="choose") return;
  if(!d||d.kind==="belirsiz"){ btn.disabled=false; btn.textContent=old; ta.disabled=false; return toast((d?.warnings||[])[0]||"Satış mı, ödeme mi, masraf mı anlaşılmadı. Biraz daha açık yaz."); }
  S.stack.pop();
  const ref=String(d.link_ref||""), refSale=ref.startsWith("s:")&&saleById(ref.slice(2))?ref.slice(2):"", refLot=ref.startsWith("l:")&&lotById(ref.slice(2))?ref.slice(2):"";
  const kind=d.kind==="sale"?"sale":d.kind==="exp"?"exp":"pay";
  if(kind==="sale") saleForm(null);
  else if(kind==="exp") expForm(null,{...(d.firm?{firmId:d.firm}:{}),...(refSale?{link:"sale",saleId:refSale}:refLot?{link:"lot",lotId:refLot}:{})});
  else if(d.kind==="pay_out") payForm(null,{dir:"out",...(d.pay_kind?{kind:d.pay_kind}:{}),...(d.firm?{firmId:d.firm}:{}),...(refLot?{lotId:refLot}:{})});
  else payForm(null,{dir:"in",kind:d.pay_kind||(refLot?"Ortak hesap havalesi":"Tahsilat"),...(d.firm?{firmId:d.firm}:{}),...(refSale?{target:"s:"+refSale}:refLot&&lotById(refLot).ortak?.on?{target:"l:"+refLot}:{})});
  const top=S.stack[S.stack.length-1]; if(top?.type!=="form") return;
  const its=(d.items||[]).map(it=>({product:it.product,model:it.model,description:"",quantity_kg:it.quantity_kg,unit_price_per_kg:it.unit_price_per_kg,amount:0}));
  const doc={date:d.date,invoice_no:d.doc_no,currency:d.currency,warnings:d.warnings||[],items:its,total_amount:d.amount,expense_category:d.expense_category,
    seller:{name:kind==="exp"?d.party:""},buyer:{name:kind==="sale"?d.party:"",country:""},
    payment:{direction:kind==="pay"?(d.kind==="pay_out"?"out":"in"):"",amount:d.amount,date:d.date,bank:d.bank,sender:d.kind==="pay_in"?d.party:"",receiver:d.kind==="pay_out"?d.party:"",reference:""}};
  if(kind==="pay"&&((d.kind==="pay_out"&&top.v.lotId)||(d.kind==="pay_in"&&top.v.target))) doc.payment[d.kind==="pay_out"?"receiver":"sender"]="";
  const ai=applyAI(top,doc), v=top.v;
  if(kind==="sale"){
    if(d.market){ v.market=d.market; ai.filled.push("pazar"); }
    else { const cp=S.parties[v.customerId]; const c=key(cp?.country); if(c) v.market=/irak/.test(c)?"irak":/türkiye/.test(c)?"ic":"diger"; }
    if(d.due_date){ v.dueDate=d.due_date; ai.filled.push("vade"); }
    if(d.plate){ v.plate=d.plate; ai.filled.push("plaka"); }
    if(!its.some(it=>it.unit_price_per_kg>0)&&its.length) ai.warn.push("Fiyat yazılmadı; kalemlere fiyat gir.");
  }
  if(kind==="pay"){ if(refLot||refSale) ai.filled.push(refLot?`alım ${lotById(refLot).code}`:"satış"); if(d.pay_kind) ai.filled.push("ödeme türü"); }
  if(kind==="exp"){ if(refSale||refLot) ai.filled.push(refSale?"bağlı satış":`alım ${lotById(refLot).code}`); else ai.warn.push("Masrafın hangi satışa ya da alıma ait olduğunu seç (genel masrafsa “Genel”)."); }
  if(d.note) v.note=[v.note,d.note].filter(Boolean).join("\n");
  ai.warn=ai.warn.map(w=>/^Belgeden kullanılabilir bilgi/.test(w)?"Cümleden forma aktarılacak bilgi çıkmadı. Kim, ne, ne kadar gibi ayrıntıları ekleyip tekrar dene.":w);
  ai.src="cumle"; ai.text=txt; top.ai=ai; top.v={...v}; S.qtext=""; renderSheet();
}
function aiAddParty(){
  const top=S.stack[S.stack.length-1]; const pr=top?.ai?.party; if(!pr) return;
  top.v={...top.v,...readForm()};
  partyForm({kind:pr.kind,name:pr.name||"",person:pr.person||"",phone:pr.phone||"",email:pr.email||"",web:pr.web||"",country:matchList(pr.country,"origins")||pr.country||"",city:pr.city||"",address:pr.address||"",bank:pr.bank||"",note:pr.tax_no?`Vergi no: ${pr.tax_no}`:""},pr.kind,(id,name)=>{ S.pending[id]=name; top.v[pr.field==="customerId"&&top.o.aiKind==="pay"?"cusId":pr.field==="supplierId"&&top.o.aiKind==="pay"?"supId":pr.field]=id; top.ai.party=null; top.ai.filled.push("yeni firma eklendi"); },true);
}
function formR(d){ AI_KIND=d.o.aiKind||null; const body=`${d.ai?aiNoteHTML(d.ai):""}<form class="form" id="frm" novalidate>${d.o.fields.map(f=>fieldHTML(f,d.v)).join("")}</form>`; AI_KIND=null; return {title:d.o.title, body,
  foot:`<div class="ferr" id="ferr" hidden></div>${d.o.onDelete?`<button class="btn danger" type="button" data-act="form-del">Sil</button>`:""}<button class="btn" type="button" data-act="back">Vazgeç</button><span class="sp"></span><button class="btn pri" type="button" data-act="form-save">Kaydet</button>`}; }
function selOptions(f,v,val){
  let opts=typeof f.options==="function"?f.options(v):f.options;
  if(val!==""&&val!=null&&!opts.some(o=>String(o[0])===String(val))) opts=[...opts,[val,f.labelOf?f.labelOf(val):val]];
  if(f.quick && canWrite) opts=[...opts,["__new",f.quickLabel||"+ Yeni ekle…"]];
  return opts;
}
function fieldHTML(f,v){
  if(f.section) return `<h4 class="fsec" ${f.showIf?`data-f="${f.section}" data-sec="1"`:""}>${f.section}</h4>`;
  if(f.details) return `<details class="fdet" ${f.open?.(v)?"open":""}><summary>${f.details}</summary><div class="form">`;
  if(f.detailsEnd) return `</div></details>`;
  if(f.type==="list"){ let vals=Array.isArray(v[f.k])?v[f.k]:String(v[f.k]||"").split(/[\s,;]+/).filter(Boolean); if(!vals.length) vals=[""];
    return `<div class="fld" data-f="${f.k}"><span class="lbl">${f.label}</span><div class="mlist" data-k="${f.k}" data-t="list">${vals.map((x,i)=>`<div class="mrow"><input type="text" autocomplete="off" autocapitalize="characters" value="${esc(x)}" placeholder="${esc(f.ph||"")}" aria-label="${esc(f.label)} ${i+1}"><button type="button" class="iconbtn" data-act="list-del" data-k="${f.k}" data-i="${i}" aria-label="Sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',14)}</button></div>`).join("")}</div><button class="btn sm" type="button" data-act="list-add" data-k="${f.k}" style="align-self:flex-start">+ ${f.addLabel}</button>${f.hint?`<span class="hint">${f.hint}</span>`:""}</div>`; }
  if(f.type==="files"){ const fs=v.__files||[];
    return `<div class="fld" data-f="files"><span class="lbl">${f.label}</span>${assets&&canWrite?`<div class="upl"><label class="btn sm pri">${svg(IC_CAM,15)}Fotoğraf çek<input type="file" accept="image/*" capture="environment" hidden data-ffile="1"></label><label class="btn sm">${svg(IC_IMG,15)}Galeri / PDF<input type="file" accept="image/*,application/pdf" multiple hidden data-ffile="1"></label><button type="button" class="btn sm" data-act="paste-doc">${svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',14)}Yapıştır</button></div>${fs.length?`<div class="chips" style="flex-wrap:wrap">${fs.map((x,i)=>`<span class="chip" aria-pressed="false">${esc(x.name||"fotoğraf")}<button type="button" class="xbtn" data-act="ffile-del" data-i="${i}" aria-label="Kaldır">×</button></span>`).join("")}</div>`:""}${fs.length&&window.__fn&&AI_KIND?`<button class="btn sm ai" type="button" data-act="ai-fill">${svg(IC_SPARK,15)}Belgeden formu doldur</button>`:""}<span class="hint">${f.hint||(window.__fn&&AI_KIND?"Fotoğrafı ekleyip “Belgeden formu doldur” dersen bilgileri yapay zekâ okur; sen kontrol edip kaydedersin.":"Kaydedince fotoğraf tarayıcıda düzeltilip PDF olarak eklenir.")}</span>`:`<span class="hint">Belge ekleme bu görünümde kullanılamıyor.</span>`}</div>`; }
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
    <label class="c-a">Ürün<select data-ik="productId" data-rowsel="${i}">${po.map(o=>opt(o,it.productId)).join("")}</select></label>
    <label class="c-b">Model<input data-ik="model" type="text" list="ml_${i}" autocomplete="off" value="${esc(it.model||"")}" placeholder="ör. W320"><datalist id="ml_${i}">${modelsOf(it.productId).map(m=>`<option value="${esc(m)}">`).join("")}</datalist></label>
    <label class="c-k">Miktar (kg)<input data-ik="kg" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.kg))}"></label>
    <label class="c-f">Birim fiyat<input data-ik="price" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.price))}"></label>
    <button type="button" class="iconbtn c-x" data-act="row-del" data-i="${i}" aria-label="Satırı sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',16)}</button></div>`; }).join("");
  return `<div class="fld" data-f="items"><span class="lbl">${f.label}</span><div class="items">${rows}</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn sm" type="button" data-act="row-add">+ ${f.addLabel}</button><span class="hint" id="itot"></span></div></div>`;
}
function stockOptions(v,curSale){
  const groups=new Map();
  const extra=new Map(); if(curSale) for(const ln of curSale.items) extra.set(lnRef(ln),(extra.get(lnRef(ln))||0)+(+ln.kg||0));
  const chosen=new Set((v.items||[]).map(r=>r.ref).filter(Boolean));
  for(const [key0,ci] of C.item) for(const loc of ["","irak"]){
    const ref=key0+(loc?"|irak":"");
    const left=locLeft(ci,loc)+(extra.get(ref)||0);
    if(!(left>0.0001) && !chosen.has(ref)) continue;
    if(ci.lot.status==="kapandi" && !chosen.has(ref)) continue;
    const g=itemProd(ci.it); if(!groups.has(g)) groups.set(g,[]);
    const where = loc ? "IRAK DEPOSU" : STI[ci.lot.status]<4 ? ST[STI[ci.lot.status]].s : (ci.irakIn ? "Mersin SB" : "");
    groups.get(g).push([ref,`${ci.it.model||"model yok"} · ${ci.lot.code} · ${nf0.format(Math.max(0,left))} kg kaldı · ${ci.lot.ortak?.on?"ORTAK":firmName(ci.lot.firmId)}${where?" · "+where:""}`]);
  }
  return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],"tr"));
}
function saleItemsHTML(f,v){
  const items=v.items&&v.items.length?v.items:[{}];
  const groups=stockOptions(v,v.__orig);
  const rows=items.map((it,i)=>`<div class="irow sale" data-row="${i}">
    <label class="c-a2">Stoktaki mal<select data-ik="ref"><option value="">Seç…</option>${groups.map(([g,os])=>`<optgroup label="${esc(g)}">${os.map(o=>opt(o,it.ref)).join("")}</optgroup>`).join("")}</select></label>
    <label class="c-k">Miktar (kg)<input data-ik="kg" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.kg))}"></label>
    <label class="c-f">Birim fiyat<input data-ik="price" data-t="num" type="text" inputmode="decimal" autocomplete="off" value="${esc(numv(it.price))}"></label>
    <button type="button" class="iconbtn c-x" data-act="row-del" data-i="${i}" aria-label="Kalemi sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',16)}</button></div>`).join("");
  return `<div class="fld" data-f="items"><span class="lbl">${f.label}</span>${groups.length?"":`<span class="hint" style="color:var(--warn)">Stokta satılacak mal görünmüyor. Önce alım gir.</span>`}<div class="items">${rows}</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn sm" type="button" data-act="row-add">+ ${f.addLabel}</button><span class="hint" id="itot"></span></div></div>`;
}
function readForm(){
  const v={}; const f=document.getElementById("frm"); if(!f) return v;
  f.querySelectorAll("[data-k]").forEach(el=>{
    const k=el.dataset.k;
    if(el.dataset.t==="list") return;
    if(el.dataset.t==="seg") v[k]=el.querySelector('[aria-checked="true"]')?.dataset.v ?? "";
    else if(el.dataset.t==="num") v[k]=parseNum(el.value);
    else v[k]=el.value.trim();
  });
  f.querySelectorAll('[data-t="list"]').forEach(el=>{ v[el.dataset.k]=[...el.querySelectorAll("input")].map(i=>i.value.trim().toUpperCase()); });
  const rows=[...f.querySelectorAll(".irow")];
  if(rows.length){ v.items=rows.map(r=>{ const o={}; if(r.dataset.rk) o.k=r.dataset.rk; r.querySelectorAll("[data-ik]").forEach(e=>{ o[e.dataset.ik]=e.dataset.t==="num"?parseNum(e.value):e.value.trim(); }); return o; }); }
  return v;
}
function bindForm(d){
  const f=document.getElementById("frm"); if(!f) return;
  const upd=()=>{ const v=readForm(); for(const fl of d.o.fields){ if(!fl.showIf) continue; const el=f.querySelector(`[data-f="${fl.section||fl.k}"]`); if(el) el.hidden=!fl.showIf(v); } autoKur(f,v); d.o.onChange?.(v,f); };
  f.addEventListener("click",e=>{ const b=e.target.closest(".seg button"); if(!b) return; b.parentElement.querySelectorAll("button").forEach(x=>x.setAttribute("aria-checked",String(x===b))); upd(); });
  f.addEventListener("input",e=>{ if(e.target.id==="f_kur") e.target.dataset.auto="0"; upd(); });
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
const TYPE2COL={lot:"lots",sale:"sales",pay:"pays",exp:"exps"};
async function waitRec(col,id){ for(let i=0;i<40;i++){ const r=colArr(col).find(x=>x.id===id); if(r) return r; await new Promise(z=>setTimeout(z,100)); } return null; }
async function handleFiles(col,id,files,kind){
  if(!assets) return; await waitRec(col,id);
  const pdfs=files.filter(f=>!(f.type||"").startsWith("image/")), imgs=files.filter(f=>(f.type||"").startsWith("image/"));
  if(pdfs.length) await uploadFiles(col,id,pdfs,kind);
  if(imgs.length) startScanFiles(col,id,imgs,kind);
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
    S.stack.pop(); let target=top.o.docTarget||null;
    if(typeof r==="object"&&r?.open){ S.stack.push(r.open); target={col:TYPE2COL[r.open.type],id:r.open.id}; }
    renderSheet(); toast("Kaydedildi");
    const files=top.v.__files||[]; if(files.length && target) handleFiles(target.col,target.id,files,top.o.docKind||DOCK[target.col][0]); }
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
function kurFor(date){ const m=S.settings.kurlar?.usd; if(!m) return null; let best=null; for(const k of Object.keys(m).sort()){ if(k<=date) best=k; else break; } return best?{rate:m[best].a,date:best}:null; }
function autoKur(f,v){
  const el=f.querySelector("#f_kur"); if(!el||v.cur!=="TL") return;
  const date=v.date||v.orderDate||today(); const k=kurFor(date)||(lastKur()?{rate:lastKur(),date:""}:null);
  if(k && (el.value===""||el.dataset.auto==="1") && el.dataset.autoFor!==date){ el.value=numv(k.rate); el.dataset.auto="1"; el.dataset.autoFor=date; }
  const h=el.parentElement.querySelector(".hint"); if(h) h.textContent = k&&k.date ? (el.dataset.auto==="1" ? `TCMB ${fd(k.date)} döviz alış kuru` : `TCMB ${fd(k.date)}: ${nf4.format(k.rate)} (elle değiştirdin)`) : "Dolar karşılığı bu kurla hesaplanır";
}
function lastKur(){ try{ return parseNum(localStorage.getItem("pd.kur")); }catch(e){ return null; } }
function rememberKur(k){ if(k>0) save("pd.kur",String(k)); }
const stamp = (o,isNew) => { const n=new Date().toISOString(); if(isNew){ o.createdAt=n; o.createdBy=me||null; } o.updatedAt=n; o.updatedBy=me||null; return o; };
const addLog = (l,x) => [...(l.log||[]), {t:new Date().toISOString(), by:me||null, x}].slice(-80);
const defFirm = () => S.firm==="all" ? "a" : S.firm;
const firmSeg = (extra={}) => ({k:"firmId",label:"Hangi firma üzerinden?",type:"seg",options:[["a",firmName("a")],["b",firmName("b")]],...extra});
const curFields = (unit=true) => [
  ...(unit?[{k:"priceUnit",label:"Fiyat birimi",type:"seg",options:[["kg","/ kg"],["ton","/ ton"]],half:true,def:"kg"}]:[]),
  {k:"cur",label:"Para birimi",type:"seg",options:[["USD","USD $"],["TL","TL ₺"]],def:"USD",half:true},
  {k:"kur",label:"Kur (1 $ = ? ₺)",type:"num",half:true,req:true,showIf:v=>v.cur==="TL",hint:"Dolar karşılığı bu kurla hesaplanır"},
];
const partySel = (k,kind,label,extra={}) => ({k,label,type:"select",quick:kind,quickLabel:kind==="supplier"?"+ Yeni tedarikçi ekle…":"+ Yeni müşteri / ortak ekle…",options:()=>[["","Seç…"],...partiesOf(kind).map(p=>[p.id,p.name])],labelOf:id=>partyName(id),...extra});
const listSel = (k,lk,label,extra={}) => ({k,label,type:"select",quick:lk,quickLabel:`+ Yeni ${LISTNAME[lk][1]} ekle…`,options:()=>[["","Seç…"],...lists(lk).map(x=>[x,x])],...extra});

/* --- alım formu --- */
function lotForm(l){
  const isNew=!l;
  const v=l?{...l,items:l.items.map(it=>({...it})),ortakOn:l.ortak?.on?"1":"0",partnerId:l.ortak?.partnerId||"",share:l.ortak?.share??50,supplierId:l.supplierId||""}
           :{firmId:defFirm(),status:"siparis",transport:"gemi",incoterm:"CIF Mersin",orderDate:today(),cur:"USD",priceUnit:"kg",items:[{}],ortakOn:"0",share:50,cntNos:[""]};
  if(l) v.cntNos=cntList(l).length?cntList(l):[""];
  const shipKeys=["carrier","bl","booking","eta","loadDate","arriveDate","vessel","note","invoiceNo","payDue","trucker","cmr"];
  openForm({title:isNew?"Yeni alım":"Alımı düzenle", values:v, docTarget:l?{col:"lots",id:l.id}:null, aiKind:"lot", fields:[
    {k:"files",type:"files",label:"Alış faturası / proforma"},
    {section:"Alım"},
    firmSeg(),
    partySel("supplierId","supplier","Tedarikçi",{req:true}),
    listSel("origin","origins","Menşe"),
    {k:"items",type:"lotitems",label:"Ürünler — her model ayrı satır, kendi fiyatıyla",addLabel:"Model / ürün ekle"},
    ...curFields(),
    {k:"ortakOn",label:"Irak'taki bir firmayla ortak alım mı?",type:"seg",options:[["0","Hayır"],["1","Evet, ortak alım"]]},
    partySel("partnerId","customer","Ortak firma",{showIf:x=>x.ortakOn==="1",req:true,half:true}),
    {k:"share",label:"Bizim kâr payımız (%)",type:"num",half:true,showIf:x=>x.ortakOn==="1",req:true},
    {k:"onote",type:"note",showIf:x=>x.ortakOn==="1",text:"Mal bizim firmamız üzerine alınır, alış ve masrafları biz öderiz. Ortak malı orada satar; sen ortağın satışlarını bu alıma girersin. Sistem ortağın sana göndermesi gerekeni hesaplar: <b>sermaye + bizim masraflar + kâr payımız</b>. Gelen havaleleri bu alımın sayfasından girersin."},
    {details:"Sevkiyat, tarihler ve not (sonra da girebilirsin)",open:x=>shipKeys.some(k=>x[k])||(x.cntNos||[]).some(Boolean)},
    TRANSPORT_SEG,
    {k:"carrier",label:"Gemi firması",half:true,list:()=>uniq([...lists("carriers"),...S.lots.map(z=>z.carrier)]),ph:"COSCO, MSC…",showIf:x=>!isTir(x)},
    {k:"cnt",label:"Konteyner sayısı",type:"num",half:true,showIf:x=>!isTir(x)},
    {k:"cntNos",type:"list",label:"Konteyner no",addLabel:"Konteyner ekle",ph:"MSCU1234567",showIf:x=>!isTir(x)},
    {k:"bl",label:"Konşimento (B/L) no",half:true,showIf:x=>!isTir(x)},
    {k:"booking",label:"Booking no",half:true,showIf:x=>!isTir(x)},
    ...tirFields(),
    {k:"orderDate",label:"Sipariş tarihi",type:"date",half:true},
    {k:"eta",label:"Tahmini varış",type:"date",half:true},
    {k:"loadDate",label:"Yükleme tarihi",type:"date",half:true},
    {k:"arriveDate",label:"Mersin'e varış",type:"date",half:true},
    {k:"incoterm",label:"Teslim şekli",half:true,list:["CIF Mersin","CFR Mersin","FOB","EXW"]},
    {k:"invoiceNo",label:"Fatura no",half:true},
    {k:"payDue",label:"Tedarikçi bakiye vadesi",type:"date",half:true,hint:"Vadesi gelince ve geçince bildirim gelir"},
    {k:"note",label:"Not",type:"textarea",rows:2},
    {detailsEnd:true},
  ], onChange:(x,f)=>{
    syncCntRows(f,x.cnt);
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
      status:l?l.status:"siparis",cntNos:(x.cntNos||[]).filter(Boolean),bl:(x.bl||"").toUpperCase(),booking:(x.booking||"").toUpperCase(),carrier:x.carrier||"",vessel:x.vessel||l?.vessel||"",transport:x.transport==="tir"?"tir":"gemi",trucker:(x.trucker||"").trim(),cmr:(x.cmr||"").trim().toUpperCase(),plates:(x.plates||[]).map(p=>p.trim().toUpperCase()).filter(Boolean),orderDate:x.orderDate||"",loadDate:x.loadDate||"",eta:x.eta||"",arriveDate:x.arriveDate||"",invoiceNo:(x.invoiceNo||"").trim(),payDue:x.payDue||"",note:x.note||""});
    doc.cnt=Math.max(doc.cntNos.length,+x.cnt||0);
    const sd={...(doc.statusDates||{})};
    if(isNew){ doc.code=nextCode(x.orderDate); sd.siparis=x.orderDate||today(); doc.log=addLog({},"Alım oluşturuldu"); }
    else doc.log=addLog(l,"Bilgiler düzenlendi");
    doc.statusDates=sd; stamp(doc,isNew);
    let id=l?.id;
    if(isNew){ const ref=db.collection("lots").doc(); id=ref.id; await ref.set(doc); } else await db.doc("lots/"+l.id).set(doc);
    await addModels(items);
    return isNew ? {open:{type:"lot",id}} : undefined;
  }});
}
function syncCntRows(f,n){
  const box=f.querySelector('.mlist[data-k="cntNos"]'); if(!box) return; n=Math.min(+n||0,30);
  while(box.children.length<n){ const i=box.children.length; const d=document.createElement("div"); d.className="mrow";
    d.innerHTML=`<input type="text" autocomplete="off" autocapitalize="characters" placeholder="MSCU1234567" aria-label="Konteyner no ${i+1}"><button type="button" class="iconbtn" data-act="list-del" data-k="cntNos" data-i="${i}" aria-label="Sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',14)}</button>`; box.appendChild(d); }
}
/* aşama değişince sadece o aşamanın bilgisini sor */
function stepTo(id,k,ok){
  const l=lotById(id); if(!l||l.status===k) return;
  if(k==="kapandi"&&!ok){ const left=sum(l.items,it=>{ const ci=C.item.get(l.id+"|"+it.k); return ci?Math.max(0,itemStock(ci)):0; });
    if(left>0.5) return openSheet({type:"ask",id,k}); }
  if(STI[k]<STI[l.status]) return setStatus(id,k);
  if(k==="onodeme") return payForm(null,{dir:"out",lotId:id,kind:"Ön ödeme",title:"Ön ödeme ne kadar?"});
  const F={
    yuklendi:{title:"Yüklendi",fields:[TRANSPORT_SEG,{k:"loadDate",label:"Yükleme tarihi",type:"date",half:true,def:today()},{k:"carrier",label:"Gemi firması",half:true,list:()=>uniq([...lists("carriers"),...S.lots.map(z=>z.carrier)]),showIf:x=>!isTir(x)},{k:"cnt",label:"Konteyner sayısı",type:"num",half:true,showIf:x=>!isTir(x)},{k:"cntNos",type:"list",label:"Konteyner no",addLabel:"Konteyner ekle",ph:"MSCU1234567",showIf:x=>!isTir(x)},{k:"bl",label:"Konşimento (B/L) no",half:true,showIf:x=>!isTir(x)},{k:"booking",label:"Booking no",half:true,showIf:x=>!isTir(x)},...tirFields(),{k:"eta",label:"Tahmini varış",type:"date",half:true},{k:"files",type:"files",label:"Konşimento / CMR / packing list",hint:"İsteğe bağlı."}],docKind:l.transport==="tir"?"CMR / taşıma belgesi":"Konşimento (B/L)"},
    yolda:{title:"Yolda",fields:[{k:"eta",label:"Tahmini Mersin varışı",type:"date"},l.transport==="tir"?{k:"trucker",label:"Nakliye firması",list:()=>uniq(S.lots.map(z=>z.trucker))}:{k:"carrier",label:"Gemi firması",list:()=>uniq([...lists("carriers"),...S.lots.map(z=>z.carrier)])}]},
    depoda:{title:"Mersin Serbest Bölge'ye geldi",fields:[{k:"arriveDate",label:"Varış tarihi",type:"date",def:today()}]},
  }[k];
  if(!F) return setStatus(id,k);
  const v={transport:l.transport||"gemi",trucker:l.trucker||"",cmr:l.cmr||"",plates:(l.plates||[]).length?l.plates:[""],loadDate:l.loadDate||(k==="yuklendi"?today():""),carrier:l.carrier||"",cnt:l.cnt||"",cntNos:cntList(l).length?cntList(l):[""],bl:l.bl||"",booking:l.booking||"",eta:l.eta||"",arriveDate:l.arriveDate||(k==="depoda"?today():"")};
  openForm({title:`${l.code} · ${F.title}`,values:v,fields:F.fields,docTarget:{col:"lots",id},docKind:F.docKind,
    onChange:(x,f)=>syncCntRows(f,x.cnt),
    onSave: async x=>{
      const upd={status:k,statusDates:{...(l.statusDates||{}),[k]:x.loadDate&&k==="yuklendi"?x.loadDate:x.arriveDate&&k==="depoda"?x.arriveDate:today()},log:addLog(l,`Aşama: ${ST[STI[l.status]].t} → ${ST[STI[k]].t}`),updatedAt:new Date().toISOString(),updatedBy:me||null};
      for(const f of F.fields){ if(!f.k||f.type==="files") continue; let val=x[f.k]; if(f.k==="cntNos"||f.k==="plates") val=(val||[]).map(z=>z.trim().toUpperCase()).filter(Boolean); if(f.k==="bl"||f.k==="booking"||f.k==="cmr") val=(val||"").toUpperCase(); if(val!==undefined&&val!==null&&f.k!=="cnt") upd[f.k]=val; }
      if(F.fields.some(f=>f.k==="cnt")) upd.cnt=Math.max((upd.cntNos||[]).length,+x.cnt||0);
      await db.doc("lots/"+id).update(upd);
    }});
}
async function addModels(items){
  const add=new Map();
  for(const it of items){ const p=S.products[it.productId]; if(!p||!it.model) continue; const cur=[...(add.get(it.productId)||p.models||[])]; if(!cur.some(m=>key(m)===key(it.model))){ cur.push(it.model); add.set(it.productId,cur); } }
  for(const [pid,models] of add) try{ await db.doc("products/"+pid).update({models}); }catch(e){}
}
function nextCode(d){ const yy=(d||today()).slice(2,4); const n=S.lots.map(l=>String(l.code||"")).filter(c=>/^[AP]\d\d-/.test(c)&&c.slice(1,3)===yy).map(c=>parseInt(c.slice(4),10)||0); return `A${yy}-${String((n.length?Math.max(...n):0)+1).padStart(3,"0")}`; }

/* --- satış formu --- */
const saleOrtakLot = x => { for(const r of (x.items||[])){ const ci=r.ref?C.item.get(refKey(r.ref)):null; if(ci?.lot?.ortak?.on) return ci.lot; } return null; };
function saleForm(s,lotId){
  const isNew=!s;
  let v;
  if(s) v={...s,__orig:s,items:s.items.map(ln=>({ref:lnRef(ln),kg:ln.kg,price:ln.price}))};
  else { const l=lotById(lotId); const items=l?l.items.flatMap(it=>{const ci=C.item.get(l.id+"|"+it.k); if(!ci) return []; const o=[]; if(hereLeft(ci)>0) o.push({ref:l.id+"|"+it.k}); if(irakLeft(ci)>0) o.push({ref:l.id+"|"+it.k+"|irak"}); return o;}):[{}];
    v={date:today(),market:"irak",cur:"USD",priceUnit:"kg",items:items.length?items:[{}],customerId:l?.ortak?.on?l.ortak.partnerId:""}; }
  openForm({title:isNew?"Yeni satış":"Satışı düzenle", values:v, docTarget:s?{col:"sales",id:s.id}:null, aiKind:"sale", fields:[
    {k:"files",type:"files",label:"Satış faturası"},
    {k:"items",type:"saleitems",label:"Satılan mallar — her model ayrı kalem",addLabel:"Kalem ekle"},
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"market",label:"Pazar",type:"seg",options:Object.entries(MK),half:true},
    partySel("customerId","customer","Müşteri",{req:true,showIf:x=>!saleOrtakLot(x)}),
    {k:"onote",type:"note",showIf:x=>!!saleOrtakLot(x),text:"Ortak alım malı seçtin. Bu satış ortak firma adına, ortak alımın hesabına kaydedilir. Ortağın orada yaptığı satışın kg ve fiyatını gir."},
    ...curFields(),
    {details:"Fatura no, vade, teslim ve ödeme şekli, plaka, not",open:x=>!!(x.docNo||x.plate||x.note||x.dueDate||x.incoterm||x.payTerms)},
    {k:"docNo",label:"Fatura / belge no",half:true},
    {k:"dueDate",label:"Ödeme vadesi",type:"date",half:true,hint:"Vadesi gelince ve geçince telefonuna bildirim gelir"},
    {k:"incoterm",label:"Teslim şekli",half:true,list:["EXW Mersin Serbest Bölge","FCA Mersin Serbest Bölge","DAP Zaho","DAP Erbil","DAP Bağdat"]},
    {k:"payTerms",label:"Ödeme şekli",half:true,list:["%100 peşin","%30 peşin, %70 yüklemeden önce","Mal tesliminde nakit","Vesaik mukabili","Akreditif"]},
    {k:"plate",label:"Araç / plaka",half:true},
    {k:"note",label:"Not",type:"textarea",rows:2},
    {detailsEnd:true},
  ], onChange:(x,f)=>{ const t=f.querySelector("#itot"); if(!t) return; const tot=sum((x.items||[]).filter(r=>r.kg>0&&r.price>0),r=>r.kg*(x.priceUnit==="ton"?r.price/1000:r.price)); t.textContent=tot?`Toplam: ${moneyf(tot,x.cur)}`:""; },
  onSave: async x=>{
    const rows=(x.items||[]).filter(r=>r.ref||r.kg||r.price);
    if(!rows.length) return "En az bir kalem gir.";
    const used=new Map(); const lines=[]; let firm=null, olot=null, plain=false;
    const extra=new Map(); if(s) for(const ln of s.items) extra.set(lnRef(ln),(extra.get(lnRef(ln))||0)+(+ln.kg||0));
    for(const [i,r] of rows.entries()){
      if(!r.ref) return `${i+1}. kalemde stoktaki malı seç.`; const ci=C.item.get(refKey(r.ref)); if(!ci) return `${i+1}. kalemdeki mal bulunamadı.`;
      if(!(r.kg>0)) return `${i+1}. kalemde miktar gir.`; if(r.price==null) return `${i+1}. kalemde fiyat gir.`;
      const loc=refLoc(r.ref); const left=locLeft(ci,loc)+(extra.get(r.ref)||0)-(used.get(r.ref)||0);
      if(r.kg>left+0.001) return `${ci.lot.code} ${itemLabel(ci.it)}: ${loc?"Irak deposunda":"burada"} sadece ${nf0.format(Math.max(0,left))} kg var.`;
      used.set(r.ref,(used.get(r.ref)||0)+r.kg);
      if(firm&&firm!==ci.lot.firmId) return "Farklı firmaların malları aynı satışta olamaz; ayrı satış gir."; firm=ci.lot.firmId;
      if(ci.lot.ortak?.on){ if(olot&&olot.id!==ci.lot.id) return "İki farklı ortak alımın malı aynı satışta olamaz."; olot=ci.lot; } else plain=true;
      const [lotId,ik]=r.ref.split("|");
      lines.push({lotId,ik,kg:r.kg,price:r.price,ppk:x.priceUnit==="ton"?r.price/1000:r.price,...(loc?{loc}:{})});
    }
    if(olot&&plain) return "Ortak alım malları ayrı bir satış olarak girilmeli.";
    const customerId = olot ? olot.ortak.partnerId : x.customerId; if(!customerId) return "Müşteri seç.";
    if(x.cur==="TL") rememberKur(x.kur);
    const doc={...(s||{})}; delete doc.id; delete doc.__orig; for(const k of ["lotId","kg","price","ppk","customer"]) delete doc[k];
    Object.assign(doc,{firmId:firm,date:x.date,market:x.market,customerId,items:lines,priceUnit:x.priceUnit||"kg",cur:x.cur,kur:x.cur==="TL"?x.kur:null,docNo:x.docNo||"",plate:x.plate||"",note:x.note||"",dueDate:x.dueDate||"",incoterm:x.incoterm||"",payTerms:x.payTerms||"",ortakLotId:olot?.id||""});
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
  if(p) v={...p,supId:p.dir==="out"?p.partyId||"":"",cusId:p.dir==="in"?p.partyId||"":"",target:p.dir==="in"?(p.saleId?"s:"+p.saleId:p.lotId?"l:"+p.lotId:""):"",bankOut:p.dir==="out"?p.bank||"":"",bankIn:p.dir==="in"?p.bank||"":""};
  else v={dir:"out",date:today(),cur:"USD",method:"Havale",kind:"Ön ödeme",firmId:defFirm(),...(pre||{})};
  if(isNew && v.dir==="in" && !pre?.kind) v.kind="Tahsilat";
  const lotOpts=()=>[["","— Alıma bağlama —"],...S.lots.filter(l=>l.id===v.lotId||l.status!=="kapandi"||LC(l).due>1).sort((a,b)=>String(b.code).localeCompare(String(a.code))).map(l=>[l.id,`${l.code} · ${lotProducts(l)} · ${lotSupplier(l)}${LC(l).due>1?" · kalan "+usdf(LC(l).due):""}`])];
  const tgtOpts=()=>[["","— Bağlama —"],
    ...S.sales.filter(s=>!SC(s).olot&&(SC(s).due>1||"s:"+s.id===v.target)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(s=>["s:"+s.id,`Satış ${fds(s.date)} · ${saleCustomer(s)} · kalan ${usdf(SC(s).due)}`]),
    ...S.lots.filter(l=>l.ortak?.on&&(LC(l).odue>1||"l:"+l.id===v.target)).map(l=>["l:"+l.id,`Ortak alım ${l.code} · ${partyName(l.ortak.partnerId)} · kalan ${usdf(LC(l).odue)}`])];
  const title=pre?.title; delete v.title;
  openForm({title:isNew?(title||(v.dir==="out"?"Tedarikçiye ödeme":"Tahsilat")):"Kaydı düzenle", values:v, docTarget:p?{col:"pays",id:p.id}:null, aiKind:"pay", fields:[
    {k:"dir",label:"Tür",type:"seg",options:[["out","Tedarikçiye ödeme"],["in","Tahsilat"]]},
    {k:"files",type:"files",label:"Dekont"},
    {k:"lotId",label:"Hangi alım için?",type:"select",options:lotOpts,showIf:x=>x.dir==="out",hint:"Seçersen tedarikçi ve firma alımdan gelir"},
    partySel("supId","supplier","Tedarikçi",{showIf:x=>x.dir==="out"&&!x.lotId,req:true}),
    {k:"target",label:"Hangi satış / ortak alım için?",type:"select",options:tgtOpts,showIf:x=>x.dir==="in",hint:"Seçersen müşteri ve firma oradan gelir"},
    partySel("cusId","customer","Müşteri / ortak",{showIf:x=>x.dir==="in"&&!x.target,req:true}),
    firmSeg({label:"Firma",showIf:x=>!(x.dir==="out"?x.lotId:x.target)}),
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"amount",label:"Tutar",type:"num",half:true,req:true,hint:" "},
    ...curFields(false),
    acctSel("bankOut","Hangi bankadan / kasadan ödendi",{showIf:x=>x.dir==="out",half:true}),
    acctSel("bankIn","Hangi bankaya / kasaya geldi",{showIf:x=>x.dir==="in",half:true}),
    {k:"kind",label:"Açıklama",half:true,list:["Ön ödeme","Ara ödeme","Bakiye","Tahsilat","Kısmi tahsilat","Avans","Ortak hesap havalesi"]},
    {details:"Yöntem ve not",open:x=>!!x.note},
    {k:"method",label:"Yöntem",half:true,list:["Havale","Nakit","Akreditif","Vesaik mukabili","Çek"]},
    {k:"note",label:"Not",type:"textarea",rows:2},
    {detailsEnd:true},
  ], onChange:(x,f)=>{
    const h=f.querySelector('[data-f="amount"] .hint'); if(!h) return; let t="";
    if(x.dir==="out"&&x.lotId){ const l=lotById(x.lotId); if(l){ const c=LC(l); t=`Alış ${moneyf(c.cost,l.cur)} · ödenen ${usdf(c.paid)} · kalan ${usdf(c.due)}`; if(!c.paid&&x.kind==="Ön ödeme") t+=` · %30'u ${usdf(c.costUSD*0.3)}`; } }
    else if(x.dir==="in"&&x.target){ const [k2,id]=x.target.split(":"); if(k2==="s"){ const s2=saleById(id); if(s2) t=`Kalan alacak ${usdf(SC(s2).due)}`; } else { const l=lotById(id); if(l) t=`Ortaktan kalan ${usdf(LC(l).odue||0)}`; } }
    h.textContent=t;
  }, onSave: async x=>{
    if(x.cur==="TL") rememberKur(x.kur);
    const doc={...(p||{})}; delete doc.id; delete doc.party;
    Object.assign(doc,{dir:x.dir,date:x.date,amount:x.amount,cur:x.cur,kur:x.cur==="TL"?x.kur:null,kind:x.kind||"",method:x.method||"",bank:(x.dir==="out"?x.bankOut:x.bankIn)||"",note:x.note||"",firmId:x.firmId||defFirm(),lotId:"",saleId:"",partyId:""});
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
  openForm({title:isNew?"Yeni masraf":"Masrafı düzenle", values:v, docTarget:x?{col:"exps",id:x.id}:null, aiKind:"exp", fields:[
    {k:"files",type:"files",label:"Masraf faturası / makbuz"},
    listSel("cat","expcats","Masraf türü",{req:true}),
    {k:"link",label:"Hangi işin masrafı?",type:"seg",options:[["sale","Bir satış"],["lot","Bir alım"],["none","Genel"]],hint:"Bağladığın işin kârından düşülür"},
    {k:"saleId",label:"Satış",type:"select",options:saleOpts,showIf:y=>y.link==="sale",req:true},
    {k:"lotId",label:"Alım",type:"select",options:lotOpts,showIf:y=>y.link==="lot",req:true},
    firmSeg({label:"Firma",showIf:y=>y.link==="none"}),
    {k:"paidBy",label:"Bu masrafı kim ödedi?",type:"seg",options:[["biz","Biz ödedik"],["ortak","Ortak ödedi"]],showIf:y=>!!expLinkLot(y),hint:"Ortak alım: biz ödediysek ortaktan geri alınır, ortak ödediyse onun payından düşülür"},
    {k:"payee",label:"Kime ödendi",list:()=>uniq(S.exps.map(e=>e.payee||e.party)),ph:"Gümrükçü, nakliyeci…"},
    acctSel("bank","Hangi hesaptan ödendi",{showIf:y=>y.paidBy!=="ortak",hint:"İsteğe bağlı; Asya Çerez banka/kasa bakiyesine işlenir"}),
    {k:"date",label:"Tarih",type:"date",half:true,req:true},
    {k:"amount",label:"Tutar",type:"num",half:true,req:true},
    ...curFields(false),
    {details:"Belge no ve not",open:y=>!!(y.docNo||y.note)},
    {k:"docNo",label:"Belge / fatura no"},
    {k:"note",label:"Not",type:"textarea",rows:2},
    {detailsEnd:true},
  ], onSave: async y=>{
    if(y.cur==="TL") rememberKur(y.kur);
    const doc={...(x||{})}; delete doc.id; delete doc.party;
    Object.assign(doc,{cat:y.cat,payee:y.payee||"",date:y.date,amount:y.amount,cur:y.cur,kur:y.cur==="TL"?y.kur:null,docNo:y.docNo||"",note:y.note||"",saleId:"",lotId:"",paidBy:expLinkLot(y)?y.paidBy:"biz",bank:(expLinkLot(y)&&y.paidBy==="ortak")?"":(y.bank||""),firmId:y.firmId||defFirm()});
    if(y.link==="sale"){ const s=saleById(y.saleId); doc.saleId=y.saleId; if(s) doc.firmId=s.firmId; }
    else if(y.link==="lot"){ const l=lotById(y.lotId); doc.lotId=y.lotId; if(l) doc.firmId=l.firmId; }
    stamp(doc,isNew);
    let id=x?.id;
    if(isNew){ const ref=db.collection("exps").doc(); id=ref.id; await ref.set(doc); } else await db.doc("exps/"+x.id).set(doc);
    return isNew ? {open:{type:"exp",id}} : undefined;
  }});
}

/* --- katalog formları --- */
function partyForm(p,kind,done,prefill){
  if(prefill){ const pre=p; p=null; return partyFormInner(null,kind,done,pre); }
  return partyFormInner(p,kind,done,null);
}
function partyFormInner(p,kind,done,pre){
  const id=p?.id;
  const used = id && (S.lots.some(l=>l.supplierId===id||l.ortak?.partnerId===id)||S.sales.some(s=>s.customerId===id)||S.pays.some(x=>x.partyId===id));
  openForm({title:p?"Firma bilgileri":kind==="supplier"?"Yeni tedarikçi":"Yeni müşteri / ortak", values:p?{...p}:{kind,...(pre||{})}, fields:[
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
  openForm({title:p?"Ürünü düzenle":"Yeni ürün", values:p?{name:p.name,models:(p.models||[]).join("\n"),nameEn:p.nameEn||PROD_I18N[id]?.en||"",nameAr:p.nameAr||PROD_I18N[id]?.ar||""}:{}, fields:[
    {k:"name",label:"Ürün adı",req:true,ph:"ör. Kaju"},
    {k:"nameEn",label:"İngilizce adı (faturada)",half:true,ph:"Cashew Kernels"},
    {k:"nameAr",label:"Arapça adı (faturada)",half:true,ph:"كاجو"},
    {k:"models",label:"Modeller — her satıra bir model",type:"textarea",rows:6,ph:"W180\nW240\nW320",hint:"Alım girerken bu listeden seçersin ya da yeni model yazarsın"},
  ], onSave: async v=>{
    const dup=Object.entries(S.products).find(([pid,x])=>pid!==id&&key(x.name)===key(v.name)); if(dup) return "Bu adla bir ürün zaten var.";
    const models=[]; for(const m of String(v.models||"").split("\n").map(s=>s.trim()).filter(Boolean)) if(!models.some(x=>key(x)===key(m))) models.push(m);
    const tr={nameEn:(v.nameEn||"").trim(),nameAr:(v.nameAr||"").trim()};
    if(p) await db.doc("products/"+id).set({...S.products[id],name:v.name,models,...tr});
    else { const ref=db.collection("products").doc(); const order=Math.max(0,...Object.values(S.products).map(x=>+x.order||0))+1; await ref.set({name:v.name,models,order,...tr}); done?.(ref.id,v.name); }
  }, onDelete: p ? async()=>{ if(used) return "Bu ürünle girilmiş alımlar var; silinemez. Adını değiştirebilirsin."; await db.doc("products/"+id).delete(); } : null });
}
function listForm(lk){
  openForm({title:LISTNAME[lk][0], values:{items:lists(lk).join("\n")}, fields:[
    {k:"items",label:"Her satıra bir tane",type:"textarea",rows:12},
  ], onSave: async v=>{ const items=uniq(String(v.items||"").split("\n")).filter(Boolean); if(!items.length) return "Liste boş olamaz."; await db.doc("lists/"+lk).set({items}); }});
}
function listAddForm(lk,done){
  openForm({title:`Yeni ${LISTNAME[lk][1]}`, values:{}, fields:[{k:"name",label:LISTNAME[lk][1][0].toLocaleUpperCase("tr")+LISTNAME[lk][1].slice(1),req:true}],
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
    add(lots.flatMap(l=>{const c=LC(l); return l.items.map(it=>{const ci=C.item.get(l.id+"|"+it.k); return {"Kod":l.code,"Firma":firmName(l.firmId),"Ortak":l.ortak?.on?partyName(l.ortak.partnerId)+" %"+l.ortak.share:"","Tedarikçi":lotSupplier(l),"Menşe":l.origin,"Ürün":itemProd(it),"Model":it.model,"Miktar kg":+it.kg||0,"Fiyat /kg":it.ppk,"Para birimi":l.cur,"Kur":l.cur==="TL"?l.kur:"","Satır tutarı":r2((+it.kg||0)*(+it.ppk||0)),"Satılan kg":ci?.soldKg||0,"Kalan kg":ci?itemStock(ci):it.kg,"Aşama":ST[STI[l.status]]?.t,"Alım toplam USD":r2(c.costUSD),"Ödenen USD":r2(c.paid),"Kalan borç USD":r2(c.due),"Alım kârı USD":r2(c.profit),"Sipariş":l.orderDate,"Yükleme":l.loadDate,"Tahmini varış":l.eta,"Varış":l.arriveDate,"Konteyner no":cntList(l).join(", "),"Konşimento":l.bl,"Booking":l.booking||"","Gemi firması":l.carrier||l.vessel||"","Belge sayısı":(l.docs||[]).length,"Not":l.note};});}),"Alımlar");
    add(S.sales.filter(inFirm).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).flatMap(s=>{const c=SC(s); return c.lines.map(({ln,ci,amtUSD})=>({"Tarih":s.date,"Firma":firmName(s.firmId),"Müşteri":saleCustomer(s),"Pazar":MK[s.market],"Ortak alım":c.olot?.code||"","Alım":ci?.lot.code,"Ürün":ci?itemProd(ci.it):"","Model":ci?.it.model||"","Miktar kg":+ln.kg||0,"Fiyat /kg":ln.ppk,"Para birimi":s.cur,"Kur":s.cur==="TL"?s.kur:"","Tutar":r2((+ln.kg||0)*(+ln.ppk||0)),"Tutar USD":r2(amtUSD),"Brüt kâr USD":ci?r2(amtUSD-(+ln.kg||0)*ci.cu):"","Satış tahsil USD":r2(c.got),"Belge no":s.docNo,"Plaka":s.plate,"Not":s.note}));}),"Satışlar");
    add(S.pays.filter(inFirm).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(p=>({"Tarih":p.date,"Tür":p.dir==="out"?"Ödeme":"Tahsilat","Firma":firmName(p.firmId),"Kime/kimden":payParty(p),"Açıklama":p.kind,"Banka":p.bank||"","Yöntem":p.method,"Tutar":+p.amount||0,"Para birimi":p.cur,"Kur":p.cur==="TL"?p.kur:"","Tutar USD":r2(usd(p.amount,p.cur,p.kur)),"İlgili":payRel(p),"Not":p.note})),"Ödemeler");
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
  const files=[...(input.files||[])], col=input.dataset.scan, id=input.dataset.id; input.value="";
  if(files.length) startScanFiles(col,id,files,document.getElementById("dkind")?.value||DOCK[col][0]);
}
async function startScanFiles(col,id,files,kind){
  const [first,...rest]=files; if(!first) return;
  toast("Fotoğraf hazırlanıyor…"); await pause();
  try{ const img=await fileToCanvas(first); const q=detectQuad(img);
    openSheet({type:"scan",col,id,kind,stage:"crop",cur:{img,corners:(q||DEFQ).map(p=>[...p]),found:!!q},pages:[],filter:"color",queue:rest}); }
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
    <div class="pages">${t.pages.map((p,i)=>`<div class="pg"><button type="button" class="pgbtn" data-act="scan-view" data-i="${i}" aria-label="Sayfa ${i+1} büyük önizleme"><canvas data-pg="${i}"></canvas></button><span class="muted" style="font-size:12px">Sayfa ${i+1} · büyütmek için dokun</span><button class="iconbtn" type="button" data-act="scan-del" data-i="${i}" aria-label="Sayfa ${i+1}'i sil">${svg('<path d="M18 6L6 18M6 6l12 12"/>',14)}</button></div>`).join("")}</div>
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
    try{ t.pages.push({warp:warpDoc(t.cur.img,t.cur.corners),proc:{}}); t.cur=null;
      if(t.queue?.length){ const nx=t.queue.shift(); const img=await fileToCanvas(nx); const q=detectQuad(img); t.cur={img,corners:(q||DEFQ).map(p=>[...p]),found:!!q}; t.stage="crop"; renderSheet(); return; }
      t.stage="pages"; renderSheet(); }
    catch(e){ btn.disabled=false; btn.textContent="Kırp ve devam et →"; toast("Sayfa işlenemedi. Tekrar dene."); } return; }
  if(a==="scan-filter"){ t.kind=document.getElementById("scankind")?.value||t.kind; t.filter=btn.dataset.f; renderSheet(); return; }
  if(a==="scan-view"){ const pc=procOf(t.pages[+btn.dataset.i],t.filter); lightbox({src:pc.toDataURL("image/jpeg",0.9),title:`Sayfa ${+btn.dataset.i+1} · ${FILTERS.find(f=>f[0]===t.filter)[1]}`}); return; }
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

/* ---------- PDF belgeler: proforma / ticari fatura, cari hesap ekstresi (TR / EN / AR) ---------- */
const PROD_I18N = {kaju:{en:"Cashew Kernels",ar:"كاجو"},badem:{en:"Almonds",ar:"لوز"},ceviz:{en:"Walnuts",ar:"جوز"},yerfistigi:{en:"Peanuts",ar:"فول سوداني"},kahve:{en:"Green Coffee Beans",ar:"بن أخضر"},cekirdek:{en:"Seeds",ar:"بذور"},findik:{en:"Hazelnuts",ar:"بندق"}};
const COUNTRY_I18N = {"vietnam":["Vietnam","فيتنام"],"abd":["USA","الولايات المتحدة"],"iran":["Iran","إيران"],"i̇ran":["Iran","إيران"],"hindistan":["India","الهند"],"afganistan":["Afghanistan","أفغانستان"],"şili":["Chile","تشيلي"],"arjantin":["Argentina","الأرجنتين"],"brezilya":["Brazil","البرازيل"],"çin":["China","الصين"],"özbekistan":["Uzbekistan","أوزبكستان"],"türkiye":["Türkiye","تركيا"],"fildişi sahili":["Côte d'Ivoire","ساحل العاج"],"irak":["Iraq","العراق"]};
const FIRM_DEFAULTS = {a:{legal:"ASYA ÇEREZ DIŞ TİCARET LİMİTED ŞİRKETİ",address:"Mimar Kemalettin Mah. Şair Haşmet Sk. Yüksel İş Merkezi No:27/501",city:"Fatih / İstanbul",country:"Türkiye",email:"asyacerezcilik@gmail.com",web:"asyacerez.com",logo:"logos/asya-cerez.png"}};
const firmInfo = id => ({...(FIRM_DEFAULTS[id]||{}),...(S.firms[id]||{}),name:firmName(id)});
const LBL = {
  tr:{dir:"ltr",pf:"PROFORMA FATURA",ci:"TİCARİ FATURA",st:"HESAP EKSTRESİ",seller:"Satıcı",buyer:"Alıcı",party:"Firma",no:"Belge no",date:"Tarih",item:"Ürün / açıklama",origin:"Menşe",qty:"Miktar (kg)",price:"Birim fiyat",amount:"Tutar",total:"Toplam",totalKg:"Toplam miktar",incoterm:"Teslim şekli",pay:"Ödeme şekli",due:"Vade",bank:"Banka bilgileri",bankName:"Banka",holder:"Hesap sahibi",notes:"Notlar",sign:"Kaşe / imza",page:"Sayfa",tax:"Vergi no",tel:"Tel",debit:"Borç",credit:"Alacak",bal:"Bakiye",closing:"Güncel bakiye",asOf:"Tarih itibarıyla",oweUs:"Bize borçlu",weOwe:"Borcumuz",closed:"Hesap kapalı",usdNote:"Tutarlar ABD doları karşılığıdır.",valid:"Bu proforma 15 gün geçerlidir.",gen:"Ürün Defteri ile hazırlanmıştır",sale:"Satış",purchase:"Alım",payment:"Ödeme",collection:"Tahsilat",ortak:"Ortak alım hesabı",cur:"Para birimi"},
  en:{dir:"ltr",pf:"PROFORMA INVOICE",ci:"COMMERCIAL INVOICE",st:"STATEMENT OF ACCOUNT",seller:"Seller",buyer:"Buyer",party:"Account",no:"Document no",date:"Date",item:"Product / description",origin:"Origin",qty:"Quantity (kg)",price:"Unit price",amount:"Amount",total:"Total",totalKg:"Total quantity",incoterm:"Terms of delivery",pay:"Terms of payment",due:"Due date",bank:"Bank details",bankName:"Bank",holder:"Account holder",notes:"Notes",sign:"Stamp / signature",page:"Page",tax:"Tax no",tel:"Tel",debit:"Debit",credit:"Credit",bal:"Balance",closing:"Current balance",asOf:"As of",oweUs:"Due to us",weOwe:"Due from us",closed:"Account settled",usdNote:"Amounts are in US dollars.",valid:"This proforma is valid for 15 days.",gen:"Prepared with Ürün Defteri",sale:"Sale",purchase:"Purchase",payment:"Payment",collection:"Receipt",ortak:"Joint purchase account",cur:"Currency"},
  ar:{dir:"rtl",pf:"فاتورة مبدئية",ci:"فاتورة تجارية",st:"كشف حساب",seller:"البائع",buyer:"المشتري",party:"الحساب",no:"رقم المستند",date:"التاريخ",item:"المنتج / الوصف",origin:"المنشأ",qty:"الكمية (كغ)",price:"سعر الوحدة",amount:"المبلغ",total:"المجموع",totalKg:"إجمالي الكمية",incoterm:"شروط التسليم",pay:"شروط الدفع",due:"تاريخ الاستحقاق",bank:"المعلومات المصرفية",bankName:"البنك",holder:"صاحب الحساب",notes:"ملاحظات",sign:"الختم / التوقيع",page:"صفحة",tax:"الرقم الضريبي",tel:"هاتف",debit:"مدين",credit:"دائن",bal:"الرصيد",closing:"الرصيد الحالي",asOf:"بتاريخ",oweUs:"مستحق لنا",weOwe:"مستحق علينا",closed:"الحساب مسدد",usdNote:"المبالغ بالدولار الأمريكي.",valid:"هذه الفاتورة المبدئية صالحة لمدة 15 يومًا.",gen:"أُعدّت بواسطة Ürün Defteri",sale:"بيع",purchase:"شراء",payment:"دفعة",collection:"تحصيل",ortak:"حساب الشراء المشترك",cur:"العملة"},
};
const prodLang = (it,lang) => { if(lang==="tr") return itemProd(it); const t=PROD_I18N[it.productId]; const p=S.products[it.productId]; return (lang==="en"?(p?.nameEn||t?.en):(p?.nameAr||t?.ar)) || itemProd(it); };
const countryLang = (c,lang) => { if(!c||lang==="tr") return c||""; const t=COUNTRY_I18N[key(c).replace(/ı/g,"i").replace(/i̇/g,"i")]; return t?(lang==="en"?t[0]:t[1]):c; };
const dLang = d => { if(!d) return "—"; const [y,m,dd]=d.slice(0,10).split("-"); return `${dd}.${m}.${y}`; };
const nLang = (n,dec=2) => (+n||0).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
const mLang = (n,c) => `${c==="TL"?"₺":"$"} ${nLang(n)}`;
async function logoSrc(f){
  if(f.logoId){ try{ const u=await blobUrl(f.logoId); const b=await fetch(u).then(r=>r.blob()); return URL.createObjectURL(b); }catch(e){} }
  return f.logo||"";
}
const u = x => `<bdi>${esc(x)}</bdi>`;
const PDF_CSS = `
.pdfpage{width:794px;height:1123px;box-sizing:border-box;padding:46px 50px 40px;background:#fff;color:#2B1A10;font:13px/1.45 "IBM Plex Sans","IBM Plex Sans Arabic",Arial,sans-serif;position:relative;display:flex;flex-direction:column;gap:18px}
.pdfpage[dir=rtl]{font-family:"IBM Plex Sans Arabic","IBM Plex Sans",Arial,sans-serif}
.pdfpage[dir=rtl] *{letter-spacing:0!important;text-transform:none!important}
.pdfpage bdi{unicode-bidi:isolate}
.pdfpage *{box-sizing:border-box}
.ph{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid #3D2414;padding-bottom:16px}
.ph .co{display:flex;gap:14px;align-items:center;max-width:62%}
.ph .co img{width:74px;height:auto;max-height:96px;object-fit:contain}
.ph .co b{display:block;font-size:15px;letter-spacing:.02em}
.ph .co span{display:block;font-size:11.5px;color:#6B5444}
.ph .tt{text-align:end}
.ph .tt h1{margin:0;font-size:22px;letter-spacing:.06em;color:#3D2414}
.ph .tt div{font-size:12px;color:#6B5444;margin-top:4px}
.ph .tt div b{color:#2B1A10}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.box{border:1px solid #E4D8C8;border-radius:6px;padding:10px 12px;background:#FBF8F3}
.box .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#B08A4E;font-weight:700;margin-bottom:4px}
.pdfpage[dir=rtl] .box .k{text-transform:none;letter-spacing:0}
.box b{display:block;font-size:13.5px}
.box span{display:block;font-size:11.5px;color:#5A4636}
table.it{width:100%;border-collapse:collapse;font-size:12.5px}
table.it th{background:#3D2414;color:#F6EFE4;font-weight:600;padding:8px 9px;text-align:start;font-size:11.5px}
table.it td{padding:8px 9px;border-bottom:1px solid #EDE3D5;vertical-align:top}
table.it tr:nth-child(even) td{background:#FCFAF6}
table.it .n{text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}
table.it tfoot td{font-weight:700;border-top:2px solid #3D2414;border-bottom:0;background:#fff}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:12px}
.meta div span{display:block;color:#8A7461;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}
.pdfpage[dir=rtl] .meta div span{text-transform:none;letter-spacing:0}
.tot{margin-inline-start:auto;width:300px;border:2px solid #3D2414;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:baseline;font-size:15px;font-weight:700}
.tot.warn{border-color:#9A5A12;color:#9A5A12}
.sign{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.sign .s{width:220px;border-top:1px solid #8A7461;padding-top:6px;text-align:center;font-size:11px;color:#6B5444}
.pf{position:absolute;bottom:18px;inset-inline:50px;display:flex;justify-content:space-between;font-size:10px;color:#A8927E}
.note{font-size:11.5px;color:#5A4636;white-space:pre-wrap}
`;
function pageWrap(lang,inner,n,total,f){
  const L=LBL[lang];
  return `<div class="pdfpage" dir="${L.dir}" lang="${lang}">${inner}<div class="pf"><span>${u(f.legal||f.name)}${f.web?" · "+esc(f.web):""}</span><span>${L.page} ${n}/${total}</span></div></div>`;
}
function headHTML(lang,f,logo,title,lines){
  const addr=[f.address,f.city,countryLang(f.country,lang)].filter(Boolean).join(", ");
  return `<div class="ph"><div class="co">${logo?`<img src="${esc(logo)}" alt="">`:""}<div><b>${u(f.legal||f.name)}</b>${addr?`<span>${u(addr)}</span>`:""}${[f.phone?`${LBL[lang].tel} ${f.phone}`:"",f.email].filter(Boolean).length?`<span>${u([f.phone?`${LBL[lang].tel} ${f.phone}`:"",f.email].filter(Boolean).join(" · "))}</span>`:""}${f.taxNo?`<span>${LBL[lang].tax}: ${u([f.taxOffice,f.taxNo].filter(Boolean).join(" "))}</span>`:""}</div></div>
    <div class="tt"><h1>${title}</h1>${lines.map(([k,v])=>`<div>${k}: <b>${u(v)}</b></div>`).join("")}</div></div>`;
}
const partyBox = (label,p,fallbackName,lang) => {
  const addr=[p?.address,p?.city,countryLang(p?.country,lang)].filter(Boolean).join(", ");
  return `<div class="box"><div class="k">${label}</div><b>${u(p?.name||fallbackName||"—")}</b>${addr?`<span>${u(addr)}</span>`:""}${p?.phone||p?.email?`<span>${u([p?.phone,p?.email].filter(Boolean).join(" · "))}</span>`:""}${p?.note&&/vergi|tax/i.test(p.note)?`<span>${u(p.note)}</span>`:""}</div>`;
};
function nextDocNo(prefix,field){
  const yy=today().slice(2,4); const n=S.sales.map(s=>String(s[field]||"")).filter(c=>c.startsWith(`${prefix}-${yy}-`)).map(c=>parseInt(c.split("-")[2],10)||0);
  return `${prefix}-${yy}-${String((n.length?Math.max(...n):0)+1).padStart(3,"0")}`;
}
async function invoicePages(s,o){
  const lang=o.lang, L=LBL[lang], f=firmInfo(s.firmId), logo=await logoSrc(f), c=SC(s);
  const cust=S.parties[s.customerId];
  const no=o.type==="pf"?s.pfNo:(s.docNo||s.ciNo);
  const rows=c.lines.map(({ln,ci})=>({desc:ci?`${prodLang(ci.it,lang)}${ci.it.model?" — "+ci.it.model:""}`:"—",origin:ci?countryLang(ci.lot.origin,lang):"",kg:+ln.kg||0,price:+ln.ppk||0,amt:(+ln.kg||0)*(+ln.ppk||0)}));
  const per=14, chunks=[]; for(let i=0;i<Math.max(1,rows.length);i+=per) chunks.push(rows.slice(i,i+per));
  const pages=chunks.map((ch,pi)=>{
    const last=pi===chunks.length-1;
    let h=headHTML(lang,f,logo,o.type==="pf"?L.pf:L.ci,[[L.no,no||"—"],[L.date,dLang(o.date||s.date)]]);
    if(pi===0) h+=`<div class="parties">${partyBox(L.seller,{name:f.legal||f.name,address:f.address,city:f.city,country:f.country,phone:f.phone,email:f.email},"",lang)}${partyBox(L.buyer,cust,saleCustomer(s),lang)}</div>`;
    h+=`<table class="it"><thead><tr><th>#</th><th>${L.item}</th><th>${L.origin}</th><th class="n">${L.qty}</th><th class="n">${L.price} (${s.cur==="TL"?"₺":"$"}/kg)</th><th class="n">${L.amount}</th></tr></thead><tbody>${ch.map((r,i)=>`<tr><td>${pi*per+i+1}</td><td>${u(r.desc)}</td><td>${u(r.origin)}</td><td class="n">${nLang(r.kg,0)}</td><td class="n">${nLang(r.price,s.cur==="TL"?2:3)}</td><td class="n">${nLang(r.amt)}</td></tr>`).join("")}</tbody>
      ${last?`<tfoot><tr><td></td><td colspan="2">${L.totalKg}</td><td class="n">${nLang(sum(rows,r=>r.kg),0)}</td><td></td><td class="n">${nLang(sum(rows,r=>r.amt))}</td></tr></tfoot>`:""}</table>`;
    if(last){
      h+=`<div class="tot"><span>${L.total}</span><span>${mLang(c.tot,s.cur)}</span></div>`;
      const meta=[[L.incoterm,o.incoterm||s.incoterm],[L.pay,o.payTerms||s.payTerms],[L.due,s.dueDate?dLang(s.dueDate):""],[L.cur,s.cur==="TL"?"TRY":"USD"]].filter(m=>m[1]);
      if(meta.length) h+=`<div class="meta">${meta.map(([k,v])=>`<div><span>${k}</span>${u(v)}</div>`).join("")}</div>`;
      const bank=[[L.bankName,f.bankName],[L.holder,f.accountHolder||f.legal],["IBAN",f.iban],["SWIFT",f.swift]].filter(b=>b[1]);
      if(f.iban||f.bankName) h+=`<div class="box"><div class="k">${L.bank}</div>${bank.map(([k,v])=>`<span>${k}: <b style="display:inline">${u(v)}</b></span>`).join("")}</div>`;
      const notes=[o.note,o.type==="pf"?L.valid:""].filter(Boolean).join("\n");
      if(notes) h+=`<div class="note">${u(notes)}</div>`;
      h+=`<div class="sign"><span style="font-size:10px;color:#A8927E">${L.gen}</span><div class="s">${L.sign}</div></div>`;
    }
    return h;
  });
  return pages.map((h,i)=>pageWrap(lang,h,i+1,pages.length,f));
}
function partyLedger(pk,dir){
  const id=pk.startsWith("i:")?pk.slice(2):null; const p=id?S.parties[id]:null; const ted=(p?p.kind==="supplier":dir==="out");
  const rows=[];
  if(ted){ for(const l of S.lots.filter(inFirm)) if(pkey(l.supplierId,l.supplier)===pk) rows.push({d:l.orderDate||(l.createdAt||"").slice(0,10),t:`${l.code} · ${l.items.map(itemLabel).join(", ")} alımı`,kind:"purchase",ref:l.code,lot:l,a:LC(l).costUSD,p:0,attr:`data-lot="${l.id}"`}); }
  else{
    for(const s of S.sales.filter(inFirm)) if(!SC(s).olot && pkey(s.customerId,s.customer)===pk) rows.push({d:s.date,t:`${MK[s.market]||"Satış"} · ${saleLinesTxt(s)}`,kind:"sale",ref:s.docNo||s.ciNo||s.pfNo||"",sale:s,a:SC(s).totUSD,p:0,attr:`data-sale="${s.id}"`});
    for(const l of S.lots.filter(inFirm)) if(l.ortak?.on && pkey(l.ortak.partnerId,"")===pk){ const c=LC(l); const lastSale=c.sales.map(s=>s.date).sort().pop(); rows.push({d:lastSale||l.arriveDate||l.orderDate,t:`${l.code} ortak alım · dönmesi gereken (sermaye + masraf + %${nf0.format(+l.ortak.share||0)} kâr)`,kind:"ortak",ref:l.code,lot:l,a:c.owe||0,p:0,attr:`data-lot="${l.id}"`}); }
  }
  for(const x of S.pays.filter(inFirm)) if(x.dir===(ted?"out":"in") && pkey(x.partyId,x.party)===pk) rows.push({d:x.date,t:`${ted?"Ödeme":"Tahsilat"}${x.kind?" · "+x.kind:""}${x.cur==="TL"?` (${moneyf(+x.amount||0,"TL")})`:""}`,kind:ted?"payment":"collection",ref:x.bank||x.method||"",a:0,p:usd(x.amount,x.cur,x.kur),attr:`data-pay="${x.id}"`});
  rows.sort((a,b)=>(a.d||"").localeCompare(b.d||""));
  return {id,p,ted,rows,name:p?.name||S.pending[id]||pk.slice(2)};
}
async function statementPages(pk,dir,o){
  const lang=o.lang, L=LBL[lang]; const lg=partyLedger(pk,dir);
  const fid=o.firm==="b"?"b":"a"; const f=firmInfo(fid), logo=await logoSrc(f);
  const descOf=r=>{ if(r.kind==="purchase"||r.kind==="ortak") return `${r.kind==="ortak"?L.ortak:L.purchase} ${r.ref} · ${[...new Set(r.lot.items.map(it=>`${prodLang(it,lang)}${it.model?" "+it.model:""}`))].join(", ")}`;
    if(r.kind==="sale") return `${L.sale}${r.ref?" "+r.ref:""} · ${SC(r.sale).lines.map(({ln,ci})=>ci?`${prodLang(ci.it,lang)}${ci.it.model?" "+ci.it.model:""} ${nLang(ln.kg,0)} kg`:"").filter(Boolean).join(", ")}`;
    return `${r.kind==="payment"?L.payment:L.collection}${r.ref?" · "+r.ref:""}`; };
  let bal=0; const rows=lg.rows.map(r=>{ bal+=r.a-r.p; return {...r,desc:descOf(r),bal}; });
  const per=22, chunks=[]; for(let i=0;i<Math.max(1,rows.length);i+=per) chunks.push(rows.slice(i,i+per));
  const pages=chunks.map((ch,pi)=>{
    const last=pi===chunks.length-1;
    let h=headHTML(lang,f,logo,L.st,[[L.asOf,dLang(today())]]);
    if(pi===0) h+=`<div class="parties">${partyBox(L.party,lg.p,lg.name,lang)}<div class="box"><div class="k">${L.closing}</div><b style="font-size:20px">$ ${nLang(Math.abs(bal))}</b><span>${Math.abs(bal)<1?L.closed:lg.ted?(bal>0?L.weOwe:L.oweUs):(bal>0?L.oweUs:L.weOwe)}</span></div></div>`;
    h+=`<table class="it"><thead><tr><th>${L.date}</th><th>${L.item}</th><th class="n">${L.debit}</th><th class="n">${L.credit}</th><th class="n">${L.bal}</th></tr></thead><tbody>${ch.map(r=>`<tr><td style="white-space:nowrap">${dLang(r.d)}</td><td>${u(r.desc)}</td><td class="n">${r.a?nLang(r.a):""}</td><td class="n">${r.p?nLang(r.p):""}</td><td class="n"><b>${nLang(r.bal)}</b></td></tr>`).join("")}</tbody>
      ${last?`<tfoot><tr><td></td><td>${L.closing}</td><td class="n">${nLang(sum(rows,r=>r.a))}</td><td class="n">${nLang(sum(rows,r=>r.p))}</td><td class="n">${nLang(bal)}</td></tr></tfoot>`:""}</table>`;
    if(last){ h+=`<div class="note">${L.usdNote}${o.note?"\n"+esc(o.note):""}</div><div class="sign"><span style="font-size:10px;color:#A8927E">${L.gen}</span><div class="s">${L.sign}</div></div>`; }
    return h;
  });
  return {pages:pages.map((h,i)=>pageWrap(lang,h,i+1,pages.length,f)),name:lg.name};
}
let h2cP=null;
const loadH2C=()=>h2cP||(h2cP=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="html2canvas.min.js"; s.onload=()=>res(window.html2canvas); s.onerror=()=>{h2cP=null;rej();}; document.head.appendChild(s); }));
async function pagesToPdf(pages){
  const [h2c,J]=await Promise.all([loadH2C(),loadJsPDF()]);
  const host=document.createElement("div"); host.style.cssText="position:fixed;left:-12000px;top:0;width:794px;z-index:-1";
  host.innerHTML=`<style>${PDF_CSS}</style>${pages.join("")}`; document.body.appendChild(host);
  try{
    try{ await document.fonts?.ready; }catch(_){}
    await Promise.all([...host.querySelectorAll("img")].map(im=>im.complete?0:new Promise(r=>{ im.onload=im.onerror=r; })));
    const pdf=new J({orientation:"p",unit:"mm",format:"a4",compress:true}); const canvases=[];
    for(const [i,el] of [...host.querySelectorAll(".pdfpage")].entries()){
      const c=await h2c(el,{scale:2,backgroundColor:"#ffffff",logging:false,useCORS:true}); canvases.push(c);
      if(i) pdf.addPage("a4","p"); pdf.addImage(c.toDataURL("image/jpeg",0.9),"JPEG",0,0,210,297,undefined,"FAST");
    }
    return {blob:pdf.output("blob"),first:canvases[0]};
  } finally { host.remove(); }
}
const asciiName = s => String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/ı/g,"i").replace(/İ/g,"I").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);
function sPdf(t){
  const isInv=t.kind==="invoice"; const s=isInv?saleById(t.id):null;
  const seg=(k,opts,val)=>`<div class="seg" role="radiogroup" data-pk="${k}">${opts.map(([o,l])=>`<button type="button" role="radio" aria-checked="${val===o}" data-pv="${o}">${l}</button>`).join("")}</div>`;
  const o=t.opt;
  let body=`<div class="form">
    ${isInv?`<div class="fld"><span class="lbl">Belge</span>${seg("type",[["pf","Proforma fatura"],["ci","Ticari fatura"]],o.type)}</div>`:""}
    <div class="fld"><span class="lbl">Dil</span>${seg("lang",[["tr","Türkçe"],["en","English"],["ar","العربية"]],o.lang)}</div>
    ${!isInv?`<div class="fld"><span class="lbl">Belgenin üst bilgisinde hangi firma?</span>${seg("firm",[["a",firmName("a")],["b",firmName("b")]],o.firm)}</div>`:""}
    ${isInv?`<label class="fld half"><span class="lbl">Teslim şekli</span><input id="pdf_incoterm" type="text" list="dl_pinc" value="${esc(o.incoterm)}"><datalist id="dl_pinc">${["EXW Mersin Serbest Bölge","FCA Mersin Serbest Bölge","DAP Zaho","DAP Erbil","DAP Bağdat","CIF Umm Qasr"].map(x=>`<option value="${esc(x)}">`).join("")}</datalist></label>
      <label class="fld half"><span class="lbl">Ödeme şekli</span><input id="pdf_pay" type="text" list="dl_ppay" value="${esc(o.payTerms)}"><datalist id="dl_ppay">${["%100 peşin","%30 peşin, %70 yüklemeden önce","Mal tesliminde nakit","Vesaik mukabili","Akreditif"].map(x=>`<option value="${esc(x)}">`).join("")}</datalist></label>`:""}
    <label class="fld"><span class="lbl">Not (isteğe bağlı)</span><textarea id="pdf_note" rows="2">${esc(o.note||"")}</textarea></label>
  </div>`;
  if(isInv){ const f=firmInfo(s.firmId); if(!f.iban&&!f.bankName) body+=`<div class="fnote">${esc(firmName(s.firmId))} için banka bilgisi girilmemiş; faturada banka bölümü çıkmaz. <button class="linkbtn" type="button" data-act="firm-edit" data-id="${s.firmId}">Firma bilgilerini doldur</button></div>`; }
  if(t.result) body+=`<div class="dsec"><div class="h"><h4>Önizleme</h4></div><button type="button" class="pgbtn" data-act="pdf-view" style="max-width:320px"><img src="${t.result.preview}" alt="Önizleme" style="width:100%;border:1px solid var(--line);border-radius:6px"></button>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${navigator.canShare?`<button class="btn pri" type="button" data-act="pdf-share">${svg('<path d="M4 12v8h16v-8"/><path d="M12 3v13M7 8l5-5 5 5"/>',16)}Paylaş (WhatsApp, e-posta…)</button>`:""}<button class="btn" type="button" data-act="pdf-dl">İndir</button>${isInv&&assets&&canWrite?`<button class="btn" type="button" data-act="pdf-attach">Satışın belgelerine ekle</button>`:""}</div></div>`;
  const foot=`<button class="btn" type="button" data-act="back">Kapat</button><span class="sp"></span><button class="btn pri" type="button" data-act="pdf-make">${t.result?"Yeniden oluştur":"PDF oluştur"}</button>`;
  return {title:isInv?"Fatura PDF":"Hesap ekstresi PDF",body,foot};
}
function pdfReadOpts(t){
  const g=k=>document.querySelector(`[data-pk="${k}"] [aria-checked="true"]`)?.dataset.pv;
  t.opt={...t.opt,type:g("type")||t.opt.type,lang:g("lang")||t.opt.lang,firm:g("firm")||t.opt.firm,incoterm:document.getElementById("pdf_incoterm")?.value.trim()??t.opt.incoterm,payTerms:document.getElementById("pdf_pay")?.value.trim()??t.opt.payTerms,note:document.getElementById("pdf_note")?.value.trim()||""};
}
async function pdfAct(a,btn){
  const t=S.stack[S.stack.length-1]; if(t?.type!=="pdf") return;
  if(a==="pdf-make"){
    pdfReadOpts(t); btn.disabled=true; btn.textContent="Hazırlanıyor…";
    try{
      let pages,fname;
      if(t.kind==="invoice"){
        let s=saleById(t.id); const fld=t.opt.type==="pf"?"pfNo":"ciNo";
        const upd={}; if(t.opt.type==="pf"&&!s.pfNo) upd.pfNo=nextDocNo("PF","pfNo"); if(t.opt.type==="ci"&&!s.docNo&&!s.ciNo) upd.ciNo=nextDocNo("INV","ciNo");
        if(t.opt.incoterm!==(s.incoterm||"")) upd.incoterm=t.opt.incoterm; if(t.opt.payTerms!==(s.payTerms||"")) upd.payTerms=t.opt.payTerms;
        if(Object.keys(upd).length&&canWrite){ await db.doc("sales/"+s.id).update(upd); s={...s,...upd}; }
        pages=await invoicePages(s,t.opt); fname=`${t.opt.type==="pf"?"Proforma":"Invoice"}-${s[fld]||s.docNo||s.date}-${asciiName(saleCustomer(s))}.pdf`;
      } else { const r=await statementPages(t.pk,t.dir,t.opt); pages=r.pages; fname=`Ekstre-${asciiName(r.name)}-${today()}.pdf`; }
      const {blob,first}=await pagesToPdf(pages);
      const pv=document.createElement("canvas"); pv.width=640; pv.height=Math.round(first.height*640/first.width); pv.getContext("2d").drawImage(first,0,0,pv.width,pv.height);
      t.result={blob,fname,preview:pv.toDataURL("image/jpeg",0.85),full:first.toDataURL("image/jpeg",0.9),pages:pages.length};
      renderSheet(); toast("PDF hazır");
    }catch(e){ console.error(e); btn.disabled=false; btn.textContent="PDF oluştur"; toast("PDF oluşturulamadı. Tekrar dene."); }
    return;
  }
  const r=t.result; if(!r) return;
  if(a==="pdf-view") return lightbox({src:r.full,title:`${r.fname} · ${r.pages} sayfa`});
  if(a==="pdf-share"){ const file=new File([r.blob],r.fname,{type:"application/pdf"}); try{ if(navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:r.fname}); else throw 0; }catch(e){ if(e?.name!=="AbortError") toast("Paylaşım açılamadı; İndir'i kullan."); } return; }
  if(a==="pdf-dl"){ const u=URL.createObjectURL(r.blob); const x=document.createElement("a"); x.href=u; x.download=r.fname; document.body.appendChild(x); x.click(); x.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000); return; }
  if(a==="pdf-attach"){ btn.disabled=true; try{ const up=await assets.upload(r.blob,{type:"application/pdf"}); const tb=await canvasBlob(await (async()=>{ const im=new Image(); im.src=r.full; await im.decode(); const c=document.createElement("canvas"); c.width=im.width; c.height=im.height; c.getContext("2d").drawImage(im,0,0); return c; })(),900,0.75); let thumb=""; try{ thumb=(await assets.upload(tb,{type:"image/jpeg"})).id; }catch(_){}
      const s=saleById(t.id); await db.doc("sales/"+t.id).update({docs:[...(s.docs||[]),{id:up.id,thumb,kind:t.opt.type==="pf"?"Proforma":"Satış faturası",name:r.fname,ct:"application/pdf",pages:r.pages,at:new Date().toISOString(),by:me||null}]}); toast("Satışın belgelerine eklendi"); }
    catch(e){ toast(e?.code?assetErr(e):dbErr(e)); } finally{ btn.disabled=false; } return; }
}
/* firma bilgileri (fatura başlığı) */
function sFirms(){
  const row=k=>{ const f=firmInfo(k); return `<button type="button" class="row" data-act="firm-edit" data-id="${k}"><span class="dot" style="background:${firmColor(k)};width:10px;height:10px"></span><span class="main"><div class="t">${esc(f.name)}</div><div class="sub">${esc([f.legal,f.iban?"IBAN girildi":"banka bilgisi yok"].filter(Boolean).join(" · "))}</div></span><span class="end muted">›</span></button>`; };
  return {title:"Firmalar",body:`<p class="muted" style="margin:0;font-size:14px">Bu bilgiler proforma, fatura ve ekstrelerin üst kısmında görünür.</p><div class="panel rows">${row("a")}${row("b")}</div>`};
}
function firmForm(k){
  const f=firmInfo(k);
  openForm({title:`${f.name} · firma bilgileri`,values:{...f,__files:[]},fields:[
    {k:"files",type:"files",label:"Logo (isteğe bağlı)",hint:f.logoId||f.logo?"Yeni logo seçersen eskisinin yerine geçer.":"Kare ya da dikey bir logo görseli seç."},
    {k:"name",label:"Kısa ad (uygulamada görünen)",req:true},
    {k:"legal",label:"Ticari unvan (faturada görünen)"},
    {k:"address",label:"Adres"},
    {k:"city",label:"İlçe / şehir",half:true},
    {k:"country",label:"Ülke",half:true,list:()=>lists("origins")},
    {k:"phone",label:"Telefon",half:true,itype:"tel",im:"tel"},
    {k:"email",label:"E-posta",half:true,itype:"email",im:"email"},
    {k:"web",label:"Web sitesi",half:true},
    {k:"taxOffice",label:"Vergi dairesi",half:true},
    {k:"taxNo",label:"Vergi no",half:true},
    {section:"Banka (faturada görünür)"},
    {k:"bankName",label:"Banka",half:true},
    {k:"accountHolder",label:"Hesap sahibi",half:true},
    {k:"iban",label:"IBAN (USD)",ph:"TR00 0000 0000 0000 0000 0000 00"},
    {k:"swift",label:"SWIFT",half:true},
  ],onSave:async v=>{
    const doc={...(S.firms[k]||{})}; for(const x of ["name","legal","address","city","country","phone","email","web","taxOffice","taxNo","bankName","accountHolder","iban","swift"]) doc[x]=(v[x]||"").trim();
    const img=(v.__files||[]).find(x=>(x.type||"").startsWith("image/"));
    if(img&&assets){ try{ const b=await compress(img); const up=await assets.upload(b,{type:b.type||"image/png"}); doc.logoId=up.id; }catch(e){ return assetErr(e); } }
    await db.doc("firms/"+k).set(doc);
  }});
}

/* --- kapatma onayı --- */
function sAsk(t){
  const l=lotById(t.id); if(!l) return null;
  const rows=l.items.map(it=>{ const ci=C.item.get(l.id+"|"+it.k); if(!ci) return ""; const h=Math.max(0,hereLeft(ci)), i=Math.max(0,irakLeft(ci)); if(h<=0.5&&i<=0.5) return "";
    return `<li><b>${esc(itemLabel(it))}</b>: ${[h>0.5?`${nf0.format(h)} kg Mersin'de`:"",i>0.5?`${nf0.format(i)} kg Irak deposunda`:""].filter(Boolean).join(", ")}</li>`; }).join("");
  const body=`<p style="margin:0">Bu alımda hâlâ satılmamış mal görünüyor:</p><ul style="margin:0;padding-left:20px">${rows}</ul>
    <div class="fnote">Kapatırsan bu mal <b>stoktan çıkar</b> ve satışta seçilemez. Mal gerçekten bittiyse (fire, numune, sayım farkı) kapatabilirsin; hâlâ duruyorsa açık bırak.</div>`;
  return {title:`${esc(l.code)} kapatılsın mı?`,body,foot:`<button class="btn" type="button" data-act="back">Açık kalsın</button><span class="sp"></span><button class="btn danger" type="button" data-act="ask-close" data-id="${l.id}">Yine de kapat</button>`};
}
/* ---------- banka / kasa (sadece Asya Çerez) ---------- */
const BANK_FIRM="a", KASA="Kasa (nakit)";
const acctOpts = () => [["","Seç…"],[KASA,KASA],...lists("banks").filter(b=>b!==KASA&&key(b)!=="nakit").map(x=>[x,x])];
const normAcc = b => key(b)==="nakit"||key(b)==="kasa" ? KASA : b;
const acctSel = (k,label,extra={}) => ({k,label,type:"select",quick:"banks",quickLabel:"+ Yeni banka ekle…",options:acctOpts,...extra});
const accKey = (bank,cur) => `${normAcc(bank)}|${cur==="TL"?"TL":"USD"}`;
const accName = k => { const [b,c]=k.split("|"); return `${b} · ${c==="TL"?"TL ₺":"USD $"}`; };
const HES = () => S.settings.hesaplar?.bal || {};
function accMoves(){
  const m=[], none=[];
  for(const p of S.pays){ if(p.firmId!==BANK_FIRM) continue; const b=p.bank||(key(p.method)==="nakit"?KASA:"");
    const mv={date:p.date,amt:(p.dir==="out"?-1:1)*(+p.amount||0),t:`${p.dir==="out"?"Ödeme":"Tahsilat"} · ${payParty(p)}${p.kind?" · "+p.kind:""}`,attr:`data-pay="${p.id}"`};
    if(b) m.push({...mv,acc:accKey(b,p.cur)}); else none.push({...mv,cur:p.cur}); }
  for(const x of S.exps){ if(x.firmId!==BANK_FIRM||x.paidBy==="ortak"||!x.bank) continue; m.push({acc:accKey(x.bank,x.cur),date:x.date,amt:-(+x.amount||0),t:`Masraf · ${x.cat||""}${x.payee?" · "+x.payee:""}`,attr:`data-exp="${x.id}"`}); }
  for(const t of S.trf){ if(t.firmId!==BANK_FIRM) continue; m.push({acc:t.from,date:t.date,amt:-(+t.out||0),t:`Transfer → ${accName(t.to)}`,trf:t.id}); m.push({acc:t.to,date:t.date,amt:+t.in||0,t:`Transfer ← ${accName(t.from)}`,trf:t.id}); }
  return {m,none};
}
function accounts(){
  const {m,none}=accMoves(); const H=HES(); const keys=new Set([...m.map(x=>x.acc),...Object.keys(H).filter(k=>(H[k]||[]).length)]);
  const out=[...keys].map(k=>{ const cps=(H[k]||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.at).localeCompare(String(b.at))); const cp=cps[cps.length-1]||null;
    const mv=m.filter(x=>x.acc===k).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const after=cp?mv.filter(x=>String(x.date)>String(cp.date)):mv; const bal=(cp?+cp.amt:0)+sum(after,x=>x.amt);
    return {k,cp,cps,mv,after,bal}; }).sort((a,b)=>a.k.localeCompare(b.k,"tr"));
  return {list:out,none};
}
function vBanka(){
  if(S.firm==="b") return `<div class="panel"><div class="empty">Banka ve kasa takibi sadece ${esc(firmName("a"))} için açık. Üstten “Tümü” ya da “${esc(firmName("a"))}”yı seç.</div></div>`;
  const {list,none}=accounts(); const cur=c=>c.k.endsWith("|TL")?"TL":"USD";
  let h=`<p class="muted" style="margin:0 0 10px;font-size:14px">${esc(firmName("a"))} hesapları. Bakiye = son girdiğin gerçek bakiye + o tarihten sonraki ödeme, tahsilat, masraf ve transferler.</p>`;
  if(!list.length) h+=`<div class="panel"><div class="empty">Henüz hesap yok. “Bakiye gir” ile her bankadaki (ve kasadaki) bugünkü parayı bir kere yaz; sonrasını sistem ödeme ve tahsilatlardan kendisi hesaplar.</div></div>`;
  else h+=`<div class="accs">${list.map(a=>`<button type="button" class="acc" data-act="acct-open" data-k="${esc(a.k)}"><div class="an">${esc(a.k.split("|")[0])}<span class="muted"> · ${cur(a)==="TL"?"TL":"USD"}</span></div><div class="ab ${a.bal<0?"bad":""}">${moneyf(a.bal,cur(a))}</div><div class="as muted">${a.cp?`Son kontrol ${fd(a.cp.date)}${a.after.length?` · sonra ${a.after.length} hareket`:""}`:`<span style="color:var(--warn)">Başlangıç bakiyesi girilmedi</span>`}</div></button>`).join("")}</div>`;
  if(none.length) h+=`<div class="fnote" style="margin-top:12px">${none.length} ödeme/tahsilatta banka seçilmemiş; bakiyelere girmedi. ${none.slice(0,5).map(x=>`<button type="button" class="linkbtn" ${x.attr}>${fd(x.date)} ${esc(x.t)}</button>`).join(", ")}${none.length>5?" …":""}</div>`;
  return h;
}
function sAcct(t){
  const {list}=accounts(); const a=list.find(x=>x.k===t.k); const c=t.k.endsWith("|TL")?"TL":"USD";
  if(!a) return {title:esc(accName(t.k)),body:`<div class="empty">Hareket yok.</div>`};
  let run=a.cp?+a.cp.amt:0; const rows=a.after.map(x=>{ run+=x.amt; return {...x,run}; }).reverse();
  const row=x=>`<${x.attr?"button":"div"} type="button" class="row" ${x.attr||""}><span class="main"><div class="t">${esc(x.t)}</div><div class="sub">${fd(x.date)}</div></span><span class="end"><div class="a" style="color:${x.amt<0?"var(--warn)":"var(--good)"}">${x.amt<0?"−":"+"}${moneyf(Math.abs(x.amt),c)}</div>${x.run!==undefined?`<div class="b">${moneyf(x.run,c)}</div>`:""}${x.trf&&canWrite?`<button type="button" class="btn sm" data-act="trf-del" data-id="${x.trf}">Sil</button>`:""}</span></${x.attr?"button":"div"}>`;
  const before=a.cp?a.mv.filter(x=>String(x.date)<=String(a.cp.date)).reverse():[];
  const body=`<div class="money"><div><div class="l">Bakiye</div><div class="v ${a.bal<0?"bad":""}">${moneyf(a.bal,c)}</div></div><div><div class="l">Son kontrol</div><div class="v" style="font-size:16px">${a.cp?`${moneyf(+a.cp.amt,c)}<br><span class="muted" style="font-size:12px">${fd(a.cp.date)}</span>`:"—"}</div></div></div>
    ${canWrite&&db?`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" type="button" data-act="bal-new" data-k="${esc(t.k)}">Gerçek bakiyeyi gir</button><button class="btn" type="button" data-act="trf-new" data-k="${esc(t.k)}">Transfer / döviz bozdurma</button></div>`:""}
    <div class="dsec"><div class="h"><h4>${a.cp?"Son kontrolden sonraki hareketler":"Hareketler"}</h4></div><div class="panel rows">${rows.length?rows.map(row).join(""):`<div class="empty">Bu tarihten sonra hareket yok.</div>`}</div></div>
    ${before.length?`<details class="dmore"><summary>Kontrol öncesi ${before.length} hareket</summary><div class="panel rows">${before.map(row).join("")}</div></details>`:""}
    ${a.cps.length?`<details class="dmore"><summary>Girilen bakiyeler (${a.cps.length})</summary><div class="panel rows">${a.cps.slice().reverse().map(cp=>`<div class="row"><span class="main"><div class="t">${moneyf(+cp.amt,c)}</div><div class="sub">${fd(cp.date)}${cp.note?" · "+esc(cp.note):""}${cp.by?" · "+who(cp.by):""}</div></span>${canWrite?`<span class="end"><button class="btn sm" type="button" data-act="bal-del" data-k="${esc(t.k)}" data-at="${esc(cp.at)}">Sil</button></span>`:""}</div>`).join("")}</div></details>`:""}`;
  return {title:esc(accName(t.k)),body};
}
function balForm(k){
  const [b,c]=k?k.split("|"):["","USD"];
  openForm({title:"Gerçek bakiyeyi gir",values:{bank:b,cur:c||"USD",date:today()},fields:[
    {k:"n",type:"note",text:"Bankadaki (ya da kasadaki) parayı bugünkü haliyle yaz. Sistem bu tarihten sonraki ödeme, tahsilat, masraf ve transferleri ekleyip çıkararak bakiyeyi kendisi tutar. Ara ara tekrar girersen farklar sıfırlanır."},
    acctSel("bank","Hesap",{req:true}),
    {k:"cur",label:"Para birimi",type:"seg",options:[["USD","USD $"],["TL","TL ₺"]],half:true},
    {k:"date",label:"Hangi günün sonu",type:"date",half:true,req:true},
    {k:"amt",label:"Bakiye",type:"num",req:true},
    {k:"note",label:"Not",ph:"Ekstre, sayım…"},
  ],onSave:async x=>{
    const kk=accKey(x.bank,x.cur); const H={...HES()}; H[kk]=[...(H[kk]||[]),{date:x.date,amt:x.amt,note:x.note||"",at:new Date().toISOString(),by:me||null}];
    await db.doc("settings/hesaplar").set({...(S.settings.hesaplar||{}),bal:H}); return {open:{type:"acct",k:kk}};
  }});
}
function trfForm(k){
  const [b,c]=k?k.split("|"):["","USD"];
  openForm({title:"Transfer / döviz bozdurma",values:{fbank:b,fcur:c||"USD",tbank:b,tcur:c==="TL"?"USD":"TL",date:today()},fields:[
    {k:"n",type:"note",text:"Kendi hesapların arasında para aktarma ya da dolar bozdurma. Tedarikçiye/müşteriye giden para buraya değil, ödeme/tahsilata girilir."},
    acctSel("fbank","Çıkan hesap",{req:true,half:true}),
    {k:"fcur",label:"Çıkan para birimi",type:"seg",options:[["USD","USD $"],["TL","TL ₺"]],half:true},
    {k:"out",label:"Çıkan tutar",type:"num",req:true,half:true},
    {k:"date",label:"Tarih",type:"date",req:true,half:true},
    acctSel("tbank","Giren hesap",{req:true,half:true}),
    {k:"tcur",label:"Giren para birimi",type:"seg",options:[["USD","USD $"],["TL","TL ₺"]],half:true},
    {k:"in",label:"Giren tutar",type:"num",half:true,hint:"Aynı para birimiyse boş bırak; döviz bozdurduysan eline geçen tutarı yaz"},
    {k:"note",label:"Not",half:true},
  ],onSave:async x=>{
    const from=accKey(x.fbank,x.fcur), to=accKey(x.tbank,x.tcur); if(from===to) return "Çıkan ve giren hesap aynı olamaz.";
    const inn = x.in>0 ? x.in : x.fcur===x.tcur ? x.out : null; if(!(inn>0)) return "Döviz bozdurmada eline geçen tutarı yaz.";
    const doc=stamp({firmId:BANK_FIRM,date:x.date,from,to,out:x.out,in:inn,note:x.note||""},true); await db.collection("trf").doc().set(doc);
    return {open:{type:"acct",k:from}};
  }});
}
let accArm=null;
async function accDel(btn,kind){
  if(accArm!==btn){ accArm=btn; btn.textContent="Emin misin?"; setTimeout(()=>{ if(accArm===btn){ accArm=null; btn.textContent="Sil"; } },4000); return; }
  accArm=null; btn.disabled=true;
  try{
    if(kind==="trf") await db.doc("trf/"+btn.dataset.id).delete();
    else { const H={...HES()}; H[btn.dataset.k]=(H[btn.dataset.k]||[]).filter(cp=>cp.at!==btn.dataset.at); await db.doc("settings/hesaplar").set({...(S.settings.hesaplar||{}),bal:H}); }
    toast("Silindi");
  }catch(e){ btn.disabled=false; toast(dbErr(e)); }
}
/* --- Irak deposuna sevk: Mersin SB'deki malın satılmadan Irak'a gönderilen kısmı --- */
function sevkSec(l){
  const svs=l.sevk||[]; const canSend=canWrite&&db&&l.status==="depoda"&&l.items.some(it=>{ const ci=C.item.get(l.id+"|"+it.k); return ci&&hereLeft(ci)>0.5; });
  if(!svs.length&&!canSend) return "";
  const lab=ik=>{ const it=l.items.find(x=>x.k===ik); return it?itemLabel(it):"?"; };
  return `<div class="dsec"><div class="h"><h4>Irak deposuna sevk</h4>${canSend?`<button class="btn sm pri" type="button" data-act="sevk-new" data-id="${l.id}">→ Irak'a gönder</button>`:""}</div>
    ${svs.length?`<div class="panel rows">${svs.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(sv=>`<div class="row"><span class="typeic tir">TIR</span><span class="main"><div class="t">${(sv.lines||[]).map(x=>`${esc(lab(x.ik))} ${nf0.format(+x.kg||0)} kg`).join(", ")}</div><div class="sub">${fd(sv.date)}${sv.trucker?" · "+esc(sv.trucker):""}${(sv.plates||[]).length?" · "+esc(sv.plates.join(", ")):""}${sv.note?" · "+esc(sv.note):""}</div></span>${canWrite&&db?`<span class="end"><button class="btn sm" type="button" data-act="sevk-exp" data-id="${l.id}">+ Masraf</button> <button class="btn sm" type="button" data-act="sevk-del" data-id="${l.id}" data-sv="${esc(sv.id)}">Geri al</button></span>`:""}</div>`).join("")}</div>`
      :`<div class="muted" style="font-size:13px">Malın bir kısmını ya da tamamını satmadan Irak'taki depoya gönderiyorsan buradan kaydet. Irak'ta sattıkça satış girerken “IRAK DEPOSU” stoğunu seçersin.</div>`}</div>`;
}
function sevkForm(id){
  const l=lotById(id); if(!l) return;
  const its=l.items.map(it=>({it,ci:C.item.get(l.id+"|"+it.k)})).filter(x=>x.ci&&hereLeft(x.ci)>0.5);
  const v={date:today(),plates:[""]}; for(const {it,ci} of its) v["q_"+it.k]=Math.round(hereLeft(ci)*1000)/1000;
  openForm({title:`${l.code} · Irak'a gönder`,values:v,docTarget:{col:"lots",id},docKind:"CMR / taşıma belgesi",fields:[
    {k:"n1",type:"note",text:"Gönderdiğin miktarları yaz (hepsi gidiyorsa olduğu gibi bırak, gitmeyen satırı 0 yap). Mal satılana kadar senin stoğun olarak <b>Irak deposu</b>nda görünür."},
    ...its.map(({it,ci})=>({k:"q_"+it.k,label:`${itemLabel(it)} — Mersin'de ${nf0.format(hereLeft(ci))} kg`,type:"num"})),
    {k:"date",label:"Sevk tarihi",type:"date",half:true,req:true},
    {k:"trucker",label:"Nakliye firması",half:true,list:()=>uniq([...S.lots.map(z=>z.trucker),...S.lots.flatMap(z=>(z.sevk||[]).map(x=>x.trucker))])},
    {k:"plates",type:"list",label:"TIR plakası",addLabel:"Plaka ekle",ph:"34 ABC 123"},
    {k:"note",label:"Not",ph:"Erbil deposu, Zaho gümrüğü…"},
    {k:"files",type:"files",label:"CMR / beyanname",hint:"İsteğe bağlı. Navlun ve Irak gümrüğü masrafını kaydettikten sonra “+ Masraf” ile ekleyebilirsin."},
  ], onSave: async x=>{
    const lines=[]; for(const {it,ci} of its){ const kg=+x["q_"+it.k]||0; if(kg<0||Number.isNaN(kg)) return `${itemLabel(it)}: miktar geçersiz.`; if(kg>hereLeft(ci)+0.001) return `${itemLabel(it)}: Mersin'de sadece ${nf0.format(hereLeft(ci))} kg var.`; if(kg>0) lines.push({ik:it.k,kg}); }
    if(!lines.length) return "Gönderilen miktarı gir.";
    const sv={id:"sv"+Date.now().toString(36),date:x.date,lines,trucker:(x.trucker||"").trim(),plates:(x.plates||[]).map(p=>p.trim().toUpperCase()).filter(Boolean),note:x.note||"",at:new Date().toISOString(),by:me||null};
    await db.doc("lots/"+id).update({sevk:[...(l.sevk||[]),sv],log:addLog(l,`Irak deposuna sevk: ${lines.map(z=>`${itemLabel(l.items.find(i=>i.k===z.ik))} ${nf0.format(z.kg)} kg`).join(", ")}`),updatedAt:new Date().toISOString(),updatedBy:me||null});
  }});
}
let sevkArm=null;
async function sevkDel(btn){
  const l=lotById(btn.dataset.id); const sv=(l?.sevk||[]).find(x=>x.id===btn.dataset.sv); if(!sv) return;
  for(const ln of sv.lines||[]){ const ci=C.item.get(l.id+"|"+ln.ik); if(ci&&irakLeft(ci)-(+ln.kg||0)<-0.001) return toast(`${itemLabel(ci.it)}: bu sevkin bir kısmı Irak'ta satılmış; önce o satışları düzelt.`); }
  if(sevkArm!==btn){ sevkArm=btn; btn.textContent="Emin misin?"; setTimeout(()=>{ if(sevkArm===btn){ sevkArm=null; btn.textContent="Geri al"; } },4000); return; }
  sevkArm=null; btn.disabled=true;
  try{ await db.doc("lots/"+l.id).update({sevk:l.sevk.filter(x=>x.id!==sv.id),log:addLog(l,"Irak sevki geri alındı"),updatedAt:new Date().toISOString(),updatedBy:me||null}); toast("Sevk geri alındı; mal Mersin stoğuna döndü"); }
  catch(e){ btn.disabled=false; toast(dbErr(e)); }
}
/* --- panodan belge yapıştırma (bilgisayarda Ctrl/Cmd+V, telefonda "Yapıştır") --- */
const DETAIL_COL={lot:"lots",sale:"sales",pay:"pays",exp:"exps"};
function pasteTarget(){
  const top=S.stack[S.stack.length-1]; if(!top||!assets||!canWrite) return null;
  if(top.type==="form") return top.o.fields.some(f=>f.type==="files")?{form:top}:null;
  if(top.type==="beyan") return {form:null,beyan:top};
  const col=DETAIL_COL[top.type]; return col&&colArr(col).some(x=>x.id===top.id)?{col,id:top.id}:null;
}
function addPasted(files){
  files=files.filter(f=>f&&((f.type||"").startsWith("image/")||f.type==="application/pdf")); if(!files.length) return false;
  const t=pasteTarget(); if(!t){ toast("Belge yapıştırmak için önce bir alım, satış, ödeme ya da masraf aç."); return true; }
  const stamp=new Date().toISOString().slice(0,19).replace(/[T:]/g,"-");
  files=files.map((f,i)=>f.name&&f.name!=="image.png"?f:new File([f],`yapistirilan-${stamp}${i?"-"+i:""}.${f.type==="application/pdf"?"pdf":(f.type.split("/")[1]||"png")}`,{type:f.type}));
  if(t.form){ t.form.v={...t.form.v,...readForm()}; t.form.v.__files=[...(t.form.v.__files||[]),...files]; renderSheet(); toast(files.length>1?`${files.length} belge eklendi, kaydedince yüklenir`:"Belge eklendi, kaydedince yüklenir"); return true; }
  if(t.beyan){ t.beyan.files=[...(t.beyan.files||[]),...files]; renderSheet(); return true; }
  handleFiles(t.col,t.id,files,document.getElementById("dkind")?.value||DOCK[t.col][0]); return true;
}
/* Panodaki dosyaları paste olayından topla: dosya, öğe ya da HTML içindeki gömülü resim */
async function clipFiles(cd){
  if(!cd) return [];
  let files=[...(cd.files||[])];
  if(!files.length) files=[...(cd.items||[])].filter(i=>i.kind==="file").map(i=>i.getAsFile()).filter(Boolean);
  if(!files.length){ const html=cd.getData?.("text/html")||""; const m=[...html.matchAll(/<img[^>]+src="(data:(image\/[a-z+]+|application\/pdf);base64,[^"]+)"/gi)];
    for(const x of m){ try{ const b=await (await fetch(x[1])).blob(); files.push(new File([b],"",{type:x[2]})); }catch(_){} } }
  return files;
}
const PASTE_HINT = () => /iphone|ipad|android/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1) ? "Kutuya <b>uzun bas</b> ve çıkan menüden <b>Yapıştır</b>'a dokun." : `Kutuya tıklayıp <b>${/mac/i.test(navigator.platform)?"Cmd":"Ctrl"}+V</b>'ye bas.`;
function pasteZone(note){
  document.getElementById("pzone")?.remove();
  const el=document.createElement("div"); el.id="pzone"; el.className="lbox pzone"; el.setAttribute("role","dialog"); el.setAttribute("aria-label","Belge yapıştır");
  el.innerHTML=`<div class="pz-card"><b>Belgeyi buraya yapıştır</b>${note?`<p class="muted">${note}</p>`:""}
    <div class="pz-box" contenteditable="true" inputmode="none" aria-label="Yapıştırma alanı"><span>${PASTE_HINT()}</span></div>
    <p class="muted" style="font-size:13px;margin:0">Kopyaladığın fotoğraf, ekran görüntüsü ya da PDF dosyası olabilir.</p>
    <div style="display:flex;justify-content:flex-end"><button class="btn" type="button" data-pz="close">Vazgeç</button></div></div>`;
  document.body.appendChild(el);
  const box=el.querySelector(".pz-box"); const close=()=>{ el.remove(); document.removeEventListener("keydown",k,true); };
  const k=e=>{ if(e.key==="Escape"){ e.stopPropagation(); close(); } }; document.addEventListener("keydown",k,true);
  el.addEventListener("click",e=>{ if(e.target.closest('[data-pz="close"]')||e.target===el) close(); });
  box.addEventListener("focus",()=>{ box.innerHTML=""; },{once:true});
  box.addEventListener("paste",async e=>{
    e.preventDefault(); e.stopPropagation();
    const files=await clipFiles(e.clipboardData);
    if(files.length&&addPasted(files)) return close();
    const types=[...(e.clipboardData?.types||[])].filter(t=>t!=="Files");
    box.innerHTML=""; toast(types.includes("text/uri-list")||types.includes("text/plain")?"Panoda dosya değil yazı/bağlantı var. Dosyanın kendisini kopyala (WhatsApp'ta belgeye uzun bas → Kopyala ya da Paylaş → Kopyala).":"Panoda resim ya da PDF bulunamadı.");
  });
  box.addEventListener("input",()=>{ const img=box.querySelector("img[src^='data:']"); if(img){ fetch(img.src).then(r=>r.blob()).then(b=>{ if(addPasted([new File([b],"",{type:b.type})])) close(); }); } box.innerHTML=""; });
  setTimeout(()=>box.focus(),50);
}
async function pasteFromClipboard(){
  // Önce panoyu doğrudan okumayı dene (resimlerde çalışır); dosya kopyalandıysa tarayıcı bunu göremez → yapıştırma kutusunu aç
  if(navigator.clipboard?.read){
    try{
      const items=await navigator.clipboard.read(); const files=[];
      for(const it of items){ const tp=it.types.find(x=>x.startsWith("image/")||x==="application/pdf"); if(tp){ const b=await it.getType(tp); files.push(new File([b],"",{type:tp})); } }
      if(addPasted(files)) return;
    }catch(e){}
  }
  pasteZone();
}
document.addEventListener("paste",async e=>{
  if(document.getElementById("pzone")) return;
  const hasFile=[...(e.clipboardData?.items||[])].some(i=>i.kind==="file")||(e.clipboardData?.files||[]).length>0;
  if(e.target.closest?.("input:not([type=file]),textarea,[contenteditable]")&&!hasFile) return;
  if(!hasFile) return;
  e.preventDefault();
  addPasted(await clipFiles(e.clipboardData));
});
/* --- ürün sayfası: gümrük beyannameleri --- */
function prodBeyans(pid){
  const out=[];
  for(const l of S.lots) if(lotHasProd(l,pid)) (l.docs||[]).forEach((d,i)=>{ if(isBeyan(d)) out.push({col:"lots",rec:l,i,d,date:(d.at||"").slice(0,10)||l.arriveDate||l.orderDate,t:`Alım ${l.code} · ${lotSupplier(l)}`,sub:l.items.filter(it=>matchProd(it,pid)).map(it=>`${it.model||""} ${nf0.format(+it.kg||0)} kg`).join(", ")}); });
  for(const x of S.sales) if(saleHasProd(x,pid)) (x.docs||[]).forEach((d,i)=>{ if(isBeyan(d)) out.push({col:"sales",rec:x,i,d,date:(d.at||"").slice(0,10)||x.date,t:`Satış ${fd(x.date)} · ${saleCustomer(x)}`,sub:`${MK[x.market]||""} · ${saleLinesTxt(x)}`}); });
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function beyanSec(pid){
  const bs=prodBeyans(pid);
  const th=d=>d.thumb?`<span class="th"><img ${blobA(d.thumb)} alt="" loading="lazy"></span>`:d.ct==="application/pdf"?`<span class="th">PDF</span>`:`<span class="th"><img ${blobA(d.id)} alt="" loading="lazy"></span>`;
  return `<div class="dsec"><div class="h"><h4>Gümrük beyannameleri</h4>${assets&&canWrite?`<button class="btn sm pri" type="button" data-act="beyan-add" data-pid="${pid}">+ Beyanname ekle</button>`:""}</div>
    ${bs.length?`<div class="panel rows">${bs.map(b=>`<button type="button" class="row beyrow" data-lbdoc="${b.col}|${b.rec.id}|${b.i}">${th(b.d)}<span class="main"><div class="t">${esc(b.t)}</div><div class="sub">${esc(b.sub)}${b.d.name&&!/^yapistirilan|^tarama/i.test(b.d.name)?" · "+esc(b.d.name):""}</div></span><span class="end"><div class="b">${fd(b.date)}</div></span></button>`).join("")}</div>`
      :`<div class="muted" style="font-size:13px">Bu ürünün beyannamesi yok. Beyannameyi “+ Beyanname ekle”den ya da alım/satış sayfasında belge türü “Gümrük beyannamesi” seçerek eklersin; hepsi burada tarihe göre listelenir.</div>`}</div>`;
}
function sBeyan(t){
  const pid=t.pid, p=prodList().find(x=>x.id===pid);
  const opts=[...S.sales.filter(x=>saleHasProd(x,pid)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(x=>[`sales|${x.id}`,`Satış ${fd(x.date)} · ${saleCustomer(x)} · ${saleLinesTxt(x)}`]),
    ...S.lots.filter(l=>lotHasProd(l,pid)).sort((a,b)=>String(b.code).localeCompare(String(a.code))).map(l=>[`lots|${l.id}`,`Alım ${l.code} · ${lotSupplier(l)} · ${ST[STI[l.status]]?.t||""}`])];
  if(!t.target&&opts.length) t.target=opts[0][0];
  const fs=t.files||[];
  const body=`<p class="muted" style="margin:0;font-size:14px">Beyanname hangi satışa ya da alıma ait? Satıştaki çıkış beyannamesi için satışı, Mersin'e giriş beyannamesi için alımı seç.</p>
    ${opts.length?`<div class="fld"><span class="lbl">Kayıt</span><select id="beyt">${opts.map(([v,l])=>`<option value="${v}" ${v===t.target?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="fld"><span class="lbl">Beyanname</span><div class="upl"><label class="btn sm pri">${svg(IC_CAM,15)}Fotoğraf çek<input type="file" accept="image/*" capture="environment" hidden data-beyfile="1"></label><label class="btn sm">${svg(IC_IMG,15)}Galeri / PDF<input type="file" accept="image/*,application/pdf" multiple hidden data-beyfile="1"></label><button type="button" class="btn sm" data-act="paste-doc">${svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',14)}Yapıştır</button></div>
    ${fs.length?`<div class="chips" style="flex-wrap:wrap">${fs.map((x,i)=>`<span class="chip">${esc(x.name||"belge")}<button type="button" class="xbtn" data-act="bey-del" data-i="${i}" aria-label="Kaldır">×</button></span>`).join("")}</div>`:""}
    <span class="hint">Fotoğraflar tarayıcıda düzeltilip PDF'e çevrilir; PDF olduğu gibi eklenir. Bilgisayarda Ctrl/Cmd+V ile de yapıştırabilirsin.</span></div>`
    :`<div class="empty">Bu ürünün henüz alımı ya da satışı yok.</div>`}`;
  const foot=`<button class="btn" type="button" data-act="back">Vazgeç</button><span class="sp"></span><button class="btn pri" type="button" data-act="bey-save" ${fs.length?"":"disabled"}>Ekle</button>`;
  return {title:`${esc(p?.name||"")} · beyanname ekle`,body,foot};
}
async function beyanSave(){
  const t=S.stack[S.stack.length-1]; if(t?.type!=="beyan"||!(t.files||[]).length) return;
  const [col,id]=(document.getElementById("beyt")?.value||t.target||"").split("|"); if(!id) return;
  const files=t.files; S.stack.pop();
  openSheet({type:col==="lots"?"lot":"sale",id});
  handleFiles(col,id,files,"Gümrük beyannamesi");
}
/* ---------- telefona bildirim ---------- */
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone===true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
let swRegP=null;
const swReady = () => swRegP || (swRegP = ("serviceWorker" in navigator) ? navigator.serviceWorker.register("sw.js").then(r=>navigator.serviceWorker.ready.then(()=>r)).catch(e=>{ swRegP=null; throw e; }) : Promise.resolve(null));
const u8 = s => { const t=s.replace(/-/g,"+").replace(/_/g,"/"); const b=atob(t+"===".slice((t.length+3)%4)); return Uint8Array.from(b,c=>c.charCodeAt(0)); };
const deviceName = () => { const ua=navigator.userAgent; return /iphone/i.test(ua)?"iPhone":/ipad/i.test(ua)?"iPad":/android/i.test(ua)?"Android telefon":/mac/i.test(ua)?"Mac":/windows/i.test(ua)?"Windows bilgisayar":"Cihaz"; };
async function pushState(){
  if(!pushSupported()) return {ok:false};
  let sub=null; try{ const r=await swReady(); sub=await r?.pushManager.getSubscription(); }catch(e){}
  let srv=null; if(sub){ try{ srv=await window.__fn("push-kayit",{op:"durum",endpoint:sub.endpoint}); }catch(e){} }
  return {ok:true,perm:Notification.permission,sub,on:!!srv?.on,prefs:srv?.prefs||{}};
}
function sNotify(t){
  const st=t.st||{}; let body="";
  if(!pushSupported()) body=`<div class="fnote">Bu tarayıcı bildirim desteklemiyor.${isIOS()?" iPhone'da Ürün Defteri'ni Safari'den ana ekrana ekleyip oradan açman gerekiyor.":""}</div>`;
  else if(isIOS()&&!isStandalone()) body=`<div class="fnote">iPhone'da bildirim almak için Ürün Defteri'ni <b>ana ekrandaki simgesinden</b> açıp bu ekrana oradan gelmelisin. (Safari'de Paylaş → Ana Ekrana Ekle)</div>`;
  else {
    const on=!!(st.sub&&st.on), p=st.prefs||{};
    const seg=(k,lbl,hint)=>`<div class="fld"><span class="lbl">${lbl}</span><div class="seg" role="radiogroup" data-nk="${k}">${[["1","Açık"],["0","Kapalı"]].map(([o,l])=>`<button type="button" role="radio" aria-checked="${(p[k]!==false)===(o==="1")}" data-nv="${o}">${l}</button>`).join("")}</div><span class="hint">${hint}</span></div>`;
    body=`<div class="trackbox"><div class="tb-h"><b>${on?"Bu cihazda bildirimler açık":"Bu cihazda bildirimler kapalı"}</b><span class="muted">${esc(deviceName())}</span></div>
      ${st.perm==="denied"&&!on?`<div class="muted" style="font-size:13px">Bildirim izni bu cihazda kapalı. Cihazın ayarlarında (telefonda Ayarlar → Bildirimler → Ürün Defteri) izin verip tekrar dene.</div>`:""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${on?`<button class="btn" type="button" data-act="push-test">Deneme bildirimi gönder</button><button class="btn danger" type="button" data-act="push-off">Bu cihazda kapat</button>`:`<button class="btn pri" type="button" data-act="push-on">Bu cihazda bildirimleri aç</button>`}</div></div>
      ${on?`<div class="form">${seg("eta","Konteyner varışı","Varıştan 3 gün önce, 1 gün önce ve varış günü; gecikirse 3 günde bir")}${seg("due","Vadeler","Tahsilat ve tedarikçi ödeme vadesinden 3 gün önce, vade günü; gecikirse 3 günde bir")}${seg("yeni","Yeni kayıtlar","Başka biri alım, satış, ödeme ya da masraf girince")}</div>
      <p class="muted" style="margin:0;font-size:13px">Varış ve vade bildirimleri her sabah 09:00'da kontrol edilir. Her cihaz için ayrı açılır; ortağın kendi telefonunda açmalı.</p>`:""}`;
  }
  return {title:"Bildirimler",body};
}
async function openNotify(){ const t={type:"notify",st:{}}; openSheet(t); t.st=await pushState(); if(S.stack[S.stack.length-1]===t) renderSheet(); }
async function pushOn(btn){
  const t=S.stack[S.stack.length-1];
  let perm; try{ perm=await Notification.requestPermission(); }catch(e){ perm="denied"; }
  if(perm!=="granted"){ toast("Bildirim izni verilmedi."); t.st=await pushState(); return renderSheet(); }
  btn.disabled=true; btn.textContent="Açılıyor…";
  try{
    const reg=await swReady(); const {key}=await window.__fn("push-key",{});
    let sub=await reg.pushManager.getSubscription();
    if(sub && sub.options?.applicationServerKey){ const cur=new Uint8Array(sub.options.applicationServerKey); const want=u8(key); if(cur.length!==want.length||cur.some((x,i)=>x!==want[i])){ await sub.unsubscribe(); sub=null; } }
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(key)});
    const j=sub.toJSON();
    await window.__fn("push-kayit",{sub:{endpoint:j.endpoint,keys:j.keys},device:deviceName()});
    toast("Bildirimler açıldı");
  }catch(e){ console.error(e); toast("Bildirimler açılamadı: "+(e?.message||"bilinmeyen hata")); }
  t.st=await pushState(); renderSheet();
}
async function pushOff(){
  const t=S.stack[S.stack.length-1];
  try{ const st=await pushState(); if(st.sub){ await window.__fn("push-kayit",{op:"sil",endpoint:st.sub.endpoint}); await st.sub.unsubscribe(); } toast("Bu cihazda bildirimler kapatıldı"); }catch(e){ toast("Kapatılamadı"); }
  t.st=await pushState(); renderSheet();
}
async function pushPref(k,val){
  const t=S.stack[S.stack.length-1]; const sub=t?.st?.sub; if(!sub) return;
  try{ const r=await window.__fn("push-kayit",{op:"tercih",endpoint:sub.endpoint,prefs:{[k]:val}}); t.st.prefs=r.prefs||t.st.prefs; renderSheet(); }catch(e){ toast("Kaydedilemedi. İnternet bağlantını kontrol et."); }
}
/* bildirimden gelen bağlantıyı aç (#lot=…, #sale=…) */
function handleHash(){
  const m=location.hash.match(/^#(lot|sale|pay|exp)=([\w-]+)$/); if(!m) return false;
  const [,ty,id]=m; const col={lot:"lots",sale:"sales",pay:"pays",exp:"exps"}[ty];
  if(!colArr(col).some(x=>x.id===id)) return false;
  history.replaceState(null,"",location.pathname+location.search); closeAll(); openSheet({type:ty,id}); return true;
}

/* ---------- olaylar ---------- */
document.addEventListener("click",e=>{
  const mk=e.target.closest("[data-mk] [data-mv]"); if(mk){ mk.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked",String(b===mk))); return; }
  const nkb=e.target.closest("[data-nk] [data-nv]"); if(nkb){ nkb.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked",String(b===nkb))); return pushPref(nkb.parentElement.dataset.nk,nkb.dataset.nv==="1"); }
  const pkb=e.target.closest("[data-pk] [data-pv]"); if(pkb){ pkb.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked",String(b===pkb))); return; }
  const tc=e.target.closest("[data-trackcopy]"); if(tc){ const n=tc.dataset.trackcopy, ps=tc.dataset.trackpaste; Promise.resolve().then(()=>navigator.clipboard.writeText(n)).then(()=>toast(ps?`${n} kopyalandı — açılan sayfada kutuya yapıştır`:`${n} kopyalandı`),()=>{}); return; }
  const t=e.target.closest("[data-view],[data-firm],[data-prod],[data-prodsheet],[data-stage],[data-market],[data-cari],[data-atype],[data-lot],[data-sale],[data-pay],[data-exp],[data-party],[data-doc],[data-lbdoc],[data-setst],[data-copy],[data-act]");
  if(!t) return;
  const d=t.dataset;
  if(d.copy!==undefined){ const v=d.copy; Promise.resolve().then(()=>navigator.clipboard.writeText(v)).then(()=>toast("Kopyalandı"),()=>toast("Kopyalanamadı; metni basılı tutup seç.")); return; }
  if(d.act){
    const a=d.act;
    if(a==="close-all") return closeAll();
    if(a==="back") return closeSheet();
    if(a==="form-save") return formSave();
    if(a==="form-del") return formDelete(t);
    if(a==="list-add"||a==="list-del"){ const top=S.stack[S.stack.length-1]; top.v={...top.v,...readForm()}; const arr=[...(top.v[d.k]||[])];
      if(a==="list-add") arr.push(""); else { arr.splice(+d.i,1); if(!arr.length) arr.push(""); } top.v[d.k]=arr; if(top.v.cnt!==undefined&&d.k==="cntNos") top.v.cnt=arr.filter(Boolean).length||arr.length;
      renderSheet(); if(a==="list-add"){ const ins=document.querySelectorAll(`.mlist[data-k="${d.k}"] input`); ins[ins.length-1]?.focus(); } return; }
    if(a==="ai-fill") return aiFill(t);
    if(a==="quick-go") return quickGo(t);
    if(a==="paste-doc") return pasteFromClipboard();
    if(a==="sevk-del") return sevkDel(t);
    if(a==="ask-close"){ S.stack.pop(); renderSheet(); return stepTo(d.id,"kapandi",true); }
    if(a==="acct-open") return openSheet({type:"acct",k:d.k});
    if(a==="trf-del") return accDel(t,"trf");
    if(a==="bal-del") return accDel(t,"bal");
    if(a==="beyan-add") return openSheet({type:"beyan",pid:d.pid,files:[]});
    if(a==="bey-del"){ const top=S.stack[S.stack.length-1]; top.target=document.getElementById("beyt")?.value||top.target; top.files=(top.files||[]).filter((_,i)=>i!==+d.i); return renderSheet(); }
    if(a==="bey-save") return beyanSave();
    if(a==="quick-ex"){ const ta=document.getElementById("qtext"); if(ta){ ta.value=t.textContent; S.qtext=ta.value; ta.focus(); } return; }
    if(a.startsWith("pdf-")&&a!=="pdf-invoice"&&a!=="pdf-statement") return pdfAct(a,t);
    if(a==="ai-party") return aiAddParty();
    if(a==="ffile-del"){ const top=S.stack[S.stack.length-1]; top.v={...top.v,...readForm()}; top.v.__files=(top.v.__files||[]).filter((_,i)=>i!==+d.i); renderSheet(); return; }
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
      "sale-lot":()=>saleForm(null,d.id), "sevk-new":()=>sevkForm(d.id), "bal-new":()=>balForm(d.k), "trf-new":()=>trfForm(d.k), "sevk-exp":()=>expForm(null,{link:"lot",lotId:d.id,cat:"TIR navlunu (Mersin yükleme)"}), "pay-sale":()=>payForm(null,{dir:"in",target:"s:"+d.id,kind:"Tahsilat"}),
      "pay-party":()=>{ const id=d.pk.startsWith("i:")?d.pk.slice(2):""; return payForm(null,d.dir==="out"?{dir:"out",supId:id,kind:"Ödeme"}:{dir:"in",cusId:id,kind:"Tahsilat"}); },
      "exp-lot":()=>expForm(null,{link:"lot",lotId:d.id,cat:"Gümrük müşaviri"}),
      "exp-sale":()=>{ const s=saleById(d.id); return expForm(null,{link:"sale",saleId:d.id,cat:s?.market==="irak"?"Irak gümrüğü":s?.market==="diger"?"İhracat masrafı":"TIR navlunu (Mersin yükleme)"}); },
      "new-party":()=>partyForm(null,d.kind), "edit-party":()=>partyForm({id:d.id,...S.parties[d.id]},S.parties[d.id]?.kind),
      "new-product":()=>productForm(null), "edit-product":()=>productForm({id:d.id,...S.products[d.id]}),
      "set-firms":()=>openSheet({type:"firms"}), "firm-edit":()=>firmForm(d.id),
      "pdf-invoice":()=>{ const s2=saleById(d.id); openSheet({type:"pdf",kind:"invoice",id:d.id,opt:{type:s2?.market==="ic"?"ci":"pf",lang:s2?.market==="irak"?"en":"tr",incoterm:s2?.incoterm||"",payTerms:s2?.payTerms||"",note:""}}); },
      "pdf-statement":()=>{ openSheet({type:"pdf",kind:"statement",pk:d.pk,dir:d.dir,opt:{lang:"tr",firm:S.firm==="b"?"b":"a",note:""}}); }, "set-products":()=>openSheet({type:"setprods"}), "set-origins":()=>listForm("origins"), "set-expcats":()=>listForm("expcats"),
      "set-parties":()=>openSheet({type:"setparties",kind:d.kind}),
      "set-banks":()=>listForm("banks"), "set-carriers":()=>listForm("carriers"),
      "set-users":()=>{ S.members=null; openSheet({type:"users"}); loadMembers(); },
      "set-mail":()=>{ openSheet({type:"mail"}); loadMembers(); },
      "set-notify":()=>openNotify(), "push-on":()=>pushOn(t), "push-off":()=>pushOff(),
      "push-test":async()=>{ t.disabled=true; try{ const r=await window.__fn("push-test",{}); toast(r.gonderilen?"Deneme bildirimi gönderildi":"Bu cihaz bulunamadı, bildirimleri kapatıp yeniden aç."); }catch(e){ toast(e?.message||"Gönderilemedi"); } finally{ t.disabled=false; } },
      "mail-save":async()=>{ const g=k2=>document.querySelector(`[data-mk="${k2}"] [aria-checked="true"]`)?.dataset.mv!=="0"; const to=document.getElementById("m_backupTo").value.trim();
        if(to&&!/^\S+@\S+\.\S+$/.test(to)) return toast("Geçerli bir e-posta yaz.");
        try{ await db.doc("settings/mail").set({...(S.settings.mail||{}),digest:g("digest"),backup:g("backup"),backupTo:to}); toast("Kaydedildi"); }catch(e){ toast(dbErr(e)); } },
      "mail-test":async()=>{ const old=t.textContent; t.disabled=true; t.textContent="Gönderiliyor…"; try{ const r=await window.__fn("haftalik",{test:d.t}); toast(r.gonderilen?.length?`Gönderildi: ${r.gonderilen.join(", ").replace(/özet→|yedek→/g,"")}`:"Gönderildi"); }catch(e){ toast(e?.message||"Gönderilemedi"); } finally{ t.disabled=false; t.textContent=old; } },
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
  if(d.setst){ return stepTo(S.stack[S.stack.length-1]?.id, d.setst); }
  if(d.lbdoc){ const [col,id,i]=d.lbdoc.split("|"); return openDocLightbox(col,id,+i); }
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
function fmtNum(t){
  const v=t.value, pos=t.selectionStart??v.length, sig=v.slice(0,pos).replace(/[^\d,]/g,"").length;
  let raw=v.replace(/[^\d,]/g,""); const ci=raw.indexOf(","); let ip=ci>=0?raw.slice(0,ci):raw; const dp=ci>=0?raw.slice(ci+1).replace(/,/g,""):null;
  ip=ip.replace(/^0+(?=\d)/,""); const out=ip.replace(/\B(?=(\d{3})+(?!\d))/g,".")+(dp!==null?","+dp:"");
  if(out===v) return; t.value=out; let n=0,p=0; while(p<out.length&&n<sig){ if(/[\d,]/.test(out[p])) n++; p++; } try{ t.setSelectionRange(p,p); }catch(_){}
}
document.addEventListener("beforeinput",e=>{ const t=e.target; if(!t.matches?.('input[data-t="num"]')||(e.data!=="."&&e.data!==",")) return; e.preventDefault(); if(t.value.includes(",")) return; t.setRangeText(",",t.selectionStart,t.selectionEnd,"end"); t.dispatchEvent(new Event("input",{bubbles:true})); },true);
document.addEventListener("input",e=>{ if(e.target.matches?.('input[data-t="num"]')) fmtNum(e.target); },true);
let qT;
document.addEventListener("input",e=>{
  if(e.target.id==="aq"||e.target.id==="pq"){ const id=e.target.id; if(id==="aq") S.q=e.target.value; else S.pq=e.target.value; clearTimeout(qT); qT=setTimeout(()=>{ const pos=e.target.selectionStart; render(); const el=document.getElementById(id); if(el){ el.focus(); try{el.setSelectionRange(pos,pos);}catch(_){} } },180); }
});
document.addEventListener("change",e=>{ if(e.target.id==="ay"){ S.year=e.target.value; render(); } if(e.target.matches("input[data-upload]")) uploadDocs(e.target); if(e.target.matches("input[data-scan]")) startScan(e.target);
  if(e.target.matches("input[data-ffile]")){ const top=S.stack[S.stack.length-1]; const fs=[...e.target.files]; e.target.value=""; if(top?.type==="form"&&fs.length){ top.v={...top.v,...readForm()}; top.v.__files=[...(top.v.__files||[]),...fs]; renderSheet(); } } if(e.target.matches("input[data-scanadd]")) scanAddPage(e.target);
  if(e.target.matches("input[data-beyfile]")){ const top=S.stack[S.stack.length-1]; const fs=[...e.target.files]; e.target.value=""; if(top?.type==="beyan"&&fs.length){ top.target=document.getElementById("beyt")?.value||top.target; top.files=[...(top.files||[]),...fs]; renderSheet(); } }
  if(e.target.id==="beyt"){ const top=S.stack[S.stack.length-1]; if(top?.type==="beyan") top.target=e.target.value; } });
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
  sub("settings",s=>{ S.settings=obj(s); });
  if("serviceWorker" in navigator){ swReady().catch(()=>{}); navigator.serviceWorker.addEventListener("message",e=>{ if(e.data?.open){ location.hash=new URL(e.data.open,location.href).hash; handleHash(); } }); }
  window.addEventListener("hashchange",()=>handleHash());
  sub("lots",s=>{ S.lots=map(s).map(normLot); });
  sub("sales",s=>{ S.sales=map(s).map(normSale); });
  sub("pays",s=>{ S.pays=map(s); });
  sub("exps",s=>{ S.exps=map(s); });
  sub("trf",s=>{ S.trf=map(s); });
}
init();
})();
