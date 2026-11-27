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
const novaValid=n=>n===undefined||!!(n&&n.day===9&&(n.amount===undefined||validMoney(n.amount)&&n.amount>0));
const oldValid=valid;valid=x=>oldValid(x)&&novaValid(x.novaReminder)&&(x.paidStatements===undefined||Array.isArray(x.paidStatements)&&x.paidStatements.length<=5000&&x.paidStatements.every(paidValid)&&new Set(x.paidStatements.map(b=>b.id)).size===x.paidStatements.length)&&(x.appliedImports===undefined||Array.isArray(x.appliedImports)&&x.appliedImports.length<=5000&&x.appliedImports.every(id=>typeof id==='string'&&id.length<=120));
const oldMerge=mergedBackup;mergedBackup=function(local,other,use){const r=oldMerge(local,other,use),m=new Map((local.paidStatements||[]).map(x=>[x.id,x]));for(const x of other.paidStatements||[])if(!m.has(x.id))m.set(x.id,x);r.next.paidStatements=[...m.values()];r.next.novaReminder=local.novaReminder?.amount?local.novaReminder:other.novaReminder||local.novaReminder;r.next.appliedImports=[...new Set([...(local.appliedImports||[]),...(other.appliedImports||[])])];return r};
const tax=b=>/^ΑΑΔΕ\s*·/.test(b.name||'');
function renderObligations(){
 const rows=state.bills.filter(tax).sort((a,b)=>a.date.localeCompare(b.date)),left=sum(rows,billLeft),now=today(),monthEnd=plus(now.slice(0,7)+'-01',32).slice(0,7)+'-01',due=sum(rows.filter(b=>b.date<monthEnd),billLeft),next=rows.find(b=>billLeft(b)>0);
 $('taxSummary').innerHTML=rows.length?'<h3>ΑΑΔΕ · ρύθμιση</h3><div class="grid"><div><small>Υπόλοιπο ρύθμισης</small><b>'+money(left)+'</b></div><div><small>Πληρωτέα έως τέλος μήνα</small><b>'+money(due)+'</b></div></div><p class="fine">'+(next?'Παλαιότερη ανεξόφλητη προθεσμία: '+prettyDate(next.date):'Η ρύθμιση έχει εξοφληθεί.')+' · Οι δόσεις περιλαμβάνονται ήδη στις υποχρεώσεις, όχι δεύτερη φορά.</p>':'<p>Δεν έχει καταχωριστεί ξεχωριστή ρύθμιση ΑΑΔΕ.</p>';
 const hist=(state.paidStatements||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));const nova=hist.filter(b=>/^Nova\s*·/.test(b.name)),taxPayments=hist.filter(tax);
 if($('novaSchedule')){const d=today(),day=state.novaReminder?.day||9;const cursor=new Date(d+'T12:00:00');if(cursor.getDate()>day)cursor.setMonth(cursor.getMonth()+1,1);cursor.setDate(day);const dates=Array.from({length:6},(_,i)=>{const t=new Date(cursor);t.setMonth(t.getMonth()+i);return dateString(t)});$('novaSchedule').innerHTML=(nova.length||state.novaReminder)?'<h3>Nova · μηνιαίο συμβόλαιο</h3><p>Μηνιαίο πάγιο: <b>'+(state.novaReminder?.amount?money(state.novaReminder.amount):'Δεν έχει οριστεί')+'</b></p><p>Επόμενη αναμενόμενη έκδοση: <b>'+prettyDate(dates[0])+'</b></p><p class="fine">Εκτίμηση έκδοσης στις '+day+' κάθε μήνα, όχι προθεσμία πληρωμής. Το πραγματικό ποσό και η λήξη επιβεβαιώνονται στον λογαριασμό.</p><p>'+dates.slice(1).map(prettyDate).join(' · ')+'</p><p>Ιστορικό εξοφλημένων Nova: '+money(sum(nova,b=>b.amount))+'</p>':''}
 if($('taxPaidHistory'))$('taxPaidHistory').innerHTML=taxPayments.length?'<h3>Δηλωθείσες καταβολές ΑΑΔΕ</h3>'+taxPayments.map(b=>'<p>'+prettyDate(b.date)+' · '+money(b.amount)+' · '+esc(b.name)+'</p>').join('')+'<p class="fine">Ιστορικό αναφοράς, όχι δεύτερη αφαίρεση από διαθέσιμα. Επιβεβαίωσε την πίστωση στο myAADE.</p>':'';const statements=hist.filter(b=>!tax(b));$('paidStatements').innerHTML=statements.length?'<p>Σύνολο εξοφλημένων λογαριασμών: '+money(sum(statements,b=>b.amount))+'</p>'+statements.map(b=>'<div class="row"><div><b>'+esc(b.name)+'</b><b>'+money(b.amount)+'</b></div><small>'+prettyDate(b.date)+' · Εξοφλημένος (ημερομηνία λογαριασμού)</small></div>').join(''):'<p>Δεν υπάρχουν εισαγόμενοι εξοφλημένοι λογαριασμοί.</p>';
}
function importPersonal(raw){
 if(error)return alert('Υπάρχει πρόβλημα στα τοπικά δεδομένα.');
 try{
  if(raw.length>100000)throw Error('Μεγάλο αρχείο.');const p=JSON.parse(raw);
  if(p.type!=='tameio-obligations-v1'||typeof p.id!=='string'||p.id.length>120||!Array.isArray(p.bills)||p.bills.length>100||!Array.isArray(p.paid)||p.paid.length>100||!p.paid.every(paidValid)||!p.bills.every(b=>b&&typeof b.id==='string'&&typeof b.name==='string'&&tax(b)&&validDate(b.date)&&validMoney(b.amount)&&b.amount>0)||new Set(p.bills.map(b=>b.id)).size!==p.bills.length||sum(p.bills,b=>b.amount)!==p.total)throw Error('Μη έγκυρη αναφορά.');
  if(p.nova&&!novaValid(p.nova))throw Error('Μη έγκυρο πάγιο Nova.');
  if((state.appliedImports||[]).includes(p.id)){if(p.nova?.amount&&p.nova.amount!==state.novaReminder?.amount&&confirm('Ενημέρωση μόνο του παγίου Nova σε '+money(p.nova.amount)+';')){state.novaReminder={day:9,amount:p.nova.amount};save();toast('Το πάγιο Nova ενημερώθηκε')}else toast('Η αναφορά έχει ήδη εισαχθεί');return}
  let bills=[...state.bills];const paid=[...(state.paidStatements||[])];
  if(p.replaces&&(state.appliedImports||[]).includes(p.replaces)){
   if(!Array.isArray(p.previousBills)||p.previousBills.length>100||!p.previousBills.every(b=>b&&tax(b)&&typeof b.id==='string'&&validDate(b.date)&&validMoney(b.amount)))throw Error('Μη έγκυρη διόρθωση.');
   const oldIds=new Set(p.previousBills.map(b=>b.id)),oldRows=bills.filter(b=>oldIds.has(b.id));
   if(oldRows.length!==p.previousBills.length||oldRows.some(b=>!p.previousBills.some(x=>x.id===b.id&&x.amount===b.amount&&x.date===b.date))||state.entries.some(e=>oldIds.has(e.billId)))throw Error('Υπάρχουν αλλαγές ή πληρωμές στην προηγούμενη ρύθμιση. Δεν έγινε αυτόματη αντικατάσταση.');
   bills=bills.filter(b=>!oldIds.has(b.id));
  }
  for(const b of p.bills){
   const same=bills.find(x=>x.id===b.id);
   if(same){if(same.amount!==b.amount||same.date!==b.date)throw Error('Υπάρχει διαφορετική δόση. Δεν έγινε εισαγωγή.');continue}
   const overlapping=bills.find(x=>/ααδε|εφορ|φορολογ|ρύθμιση|ρυθμιση/i.test(x.name)&&!p.bills.some(y=>y.id===x.id));
   if(overlapping)throw Error('Υπάρχει ήδη καταχώριση που μοιάζει με ρύθμιση ΑΑΔΕ. Έλεγξέ τη πριν την εισαγωγή για να μη μετρηθεί διπλά.');
   bills.push({id:b.id,name:b.name,date:b.date,amount:b.amount});
  }
  for(const b of p.paid){const i=paid.findIndex(x=>x.id===b.id);if(i>=0){if(paid[i].date!==b.date||paid[i].amount!==b.amount)throw Error('Διαφορετικός εξοφλημένος λογαριασμός.');if(/^Nova\s*·/.test(b.name)&&/πάροχος προς επιβεβαίωση/.test(paid[i].name))paid[i]={...paid[i],name:b.name};}else if(!paid.some(x=>x.date===b.date&&x.amount===b.amount&&x.name===b.name))paid.push({id:b.id,name:b.name,date:b.date,amount:b.amount})}
  let e=null,tipNote='';if(p.tip){try{e=tipPlan(p.tip.date,p.tip.source,p.tip.total);tipNote=e?' · Προσθήκη tips '+money(e.tip):' · Tips ήδη σωστά'}catch(err){tipNote=' · Τα tips δεν άλλαξαν: '+err.message}}
  const next={...state,bills,paidStatements:paid,...(p.nova&&p.nova.day===9?{novaReminder:{...state.novaReminder,day:9,...(p.nova.amount?{amount:p.nova.amount}:{})}}:{}),appliedImports:[...(state.appliedImports||[]),p.id],entries:e?[...state.entries,e]:state.entries};
  if(!valid(next))throw Error('Ασυμβατά δεδομένα.');
  if(!confirm('Ενημέρωση ρύθμισης ΑΑΔΕ: '+money(p.total)+' υπόλοιπο αναφοράς, '+(paid.length-(state.paidStatements||[]).length)+' εξοφλημένων λογαριασμών'+tipNote+'; Δεν αντικαθίστανται ρυθμίσεις, βάρδιες ή προηγούμενες κινήσεις.'))return;
  localStorage.setItem(KEY+'_before_obligations_import',JSON.stringify(state));state=next;save();if(!error)toast('Η αναφορά αποθηκεύτηκε'+tipNote);
 }catch(e){alert(e.message||'Δεν έγινε εισαγωγή.')}
}
$('personalImport').onchange=async()=>{const f=$('personalImport').files[0];if(!f)return;try{if(f.size>100000)throw Error('Μεγάλο αρχείο.');importPersonal(await f.text())}catch(e){alert(e.message)}finally{$('personalImport').value=''}};
$('personalPaste').onclick=()=>importPersonal($('personalText').value.trim());
$('novaSetAmount').onclick=()=>{if(error)return;const raw=prompt('Σταθερό μηνιαίο πάγιο Nova (€)',state.novaReminder?.amount?euro(state.novaReminder.amount):'');if(raw===null)return;if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())||!validMoney(cents(raw))||cents(raw)<=0)return alert('Μη έγκυρο ποσό.');state.novaReminder={day:9,amount:cents(raw)};save();toast('Το πάγιο Nova αποθηκεύτηκε')};
const prevRender=render;render=function(){prevRender();renderObligations()};renderObligations();
})();
