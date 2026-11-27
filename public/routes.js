'use strict';
(()=>{
const ROUTE_KEY='tameio_route_local_v1',states={pending:'Σε αναμονή',done:'Παραδόθηκε',failed:'Δεν παραδόθηκε',absent:'Απουσία πελάτη'};
const panel=$('routePage');if(!panel)return;
let route=null,frame=null,ocrFile=null,ocrTimeout=null;
function validStop(s){return s&&typeof s.id==='string'&&Number.isInteger(s.no)&&s.no>0&&s.no<=9999&&typeof s.address==='string'&&s.address.length<=180&&typeof s.area==='string'&&s.area.length<=80&&typeof s.eta==='string'&&s.eta.length<=20&&Number.isInteger(s.parcels)&&s.parcels>=0&&s.parcels<=999&&Object.hasOwn(states,s.status)&&validMoney(s.tip)&&(!s.at||Number.isSafeInteger(s.at))}
function validRoute(x){return x&&typeof x.id==='string'&&validDate(x.date)&&x.date<=today()&&typeof x.number==='string'&&x.number.length<=30&&Array.isArray(x.stops)&&x.stops.length<=500&&x.stops.every(validStop)&&new Set(x.stops.map(s=>s.no)).size===x.stops.length}
function load(){try{const x=JSON.parse(localStorage.getItem(ROUTE_KEY));return validRoute(x)?x:null}catch{return null}}
route=load();
function newStop(no,address='',area='',eta='',parcels=0){return{id:uid(),no,address:address.slice(0,180),area:area.slice(0,80),eta:eta.slice(0,20),parcels,status:'pending',tip:0,at:null}}
function stats(x){const done=x.stops.filter(s=>s.status==='done'),failed=x.stops.filter(s=>s.status==='failed'),absent=x.stops.filter(s=>s.status==='absent');return{id:x.id,date:x.date,total:x.stops.length,done:done.length,failed:failed.length,absent:absent.length,pending:x.stops.length-done.length-failed.length-absent.length,parcels:sum(done,s=>s.parcels),tip:sum(done,s=>s.tip),closed:!!x.closed}}
function validReport(r){return r&&typeof r.id==='string'&&validDate(r.date)&&r.date<=today()&&['total','done','failed','absent','pending','parcels','tip'].every(k=>validMoney(r[k]))&&r.total===r.done+r.failed+r.absent+r.pending&&typeof r.closed==='boolean'}
const oldValid=valid;valid=function(x){return oldValid(x)&&(x.routeReports===undefined||Array.isArray(x.routeReports)&&x.routeReports.length<=10000&&x.routeReports.every(validReport)&&new Set(x.routeReports.map(r=>r.id)).size===x.routeReports.length)};
const oldMerge=mergedBackup;mergedBackup=function(local,other,use){const r=oldMerge(local,other,use),m=new Map((local.routeReports||[]).map(x=>[x.id,x]));for(const x of other.routeReports||[]){if(m.has(x.id)){if(JSON.stringify(m.get(x.id))!==JSON.stringify(x))r.conflicts++;continue}m.set(x.id,x)}r.next.routeReports=[...m.values()];return r};
function report(x){if(error)return;const r=stats(x),rows=state.routeReports||[],prev=rows.find(y=>y.id===r.id);if(prev&&JSON.stringify(prev)===JSON.stringify(r))return;state.routeReports=[...rows.filter(y=>y.id!==r.id),r];save()}
function persist(x){if(!validRoute(x)){alert('Έλεγξε τις στάσεις.');return false}try{localStorage.setItem(ROUTE_KEY,JSON.stringify(x));route=x;report(x);renderRoute();return true}catch{alert('Δεν αποθηκεύτηκε το δρομολόγιο.');return false}}
function escAttr(x){return esc(x)}
function maps(s){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(s.address+(s.area?', '+s.area:'')+', Ελλάδα')+'&travelmode=driving'}
function renderRoute(){
 const rows=state.routeReports||[],history=$('routeReportHistory');
 history.innerHTML=rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{const work=state.entries.filter(e=>e.kind==='income'&&e.source==='Πλαίσιο'&&e.date===r.date),hours=typeof hoursForDay==='function'?hoursForDay('Πλαίσιο',r.date,work):0;return '<div class="row"><div><b>'+prettyDate(r.date)+'</b><b>'+r.done+'/'+r.total+' παραδόσεις</b></div><small>Απουσία '+r.absent+' · Αποτυχία '+r.failed+' · Αναμονή '+r.pending+' · Δέματα '+r.parcels+'</small><small>Tips στάσεων '+money(r.tip)+' · Ώρες εργασίας '+(hours>0?hours.toFixed(2):'—')+' · Μεροκάματο '+money(sum(work,wageNet))+'</small></div>'}).join('')||'<p>Δεν υπάρχουν ακόμη αναφορές.</p>';
 $('routeCurrent').hidden=!route;$('routeClose').hidden=!route;
 if(!route){$('routeTitle').textContent='Δεν έχεις ενεργό δρομολόγιο';$('routeSummary').textContent='';$('routeStops').innerHTML='';return}
 const q=stats(route),filter=$('routeFilter').value||'all';$('routeTitle').textContent='Δρομολόγιο '+(route.number||'')+' · '+prettyDate(route.date);
 $('routeSummary').innerHTML='<div class="grid">'+[['Στάσεις',q.total],['Παραδόθηκαν',q.done],['Αποτυχίες / απουσίες',q.failed+q.absent],['Απομένουν',q.pending],['Δέματα παραδόθηκαν',q.parcels],['Tips στάσεων',money(q.tip)]].map(([k,v])=>'<div><small>'+k+'</small><b>'+v+'</b></div>').join('')+'</div><progress max="'+Math.max(1,q.total)+'" value="'+(q.total-q.pending)+'"></progress>';
 $('routeStops').innerHTML=route.stops.filter(s=>filter==='all'||filter===s.status).map(s=>'<div class="row"><div><b>#'+s.no+' · '+esc(s.address||'Χωρίς διεύθυνση')+'</b><b>'+states[s.status]+'</b></div><small>'+esc(s.area)+' · '+esc(s.eta||'Χωρίς ώρα')+' · '+s.parcels+' δέματα'+(s.at?' · '+new Date(s.at).toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}):'')+'</small>'+(s.address?'<a href="'+escAttr(maps(s))+'" target="_blank" rel="noopener noreferrer" style="display:block;margin:10px 0;font-weight:700">Πλοήγηση με Google Maps</a>':'<small>Συμπλήρωσε πρώτα διεύθυνση.</small>')+'<div class="grid"><button data-route-id="'+esc(s.id)+'" data-route-action="done">Παραδόθηκε</button><button data-route-id="'+esc(s.id)+'" data-route-action="absent">Απουσία</button><button data-route-id="'+esc(s.id)+'" data-route-action="failed">Δεν παραδόθηκε</button><button data-route-id="'+esc(s.id)+'" data-route-action="pending">Αναμονή</button></div><button data-route-id="'+esc(s.id)+'" data-route-action="edit">Διόρθωση</button>'+(s.status==='done'?'<button data-route-id="'+esc(s.id)+'" data-route-action="tip">Tip '+money(s.tip)+'</button>':'')+'</div>').join('')||'<p>Καμία στάση σε αυτή την κατάσταση.</p>';
}
function parseRows(raw){
 const rows=[],seen=new Set();
 for(const line of raw.split(/\r?\n/)){
  const clean=line.trim().replace(/\|/g,' ').replace(/\s+/g,' ');if(!clean)continue;
  // Explicit safe format: number ; address ; area ; estimated time ; parcel count
  const cols=line.split(';').map(v=>v.trim());
  let no,address='',area='',eta='',parcels=0;
  if(cols.length>=3&&/^\d{1,3}$/.test(cols[0])){no=Number(cols[0]);address=cols[1];area=cols[2];eta=cols[3]||'';parcels=/^\d{1,3}$/.test(cols[4]||'')?Number(cols[4]):0}
  else{
   const m=clean.match(/^(\d{1,3})[.)]?\s+(.+)$/);if(!m)continue;no=Number(m[1]);
   // Ignore customer name and phone columns. Address is after postal code.
   const post=m[2].match(/\b(?:\d{5}|\d{3}\s\d{2})\b\s+(.+)$/);if(!post)continue;
   const rest=post[1];const time=rest.match(/\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/);eta=time?time[0].replace('.',':'):'';
   let before=(time?rest.slice(0,time.index):rest).trim();
   const region=before.match(/\s+(ΧΑΛΑΝΔΡΙ|Χαλάνδρι|ΑΓΙΑ\s+ΠΑΡΑΣΚΕΥΗ|Αγία\s+Παρασκευή|ΑΘΗΝΑ|Αθήνα|ΜΑΡΟΥΣΙ|Μαρούσι|[Α-Ωα-ωΆ-ώ]+\s*[Α-Ωα-ωΆ-ώ]*?)$/u);
   if(region&&/\d/.test(before.slice(0,region.index))){area=region[1];address=before.slice(0,region.index).trim()}else address=before;
   const last=rest.match(/\s(\d{1,3})$/);if(time&&last)parcels=Number(last[1]);
  }
  if(!no||seen.has(no)||!address||/\d{8,}/.test(address)||/\d{8,}/.test(area))continue;seen.add(no);rows.push(newStop(no,address,area,eta,parcels));
 }
 return rows.sort((a,b)=>a.no-b.no).slice(0,500)
}
function clearOCR(){clearTimeout(ocrTimeout);if(frame)frame.remove();frame=null;ocrFile=null;$('routePhoto').value=''}
$('routePhoto').onchange=()=>{const f=$('routePhoto').files[0];if(!f)return;if(!confirm('Έχεις άδεια χρήσης του δρομολογίου στην προσωπική εφαρμογή; Η φωτογραφία θα διαβαστεί τοπικά, χωρίς αποθήκευση.')){$('routePhoto').value='';return}clearTimeout(ocrTimeout);if(frame)frame.remove();frame=null;ocrFile=f;if(f.size>18000000){clearOCR();alert('Η φωτογραφία είναι πολύ μεγάλη.');return}
 $('routeOCRStatus').textContent='Φόρτωση τοπικής αναγνώρισης…';frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.hidden=true;frame.src='./route-ocr.html?v=1';document.body.appendChild(frame);
 ocrTimeout=setTimeout(()=>{clearOCR();$('routeOCRStatus').textContent='Η ανάγνωση δεν ολοκληρώθηκε. Δοκίμασε αντιγραφή κειμένου από Φωτογραφίες ή χειροκίνητη εισαγωγή.'},180000);
};
window.addEventListener('message',e=>{if(!frame||e.source!==frame.contentWindow||!e.data?.routeOCR)return;const x=e.data;if(x.type==='ready'&&ocrFile){frame.contentWindow.postMessage({routeOCR:true,type:'read',file:ocrFile},'*');ocrFile=null}else if(x.type==='progress'){$('routeOCRStatus').textContent='Αναγνώριση · '+Math.round((Number(x.progress)||0)*100)+'%'}else if(x.type==='result'){
 const rows=parseRows(String(x.text||''));$('routeText').value=rows.map(s=>[s.no,s.address,s.area,s.eta,s.parcels].join('; ')).join('\n');$('routeOCRStatus').textContent='Αναγνωρίστηκαν '+rows.length+' στάσεις. Έλεγξε όλες τις διευθύνσεις και τον αριθμό στάσεων πριν την εισαγωγή.';clearOCR();
 }else if(x.type==='error'){$('routeOCRStatus').textContent=String(x.message||'Αποτυχία αναγνώρισης');clearOCR()}});
