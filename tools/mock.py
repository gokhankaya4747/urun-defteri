"""Yerel test ortamı: python3 tools/mock.py  →  .mock/ klasörüne sahte Supabase ile uygulamayı kurar.
Sunucu: python3 -m http.server 8778 --directory .mock   (örnek kayıtlar baslangic.json'dan)"""
import json, shutil, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, '.mock'); os.makedirs(out, exist_ok=True)
rows = json.load(open(os.path.join(root, 'baslangic.json'), encoding='utf-8'))
mock = '''window.__T={offline:localStorage.getItem("mockoffline")==="1",hist:[],docs:%s,members:[{email:"gokhankaya1@yahoo.com",role:(localStorage.getItem("mockrole")||"owner"),name:"Gökhan",gizle:JSON.parse(localStorage.getItem("mockgizle")||"{}")},{email:"ali@ornek.com",role:"editor",name:"Ali",gizle:{}}],files:{},log:[]};
(function(){const T=window.__T; const subs=[]; let hid=0;
// veritabanı tetikleyicilerinin (supabase/v21) taklidi: sürüm + geçmiş
const trig=(op,oldR,newR)=>{ if(newR){ const ov=oldR?.data?._v; newR.data={...newR.data,_v:op==="insert"?(newR.data._v??1):((Number.isInteger(ov)?ov:0)+1)}; }
  const r=newR||oldR; if(r.col==="settings") return; T.hist.push({hid:++hid,col:r.col,id:r.id,op,old_data:oldR?JSON.parse(JSON.stringify(oldR.data)):null,new_data:newR?JSON.parse(JSON.stringify(newR.data)):null,by_email:"gokhankaya1@yahoo.com",at:new Date().toISOString()}); };
const notify=()=>setTimeout(()=>subs.forEach(f=>f({eventType:"*"})),0);
class Q{constructor(t){this.t=t;this.op="select";this.f=[];this.r=null;this.row=null}
 select(){this.sel=true;return this} order(){return this} range(a,b){this.r=[a,b];return this} eq(k,v){this.f.push([k,v]);return this} ilike(k,v){this.f.push([k,v]);return this} is(k,v){this.f.push([k,v,"is"]);return this}
 limit(n){this.lim=n;return this} maybeSingle(){this.one=true;return this} single(){this.one=true;return this}
 upsert(row){this.op="upsert";this.row=row;return this} insert(row){this.op="insert";this.row=row;return this} update(row){this.op="update";this.row=row;return this} delete(){this.op="delete";return this}
 then(res,rej){try{res(this.run())}catch(e){rej(e)}}
 run(){ if(T.offline) return {data:null,error:{message:"TypeError: Failed to fetch",code:""}}; const tbl=this.t==="docs"?T.docs:this.t==="docs_hist"?T.hist:T.members; T.log.push(this.t+":"+this.op);
  const get=(x,k)=>{ const j=k.match(/^data->>?(.+)$/); return j?(x.data||{})[j[1]]:x[k]; };
  const m=x=>this.f.every(([k,v,op])=>op==="is"?(get(x,k)==null)===(v===null):String(get(x,k)).toLowerCase()===String(v).toLowerCase());
  if(this.op==="select"){let d=tbl.filter(m); if(this.t==="docs_hist") d=d.slice().reverse(); if(this.lim) d=d.slice(0,this.lim); if(this.r) d=d.slice(this.r[0],this.r[1]+1); d=JSON.parse(JSON.stringify(d)); return {data:this.one?(d[0]||null):d,error:null};}
  if(this.op==="upsert"){const rs=Array.isArray(this.row)?this.row:[this.row]; for(const row0 of rs){const row=JSON.parse(JSON.stringify(row0)); const i=tbl.findIndex(x=>x.col===row.col&&x.id===row.id); if(this.t==="docs") trig(i>=0?"update":"insert",i>=0?tbl[i]:null,row); if(i>=0) tbl[i]=row; else tbl.push(row);} notify(); return {error:null};}
  if(this.op==="insert"){ const dup=this.t==="docs"?tbl.some(x=>x.col===this.row.col&&x.id===this.row.id):tbl.some(x=>x.email===this.row.email); if(dup) return {error:{code:"23505",message:"dup"}}; const nr=JSON.parse(JSON.stringify(this.row)); if(this.t==="docs") trig("insert",null,nr); tbl.push(nr); notify(); return {error:null};}
  if(this.op==="update"){const hit=tbl.filter(m); for(const x of hit){ const old=JSON.parse(JSON.stringify(x)); Object.assign(x,JSON.parse(JSON.stringify(this.row))); if(this.t==="docs") trig("update",old,x); } notify(); return {data:hit.map(x=>({id:x.id})),error:null};}
  if(this.op==="delete"){ if(this.t==="docs") for(const x of tbl.filter(m)) trig("delete",x,null); const keep=tbl.filter(x=>!m(x)); tbl.length=0; tbl.push(...keep); notify(); return {error:null};}
 }}
const sess={access_token:"t",refresh_token:"r",user:{email:"gokhankaya1@yahoo.com"}};
const F=()=>JSON.parse(localStorage.getItem("mockmfa")||"[]"), FS=v=>localStorage.setItem("mockmfa",JSON.stringify(v));
const mfa={listFactors:async()=>({data:{totp:F(),all:F()},error:null}),
 enroll:async()=>{ const f={id:"f"+Date.now(),status:"unverified",factor_type:"totp"}; FS([...F(),f]); return {data:{id:f.id,totp:{qr_code:"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10'/></svg>",secret:"JBSWY3DPEHPK3PXP"}},error:null}; },
 challengeAndVerify:async({factorId,code})=>{ if(code!=="123456") return {error:{message:"Invalid TOTP code entered"}}; FS(F().map(f=>f.id===factorId?{...f,status:"verified"}:f)); sessionStorage.setItem("mockaal2","1"); return {data:{},error:null}; },
 unenroll:async({factorId})=>{ FS(F().filter(f=>f.id!==factorId)); return {error:null}; },
 getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:sessionStorage.getItem("mockaal2")?"aal2":"aal1",nextLevel:F().some(f=>f.status==="verified")?"aal2":"aal1"},error:null})};
const client={auth:{mfa,getSession:async()=>({data:{session:sess},error:null}),refreshSession:async()=>({data:{session:sess},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({}),signInWithPassword:async()=>({data:{session:sess},error:null}),signUp:async()=>({error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})},
 from:t=>new Q(t),
 storage:{from:()=>({upload:async(p,b)=>{T.files[p]=b;return{data:{path:p},error:null}},remove:async()=>({error:null}),
   createSignedUrl:async(p)=>({data:{signedUrl:T.files[p]?URL.createObjectURL(T.files[p]):"data:image/gif;base64,R0lGODlhAQABAAAAACw="},error:null}),
   createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:T.files[p]?URL.createObjectURL(T.files[p]):"data:image/gif;base64,R0lGODlhAQABAAAAACw="})),error:null})})},
 channel:()=>({on(_e,_f,cb){subs.push(cb);return this},subscribe(){return this}}),removeChannel(){}};
window.supabase={createClient:()=>client};})();
''' % json.dumps(rows, ensure_ascii=False)
open(os.path.join(out, 'supabase.js'), 'w', encoding='utf-8').write(mock)
open(os.path.join(out, 'config.js'), 'w').write('window.UD_CONFIG={url:"https://x.supabase.co",key:"k"};')
for f in os.listdir(root):
    if f.endswith(('.html', '.js', '.png', '.webmanifest')) and f not in ('supabase.js', 'config.js'):
        shutil.copy(os.path.join(root, f), os.path.join(out, f))
if os.path.isdir(os.path.join(root, 'logos')): shutil.copytree(os.path.join(root, 'logos'), os.path.join(out, 'logos'), dirs_exist_ok=True)
print('mock hazır:', out)
