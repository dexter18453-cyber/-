'use strict';
(()=>{
const META='tameio_vault_v1',API='https://to-tameio-mou-sync.onrender.com/vault',ENC=new TextEncoder(),DEC=new TextDecoder();
const panel=$('vaultPanel'),banner=$('vaultBanner'),status=$('vaultStatus'),create=$('vaultCreate'),connect=$('vaultConnect'),copy=$('vaultCopy'),input=$('vaultCode'),disconnect=$('vaultDisconnect'),pull=$('vaultPull'),retry=$('vaultRetry');
let meta=null,busy=false,again=false,conflict=null,timeout;
const SIGNOUT=META+'_signedout';
let backupDB=null,backupQueue=Promise.resolve();
function sessionDB(){if(!('indexedDB' in window))return Promise.reject(Error('unsupported'));if(!backupDB)backupDB=new Promise((resolve,reject)=>{const r=indexedDB.open('tameio-device-session',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('session'))r.result.createObjectStore('session')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('blocked'))});return backupDB}
async function sessionIO(mode,value){const db=await sessionDB();return new Promise((resolve,reject)=>{const tx=db.transaction('session',mode==='read'?'readonly':'readwrite'),st=tx.objectStore('session'),r=mode==='read'?st.get('meta'):mode==='delete'?st.delete('meta'):st.put(value,'meta');tx.oncomplete=()=>resolve(r.result);tx.onabort=tx.onerror=()=>reject(tx.error)})}
function backupSession(m){backupQueue=backupQueue.catch(()=>{}).then(()=>sessionIO(m?'write':'delete',m)).catch(()=>{})}
function validMeta(m){return m&&/^[0-9a-f]{64}$/.test(m.key)&&Number.isSafeInteger(m.version)&&m.version>=0?m:null}
function rememberDevice(){try{navigator.storage?.persist?.().catch(()=>{})}catch{}}
function rememberAccount(email){if(meta){putMeta({...meta,email});show();rememberDevice()}}

function note(s){status.textContent=s;banner.textContent=s}
function readMeta(){try{const m=JSON.parse(localStorage.getItem(META));return validMeta(m)}catch{return null}}
function putMeta(m){localStorage.setItem(META,JSON.stringify(m));localStorage.removeItem(SIGNOUT);meta=m;backupSession(m)}
function show(){const profile=$('accountProfile');if(profile){profile.textContent=meta?(meta.email?'Συνδεδεμένος λογαριασμός: '+meta.email:'Συνδεδεμένο ιδιωτικό Ταμείο σε αυτή τη συσκευή'):'Δεν είσαι συνδεδεμένος σε αυτή τη συσκευή';$('accountForm').hidden=!!meta?.email; $('accountLogout').hidden=!meta; if(meta?.email)$('accountEmail').value=meta.email;}create.hidden=connect.hidden=input.hidden=!!meta;copy.hidden=disconnect.hidden=retry.hidden=!meta;pull.hidden=!conflict;create.disabled=connect.disabled=copy.disabled=disconnect.disabled=pull.disabled=retry.disabled=busy}
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
 const hasData=state.entries.length||state.bills.length||state.shifts?.length||state.settings.daily||state.settings.openingConfirmed||state.smart;
 if(hasData&&before!==decoded.raw&&!confirm('Υπάρχουν τοπικά στοιχεία. Να φορτωθεί το online αντίγραφο; Θα διατηρηθεί προηγούμενο τοπικό αντίγραφο.'))return;
 restore(decoded.next);putMeta({key:root,version:remote.version,base:await fp(snapshot())});input.value='';note('Online · επαναφέρθηκαν τα στοιχεία');
 }catch{note('Δεν έγινε σύνδεση. Τα προηγούμενα δεδομένα παραμένουν.')}finally{busy=false;show()}
};
copy.onclick=async()=>{if(!meta)return;try{await navigator.clipboard.writeText(meta.key);note('Ο ιδιωτικός κωδικός αντιγράφηκε. Φύλαξέ τον με ασφάλεια.')}catch{prompt('Ιδιωτικός κωδικός σύνδεσης — φύλαξέ τον, μην τον κοινοποιείς:',meta.key)}};
disconnect.onclick=()=>{if(busy||!meta)return;if(!confirm('Να αποσυνδεθεί αυτή η συσκευή; Κράτησε τον ιδιωτικό κωδικό. Τα τοπικά και online δεδομένα δεν διαγράφονται.'))return;localStorage.setItem(SIGNOUT,'1');localStorage.removeItem(META);backupSession(null);meta=null;conflict=null;show();note('Τοπική αποθήκευση · όχι online')};if($('accountLogout'))$('accountLogout').onclick=disconnect.onclick;
pull.onclick=async()=>{if(busy||!meta||!conflict)return;if(!confirm('Να φορτωθεί το online αντίγραφο; Οι τοπικές αλλαγές θα φυλαχθούν σε αντίγραφο, αλλά δεν θα συνδυαστούν αυτόματα.'))return;busy=true;show();try{const c=conflict;restore(c.next);putMeta({...meta,version:c.remote.version,base:await fp(snapshot())});conflict=null;note('Online · συγχρονισμένο')}catch{note('Δεν έγινε επαναφορά.')}finally{busy=false;show()}};

