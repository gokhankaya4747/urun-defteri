"""Yerel test ortamı: python3 tools/mock.py  →  .mock/ klasörüne sahte Supabase ile uygulamayı kurar.
Sunucu: python3 -m http.server 8778 --directory .mock   (örnek kayıtlar baslangic.json'dan)"""
import json, shutil, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, '.mock'); os.makedirs(out, exist_ok=True)
rows = json.load(open(os.path.join(root, 'baslangic.json'), encoding='utf-8'))
mock = '''window.__T={docs:%s,members:[{email:"gokhankaya1@yahoo.com",role:"owner",name:"Gökhan"}],files:{},log:[]};
(function(){const T=window.__T; const subs=[];
const notify=()=>setTimeout(()=>subs.forEach(f=>f({eventType:"*"})),0);
class Q{constructor(t){this.t=t;this.op="select";this.f=[];this.r=null;this.row=null}
 select(){return this} order(){return this} range(a,b){this.r=[a,b];return this} eq(k,v){this.f.push([k,v]);return this} ilike(k,v){this.f.push([k,v]);return this}
 maybeSingle(){this.one=true;return this} single(){this.one=true;return this}
 upsert(row){this.op="upsert";this.row=row;return this} insert(row){this.op="insert";this.row=row;return this} update(row){this.op="update";this.row=row;return this} delete(){this.op="delete";return this}
 then(res,rej){try{res(this.run())}catch(e){rej(e)}}
 run(){const tbl=this.t==="docs"?T.docs:T.members; T.log.push(this.t+":"+this.op);
  const m=x=>this.f.every(([k,v])=>String(x[k]).toLowerCase()===String(v).toLowerCase());
  if(this.op==="select"){let d=tbl.filter(m); if(this.r) d=d.slice(this.r[0],this.r[1]+1); d=JSON.parse(JSON.stringify(d)); return {data:this.one?(d[0]||null):d,error:null};}
  if(this.op==="upsert"){const rs=Array.isArray(this.row)?this.row:[this.row]; for(const row of rs){const i=tbl.findIndex(x=>x.col===row.col&&x.id===row.id); if(i>=0) tbl[i]=row; else tbl.push(row);} notify(); return {error:null};}
  if(this.op==="insert"){ if(tbl.some(x=>x.email===this.row.email)) return {error:{code:"23505",message:"dup"}}; tbl.push({...this.row}); notify(); return {error:null};}
  if(this.op==="update"){for(const x of tbl.filter(m)) Object.assign(x,this.row); notify(); return {error:null};}
  if(this.op==="delete"){const keep=tbl.filter(x=>!m(x)); tbl.length=0; tbl.push(...keep); notify(); return {error:null};}
 }}
const sess={access_token:"t",refresh_token:"r",user:{email:"gokhankaya1@yahoo.com"}};
const client={auth:{getSession:async()=>({data:{session:sess},error:null}),refreshSession:async()=>({data:{session:sess},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({}),signInWithPassword:async()=>({data:{session:sess},error:null}),signUp:async()=>({error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})},
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
