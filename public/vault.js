'use strict';
(()=>{
const META='tameio_vault_v1',API='https://to-tameio-mou-sync.onrender.com/vault',ENC=new TextEncoder(),DEC=new TextDecoder();
const panel=$('vaultPanel'),banner=$('vaultBanner'),status=$('vaultStatus'),create=$('vaultCreate'),connect=$('vaultConnect'),copy=$('vaultCopy'),input=$('vaultCode'),disconnect=$('vaultDisconnect'),pull=$('vaultPull'),retry=$('vaultRetry');
let meta=null,busy=false,again=false,conflict=null,timeout;
function note(s){status.textContent=s;banner.textContent=s}
function readMeta(){try{const m=JSON.parse(localStorage.getItem(META));return m&&/^[0-9a-f]{64}$/.test(m.key)&&Number.isSafeInteger(m.version)&&m.version>=0?m:null}catch{return null}}
function putMeta(m){localStorage.setItem(META,JSON.stringify(m));meta=m}
function show(){create.hidden=connect.hidden=input.hidden=!!meta;copy.hidden=disconnect.hidden=retry.hidden=!meta;pull.hidden=!conflict;create.disabled=connect.disabled=copy.disabled=disconnect.disabled=pull.disabled=retry.disabled=busy}
function hex(a){return Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('')}
async function digest(s){return crypto.subtle.digest('SHA-256',ENC.encode(s))}
async function fp(s){return hex(await digest('tameio-snapshot-v1:'+s))}
async function keys(root){const token=hex(await digest('tameio-auth-v1:'+root)),key=await crypto.subtle.importKey('raw',await digest('tameio-encrypt-v1:'+root),{name:'AES-GCM'},false,['encrypt','decrypt']);return {token,key}}
function b64(a){let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)}
async function encrypt(s,k){const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,ENC.encode(s))),out=new Uint8Array(iv.length+data.length);out.set(iv);out.set(data,iv.length);return b64(out)}
async function decrypt(c,k){const a=Uint8Array.from(atob(c),s=>s.charCodeAt(0));if(a.length<29)throw Error('invalid ciphertext');const raw=DEC.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(0,12)},k,a.slice(12)));const next=JSON.parse(raw);if(!valid(next))throw Error('invalid data');return {raw,next}}
async function call(k,body){const opt={method:body?'PUT':'GET',cache:'no-store',headers:{Authorization:'Bearer '+k.token},signal:AbortSignal.timeout?AbortSignal.timeout(90000):undefined};if(body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body)}const r=await fetch(API,opt);if(r.status===409)throw Object.assign(Error('conflict'),{conflict:true});if(!r.ok)throw Error('connection');return r.json()}
function snapshot(){return JSON.stringify(state)}
function restore(next){if(error)throw Error('local error');const old=localStorage.getItem(KEY);if(old)localStorage.setItem(KEY+'_before_cloud',old);localStorage.setItem(KEY,JSON.stringify(next));state=next;settingsFill();if(typeof smartFill==='function')smartFill();render()}
function schedule(){clearTimeout(timeout);timeout=setTimeout(sync,800)}
async function sync(){
 if(!meta)return;if(busy){again=true;return}
 busy=true;show();conflict=null;note('Συγχρονισμός…');
 try{
  if(error)throw Error('local error');
  const m=meta,k=await keys(m.key),initial=snapshot(),initialHash=await fp(initial),hasLocal=!!localStorage.getItem(KEY),remote=await call(k);
  if(!Number.isSafeInteger(remote.version)||remote.version<0)throw Error('invalid version');
  if(remote.version===0&&m.version>0){note('Το online αντίγραφο δεν βρέθηκε. Δεν έγινε αντικατάσταση.');return}
  if(remote.version>0&&remote.version<m.version){note('Το online αντίγραφο είναι παλαιότερο. Δεν έγινε αντικατάσταση.');return}
  if(remote.version>0&&remote.version!==m.version){
   const decoded=await decrypt(remote.ciphertext,k.key),remoteHash=await fp(decoded.raw);
   if(snapshot()!==initial){again=true;return}
   if(!hasLocal||initialHash===m.base||initialHash===remoteHash){
    if(initialHash!==remoteHash)restore(decoded.next);
    putMeta({...m,version:remote.version,base:await fp(snapshot())});note('Online · συγχρονισμένο');return;
   }
   conflict={remote,next:decoded.next};note('Υπάρχουν αλλαγές και στις δύο συσκευές. Δεν διαγράφηκε τίποτα.');return;
  }
  if(remote.version>0&&!hasLocal){
   const decoded=await decrypt(remote.ciphertext,k.key);if(snapshot()!==initial){again=true;return}restore(decoded.next);putMeta({...m,version:remote.version,base:await fp(snapshot())});note('Online · επαναφέρθηκαν τα στοιχεία');return;
  }
  if(remote.version>0&&initialHash===m.base){note('Online · συγχρονισμένο');return}
  const cipher=await encrypt(initial,k.key);
  if(cipher.length>4000000){note('Το αντίγραφο είναι πολύ μεγάλο. Κράτησε αρχείο JSON.');return}
  const written=await call(k,{version:remote.version,ciphertext:cipher});putMeta({...m,version:written.version,base:initialHash});note('Online · αποθηκεύτηκε');
  if(snapshot()!==initial)again=true;
 }catch(e){if(e.conflict){again=true;note('Έλεγχος νέας έκδοσης…')}else note('Δεν ολοκληρώθηκε ο συγχρονισμός. Τα τοπικά δεδομένα παραμένουν.')}
 finally{busy=false;show();if(again){again=false;schedule()}}
}
create.onclick=()=>{if(busy||meta||error)return;if(!confirm('Να δημιουργηθεί ιδιωτικό online αντίγραφο από τα δεδομένα αυτής της συσκευής;'))return;try{putMeta({key:hex(crypto.getRandomValues(new Uint8Array(32))),version:0,base:null});show();sync()}catch{note('Δεν έγινε τοπική αποθήκευση του κλειδιού.')}}
connect.onclick=async()=>{if(busy||meta||error)return;const root=input.value.trim().toLowerCase();if(!/^[0-9a-f]{64}$/.test(root)){note('Ο κωδικός σύνδεσης δεν είναι έγκυρος.');return}
 busy=true;show();note('Ανάκτηση online αντιγράφου…');
 try{const before=snapshot(),k=await keys(root),remote=await call(k);if(!remote.version){note('Δεν υπάρχει online αντίγραφο για αυτόν τον κωδικό.');return}const decoded=await decrypt(remote.ciphertext,k.key);
 if(snapshot()!==before){note('Έγιναν τοπικές αλλαγές. Δοκίμασε ξανά.');return}
 const hasData=state.entries.length||state.bills.length||state.settings.daily||state.settings.openingConfirmed||state.smart;
 if(hasData&&before!==decoded.raw&&!confirm('Υπάρχουν τοπικά στοιχεία. Να φορτωθεί το online αντίγραφο; Θα διατηρηθεί προηγούμενο τοπικό αντίγραφο.'))return;
 restore(decoded.next);putMeta({key:root,version:remote.version,base:await fp(snapshot())});input.value='';note('Online · επαναφέρθηκαν τα στοιχεία');
 }catch{note('Δεν έγινε σύνδεση. Τα προηγούμενα δεδομένα παραμένουν.')}finally{busy=false;show()}
};
copy.onclick=async()=>{if(!meta)return;try{await navigator.clipboard.writeText(meta.key);note('Ο ιδιωτικός κωδικός αντιγράφηκε. Φύλαξέ τον με ασφάλεια.')}catch{prompt('Ιδιωτικός κωδικός σύνδεσης — φύλαξέ τον, μην τον κοινοποιείς:',meta.key)}};
disconnect.onclick=()=>{if(busy||!meta)return;if(!confirm('Να αποσυνδεθεί αυτή η συσκευή; Κράτησε τον ιδιωτικό κωδικό. Τα τοπικά και online δεδομένα δεν διαγράφονται.'))return;localStorage.removeItem(META);meta=null;conflict=null;show();note('Τοπική αποθήκευση · όχι online')};
pull.onclick=async()=>{if(busy||!meta||!conflict)return;if(!confirm('Να φορτωθεί το online αντίγραφο; Οι τοπικές αλλαγές θα φυλαχθούν σε αντίγραφο, αλλά δεν θα συνδυαστούν αυτόματα.'))return;busy=true;show();try{const c=conflict;restore(c.next);putMeta({...meta,version:c.remote.version,base:await fp(snapshot())});conflict=null;note('Online · συγχρονισμένο')}catch{note('Δεν έγινε επαναφορά.')}finally{busy=false;show()}};
retry.onclick=sync;
const previousSave=save;save=function(){previousSave();if(meta&&!error)schedule()};
const previousTransfer=transfer;transfer=function(raw){previousTransfer(raw);if(meta&&!error)schedule()};
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const x=JSON.parse(e.newValue);if(valid(x)){state=x;settingsFill();if(typeof smartFill==='function')smartFill();render();schedule()}}catch{}}});
meta=readMeta();show();if(meta)sync();else note('Τοπική αποθήκευση · ενεργοποίησε τον online συγχρονισμό στις Ρυθμίσεις');setInterval(()=>{if(meta&&!document.hidden&&!conflict)sync()},25000);
})();
