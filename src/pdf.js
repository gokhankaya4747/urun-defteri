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
