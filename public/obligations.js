'use strict';
(()=>{
if(!$('personalImport'))return;
function tipsTotal(d,src){return sum(state.entries.filter(e=>e.kind==='income'&&e.source===src&&e.date===d),e=>tipReceived(e))}
function tipPlan(d,src,total){
 if(!validDate(d)||d>today()||!sources.includes(src)||!validMoney(total))throw Error('Μη έγκυρα tips.');
 const rows=state.entries.filter(e=>e.kind==='income'&&e.source===src&&e.date===d),current=tipsTotal(d,src);
 if(sum(rows,tipNet)>current)throw Error('Υπάρχουν tips σε αναμονή. Έλεγξε πρώτα το Ιστορικό.');
 if(total<current)throw Error('Τα ήδη καταχωρισμένα tips είναι μεγαλύτερα. Δεν διαγράφονται αυτόματα.');
 return total===current?null:{id:uid(),kind:'income',source:src,date:d,amount:0,tip:total-current,deduction:0,hours:0,status:'paid',paidDate:d,note:'Tips ημέρας'};
}
function applyTips(d,src,total){
 if(error)return alert('Υπάρχει πρόβλημα αποθήκευσης.');
 try{const e=tipPlan(d,src,total);if(!e){toast('Τα tips είναι ήδη σωστά');return}const next={...state,entries:[...state.entries,e]};if(!valid(next))throw Error('Μη έγκυρα δεδομένα.');state=next;save();if(!error)toast('Συνολικά tips ημέρας: '+money(total))}catch(e){alert(e.message)}
}
$('tipQuick').onclick=()=>{const d=today(),src='Πλαίσιο',cur=tipsTotal(d,src),raw=prompt('Συνολικά tips Πλαισίου σήμερα (όχι επιπλέον). Ήδη καταχωρισμένα: '+money(cur),euro(cur));if(raw===null)return;if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))return alert('Γράψε ποσό, π.χ. 28 ή 28,50.');applyTips(d,src,cents(raw))};
function paidValid(b){return b&&typeof b.id==='string'&&typeof b.name==='string'&&b.name.length<=120&&validDate(b.date)&&b.date<=today()&&validMoney(b.amount)&&b.amount>0}
const oldValid=valid;valid=x=>oldValid(x)&&(x.paidStatements===undefined||Array.isArray(x.paidStatements)&&x.paidStatements.length<=5000&&x.paidStatements.every(paidValid)&&new Set(x.paidStatements.map(b=>b.id)).size===x.paidStatements.length)&&(x.appliedImports===undefined||Array.isArray(x.appliedImports)&&x.appliedImports.length<=5000&&x.appliedImports.every(id=>typeof id==='string'&&id.length<=120));
const oldMerge=mergedBackup;mergedBackup=function(local,other,use){const r=oldMerge(local,other,use),m=new Map((local.paidStatements||[]).map(x=>[x.id,x]));for(const x of other.paidStatements||[])if(!m.has(x.id))m.set(x.id,x);r.next.paidStatements=[...m.values()];r.next.appliedImports=[...new Set([...(local.appliedImports||[]),...(other.appliedImports||[])])];return r};
const tax=b=>/^ΑΑΔΕ\s*·/.test(b.name||'');
function renderObligations(){
 const rows=state.bills.filter(tax).sort((a,b)=>a.date.localeCompare(b.date)),left=sum(rows,billLeft),now=today(),monthEnd=plus(now.slice(0,7)+'-01',32).slice(0,7)+'-01',due=sum(rows.filter(b=>b.date<monthEnd),billLeft),next=rows.find(b=>billLeft(b)>0);
 $('taxSummary').innerHTML=rows.length?'<h3>ΑΑΔΕ · ρύθμιση</h3><div class="grid"><div><small>Υπόλοιπο ρύθμισης</small><b>'+money(left)+'</b></div><div><small>Πληρωτέα έως τέλος μήνα</small><b>'+money(due)+'</b></div></div><p class="fine">'+(next?'Παλαιότερη ανεξόφλητη προθεσμία: '+prettyDate(next.date):'Η ρύθμιση έχει εξοφληθεί.')+' · Οι δόσεις περιλαμβάνονται ήδη στις υποχρεώσεις, όχι δεύτερη φορά.</p>':'<p>Δεν έχει καταχωριστεί ξεχωριστή ρύθμιση ΑΑΔΕ.</p>';
 const hist=(state.paidStatements||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));$('paidStatements').innerHTML=hist.length?'<p>Σύνολο εξοφλημένων λογαριασμών: '+money(sum(hist,b=>b.amount))+'</p>'+hist.map(b=>'<div class="row"><div><b>'+esc(b.name)+'</b><b>'+money(b.amount)+'</b></div><small>'+prettyDate(b.date)+' · Εξοφλημένος (ημερομηνία λογαριασμού)</small></div>').join(''):'<p>Δεν υπάρχουν εισαγόμενοι εξοφλημένοι λογαριασμοί.</p>';
}
function importPersonal(raw){
 if(error)return alert('Υπάρχει πρόβλημα στα τοπικά δεδομένα.');
 try{
  if(raw.length>100000)throw Error('Μεγάλο αρχείο.');const p=JSON.parse(raw);
  if(p.type!=='tameio-obligations-v1'||typeof p.id!=='string'||p.id.length>120||!Array.isArray(p.bills)||p.bills.length>100||!Array.isArray(p.paid)||p.paid.length>100||!p.paid.every(paidValid)||!p.bills.every(b=>b&&typeof b.id==='string'&&typeof b.name==='string'&&tax(b)&&validDate(b.date)&&validMoney(b.amount)&&b.amount>0)||new Set(p.bills.map(b=>b.id)).size!==p.bills.length||sum(p.bills,b=>b.amount)!==p.total)throw Error('Μη έγκυρη αναφορά.');
  if((state.appliedImports||[]).includes(p.id)){toast('Η αναφορά έχει ήδη εισαχθεί');return}
  const bills=[...state.bills],paid=[...(state.paidStatements||[])];
  for(const b of p.bills){
   const same=bills.find(x=>x.id===b.id);
   if(same){if(same.amount!==b.amount||same.date!==b.date)throw Error('Υπάρχει διαφορετική δόση. Δεν έγινε εισαγωγή.');continue}
   const overlapping=bills.find(x=>/ααδε|εφορ|φορολογ|ρύθμιση|ρυθμιση/i.test(x.name)&&!p.bills.some(y=>y.id===x.id));
   if(overlapping)throw Error('Υπάρχει ήδη καταχώριση που μοιάζει με ρύθμιση ΑΑΔΕ. Έλεγξέ τη πριν την εισαγωγή για να μη μετρηθεί διπλά.');
   bills.push({id:b.id,name:b.name,date:b.date,amount:b.amount});
  }
  for(const b of p.paid)if(!paid.some(x=>x.id===b.id||x.date===b.date&&x.amount===b.amount))paid.push({id:b.id,name:b.name,date:b.date,amount:b.amount});
  let e=null,tipNote='';if(p.tip){try{e=tipPlan(p.tip.date,p.tip.source,p.tip.total);tipNote=e?' · Προσθήκη tips '+money(e.tip):' · Tips ήδη σωστά'}catch(err){tipNote=' · Τα tips δεν άλλαξαν: '+err.message}}
  const next={...state,bills,paidStatements:paid,appliedImports:[...(state.appliedImports||[]),p.id],entries:e?[...state.entries,e]:state.entries};
  if(!valid(next))throw Error('Ασυμβατά δεδομένα.');
  if(!confirm('Εισαγωγή '+(bills.length-state.bills.length)+' υποχρεώσεων ΑΑΔΕ, '+(paid.length-(state.paidStatements||[]).length)+' εξοφλημένων λογαριασμών'+tipNote+'; Δεν αντικαθίστανται ρυθμίσεις, βάρδιες ή προηγούμενες κινήσεις.'))return;
  localStorage.setItem(KEY+'_before_obligations_import',JSON.stringify(state));state=next;save();if(!error)toast('Η αναφορά αποθηκεύτηκε'+tipNote);
 }catch(e){alert(e.message||'Δεν έγινε εισαγωγή.')}
}
$('personalImport').onchange=async()=>{const f=$('personalImport').files[0];if(!f)return;try{if(f.size>100000)throw Error('Μεγάλο αρχείο.');importPersonal(await f.text())}catch(e){alert(e.message)}finally{$('personalImport').value=''}};
$('personalPaste').onclick=()=>importPersonal($('personalText').value.trim());
const prevRender=render;render=function(){prevRender();renderObligations()};renderObligations();
})();