$('routeParse').onclick=()=>{
 const rows=parseRows($('routeText').value);if(!rows.length){alert('Δεν αναγνωρίστηκαν στάσεις. Γράψε: 1; διεύθυνση; περιοχή; 09:00; 2');return}
 if(route&&route.stops.length){alert('Υπάρχει ήδη δρομολόγιο. Κλείσε το πρώτα ή πρόσθεσε στάσεις χειροκίνητα.');return}
 if(!confirm('Εισαγωγή '+rows.length+' στάσεων; Επιβεβαίωσε ότι οι διευθύνσεις και ο αριθμός τους είναι σωστά.'))return;
 if(persist({id:uid(),number:$('routeNumber').value.trim().slice(0,30),date:today(),stops:rows,closed:false})){$('routeText').value='';$('routeOCRStatus').textContent='Εισαγωγή ολοκληρώθηκε.'}
};
$('routeManual').onclick=()=>{const no=route?Math.max(0,...route.stops.map(s=>s.no))+1:1,address=prompt('Διεύθυνση στάσης');if(address===null||!address.trim())return;const area=prompt('Περιοχή','');if(area===null)return;const eta=prompt('Προγραμματισμένη ώρα (προαιρετικά)','');if(eta===null)return;const raw=prompt('Αριθμός δεμάτων','1');if(raw===null||!/^\d{1,3}$/.test(raw.trim()))return;
 if(/\d{8,}/.test(address)||/\d{8,}/.test(area))return alert('Μην καταχωρίζεις τηλέφωνα ή ονόματα πελατών.');
 const x=route||{id:uid(),date:today(),number:$('routeNumber').value.trim().slice(0,30),stops:[],closed:false};persist({...x,stops:[...x.stops,newStop(no,address.trim(),area.trim(),eta,Number(raw))]})
};
$('routeFilter').onchange=renderRoute;
panel.addEventListener('click',e=>{const b=e.target.closest('button[data-route-action]');if(!b||!route)return;const s=route.stops.find(x=>x.id===b.dataset.routeId);if(!s)return;let next={...s},act=b.dataset.routeAction;
 if(act==='edit'){const address=prompt('Διεύθυνση',s.address);if(address===null)return;const area=prompt('Περιοχή',s.area);if(area===null)return;const eta=prompt('Ώρα',s.eta);if(eta===null)return;const n=prompt('Δέματα',String(s.parcels));if(n===null||!/^\d{1,3}$/.test(n.trim())||/\d{8,}/.test(address)||/\d{8,}/.test(area))return;next={...next,address:address.slice(0,180),area:area.slice(0,80),eta:eta.slice(0,20),parcels:Number(n)}}
 else if(act==='tip'){const raw=prompt('Φιλοδώρημα αυτής της στάσης (ευρώ)',euro(s.tip));if(raw===null||!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())||!validMoney(cents(raw)))return;next.tip=cents(raw)}
 else if(Object.hasOwn(states,act)){if(s.status===act)return;next.status=act;next.at=act==='pending'?null:Date.now();if(act!=='done'&&s.tip&&!confirm('Η αλλαγή κατάστασης θα μηδενίσει το tip αυτής της στάσης.'))return;if(act!=='done')next.tip=0}
 persist({...route,stops:route.stops.map(x=>x.id===next.id?next:x)})
});
$('routeClose').onclick=()=>{if(!route)return;const q=stats(route);if(!confirm('Κλείσιμο δρομολογίου; '+q.pending+' στάσεις σε αναμονή. Θα διαγραφούν οι διευθύνσεις από τη συσκευή και θα παραμείνουν μόνο τα στατιστικά. Το χρονόμετρο δεν θα σταματήσει.'))return;
 if(error)return alert('Πρόβλημα αποθήκευσης. Μην κλείσεις ακόμη.');report({...route,closed:true});if(error)return;localStorage.removeItem(ROUTE_KEY);route=null;$('routeText').value='';clearOCR();renderRoute();toast('Το δρομολόγιο έκλεισε. Τα στατιστικά διατηρήθηκαν.')
};
const previousRender=render;render=function(){previousRender();renderRoute()};renderRoute();
})();