// Email is an unverified login identifier. The password is never sent to the server.
// PBKDF2 separates the authentication proof from the AES key wrapping the existing vault secret.
const accountForm=$('accountForm'),accountEmail=$('accountEmail'),accountPassword=$('accountPassword'),accountStatus=$('accountStatus');
let accountBusy=false;
async function accountKeys(email,password){
 const id=hex(await digest('tameio-account-id-v1:'+email));
 const material=await crypto.subtle.importKey('raw',ENC.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:ENC.encode('tameio-account-salt-v1:'+id)},material,512));
 const proof=hex(bits.slice(0,32)),key=await crypto.subtle.importKey('raw',bits.slice(32),{name:'AES-GCM'},false,['encrypt','decrypt']);bits.fill(0);return {id,proof,key};
}
async function accountCall(action,data){
 const r=await fetch(API.replace(/\/vault$/,'/account/'+action),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:typeof AbortSignal.timeout==='function'?AbortSignal.timeout(90000):undefined});
 if(!r.ok)throw Object.assign(Error('account request'),{status:r.status});return r.json();
}
async function unwrapRoot(wrapped,key){
 const a=Uint8Array.from(atob(wrapped),s=>s.charCodeAt(0));if(a.length!==92)throw Error('invalid key envelope');
 const root=DEC.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(0,12)},key,a.slice(12)));
 if(!/^[a-f0-9]{64}$/.test(root))throw Error('invalid root');return root;
}
if(accountForm)accountForm.onsubmit=async e=>{
 e.preventDefault();if(accountBusy||busy||error)return;
 const action=e.submitter?.value==='register'?'register':'login',email=accountEmail.value.trim().toLowerCase(),password=accountPassword.value;
 if(!/^[a-z0-9.!#$%&'*+/=?^_~\x60{|}-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||email.length>254||password.length<14||password.length>256){accountStatus.textContent='Χρησιμοποίησε έγκυρο email και μοναδικό κωδικό τουλάχιστον 14 χαρακτήρων.';return}
 if(action==='register'&&(!meta||meta.version<1)){accountStatus.textContent='Ενεργοποίησε πρώτα την online αποθήκευση στη συσκευή με τα σωστά στοιχεία.';return}
 accountBusy=true;busy=true;show();for(const b of accountForm.querySelectorAll('button,input'))b.disabled=true;accountStatus.textContent='Επεξεργασία…';let rootToConnect=null;
 try{
  const a=await accountKeys(email,password);
  if(action==='register'){
   const root=meta.key,k=await keys(root),remote=await call(k);if(remote.version<1)throw Error('missing existing vault');
   await decrypt(remote.ciphertext,k.key);
   const wrapped=await encrypt(root,a.key);
   await accountCall('register',{id:a.id,proof:a.proof,wrapped});rememberAccount(email);
   accountStatus.textContent='Ο λογαριασμός δημιουργήθηκε και συνδέθηκε με το υπάρχον Ταμείο. Φύλαξε και τον ιδιωτικό κωδικό ανάκτησης.';
  }else{
   const r=await accountCall('login',{id:a.id,proof:a.proof}),root=await unwrapRoot(r.wrapped,a.key);
   if(meta&&meta.key!==root){accountStatus.textContent='Αυτή η συσκευή έχει άλλο ενεργό Ταμείο. Κράτησε αντίγραφο πριν το αποσυνδέσεις.';return}
   if(meta){rememberAccount(email);again=true;accountStatus.textContent='Ο λογαριασμός αντιστοιχεί στο ενεργό Ταμείο.'}
   else rootToConnect=root;
  }
  accountPassword.value='';
 }catch(e){accountStatus.textContent=e.status===409?'Το email χρησιμοποιείται ήδη. Δοκίμασε σύνδεση.':e.status===401?'Λάθος email ή κωδικός.':e.status===429?'Πολλές προσπάθειες. Δοκίμασε σε 10 λεπτά.':'Η σύνδεση δεν ολοκληρώθηκε. Τα υπάρχοντα δεδομένα δεν άλλαξαν.'}
 finally{accountBusy=false;busy=false;show();for(const b of accountForm.querySelectorAll('button,input'))b.disabled=false}
 if(rootToConnect){input.value=rootToConnect;try{await connect.onclick();if(meta?.key===rootToConnect)rememberAccount(email);accountStatus.textContent=meta?.key===rootToConnect?'Συνδέθηκες στο υπάρχον Ταμείο.':'Δεν φορτώθηκε το Ταμείο. Δοκίμασε ξανά.'}finally{input.value=''}}
 if(again){again=false;schedule()}
};
retry.onclick=sync;
const previousSave=save;save=function(){previousSave();if(meta&&!error)schedule()};
const previousTransfer=transfer;transfer=function(raw){previousTransfer(raw);if(meta&&!error)schedule()};
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const x=JSON.parse(e.newValue);if(valid(x)){state=x;settingsFill();if(typeof smartFill==='function')smartFill();render();schedule()}}catch{}}});
meta=readMeta();show();if(meta){backupSession(meta);sync()}else{note('Τοπική αποθήκευση · έλεγχος σύνδεσης συσκευής');if(!localStorage.getItem(SIGNOUT)){sessionIO('read').then(m=>{if(meta||localStorage.getItem(SIGNOUT)||busy)return;const saved=validMeta(m);if(saved){putMeta(saved);show();sync()}else note('Τοπική αποθήκευση · σύνδεση στις Ρυθμίσεις')}).catch(()=>{if(!meta)note('Τοπική αποθήκευση · σύνδεση στις Ρυθμίσεις')})}else note('Τοπική αποθήκευση · σύνδεση στις Ρυθμίσεις')}setInterval(()=>{if(meta&&!document.hidden&&!conflict)sync()},25000);
})();
