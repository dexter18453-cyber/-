'use strict';
// Work shifts are timestamps in the existing encrypted ledger. No background process is needed.
const shiftRows=()=>Array.isArray(state.shifts)?state.shifts:[];
const activeShift=()=>shiftRows().find(s=>s.end===null);
const shiftDate=s=>dateString(new Date(s.start));
const shiftMs=(s,now=Date.now())=>Math.max(0,(s.end===null?now:s.end)-s.start);
function duration(ms,seconds=false){let n=Math.floor(Math.max(0,ms)/1000),h=Math.floor(n/3600),m=Math.floor(n%3600/60);return seconds?[h,m,n%60].map(x=>String(x).padStart(2,'0')).join(':'):h+' ώ '+String(m).padStart(2,'0')+' λ'}
function hoursForDay(src,d,entries){const timed=shiftRows().filter(s=>s.source===src&&shiftDate(s)===d&&s.end!==null);return timed.length?sum(timed,s=>shiftMs(s))/3600000:sum(entries,e=>Number(e.hours||0))}
function trackedHours(src,month,entries){const days=new Set([...entries.map(e=>e.date),...shiftRows().filter(s=>s.source===src&&s.end!==null&&shiftDate(s).startsWith(month)).map(shiftDate)]);return sum([...days],d=>hoursForDay(src,d,entries.filter(e=>e.date===d)))}
function compareHours(src,month,entries){const days=new Set(entries.filter(e=>net(e)!==0).map(e=>e.date));const h=trackedHours(src,month,entries),allDays=new Set([...days,...shiftRows().filter(s=>s.source===src&&s.end!==null&&shiftDate(s).startsWith(month)).map(shiftDate)]);const complete=days.size>0&&[...allDays].every(d=>days.has(d)&&hoursForDay(src,d,entries.filter(e=>e.date===d))>0);return {h,complete}}
function localInput(ms){const d=new Date(ms);return dateString(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function clock(ms){return new Intl.DateTimeFormat('el-GR',{hour:'2-digit',minute:'2-digit'}).format(new Date(ms))}
function overlaps(start,end,exclude){return shiftRows().some(s=>s.id!==exclude&&start<(s.end??Infinity)&&end>s.start)}
function storeShift(next){if(error){alert('Υπάρχει πρόβλημα με την αποθήκευση. Κράτησε πρώτα αντίγραφο.');return false}if(!valid({...state,shifts:next})){alert('Μη έγκυρες ώρες βάρδιας.');return false}state.shifts=next;save();return !error}
function updateShiftClock(){if(!$('shiftClock'))return;const s=activeShift(),d=today(),todayRows=shiftRows().filter(x=>shiftDate(x)===d),ms=sum(todayRows,x=>shiftMs(x));$('shiftClock').textContent=duration(s?shiftMs(s):0,true);$('shiftLive').textContent=s?'Σε εργασία · '+s.source+' · έναρξη '+prettyDate(shiftDate(s))+' '+clock(s.start):(todayRows.some(x=>x.end!==null)?'Η σημερινή βάρδια ολοκληρώθηκε · αναμονή επόμενης έναρξης':'Σε αναμονή έναρξης εργασίας');$('shiftStart').hidden=!!s;$('shiftEnd').hidden=!s;$('shiftSource').disabled=!!s;$('shiftFix').hidden=!s;$('shiftToday').textContent='Σήμερα: '+duration(ms)+' · '+todayRows.length+' βάρδιες';}
function dayTips(src,d){return state.entries.filter(e=>e.kind==='income'&&e.source===src&&e.date===d)}
function dayTipAmount(src,d){return sum(dayTips(src,d),tipNet)}
function askDayTips(src,d){
 const existing=dayTipAmount(src,d),raw=prompt('Συνολικά tips ημέρας '+prettyDate(d)+' · '+src+' (ευρώ). Ήδη καταχωρισμένα: '+money(existing)+'. Γράψε το συνολικό ποσό, όχι επιπλέον tips.',euro(existing));
 if(raw===null)return;
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())){alert('Γράψε έγκυρο ποσό, π.χ. 15 ή 15,50.');return}
 const total=cents(raw),delta=total-existing;if(!validMoney(total)){alert('Μη έγκυρο ποσό');return}
 if(delta<0){alert('Το ποσό είναι μικρότερο από τα ήδη καταχωρισμένα tips. Διόρθωσε τις προηγούμενες κινήσεις στο Ιστορικό.');return}
 if(delta===0){toast('Τα tips της ημέρας έχουν ήδη καταχωριστεί');return}
 if(error)return;
 const e={id:uid(),kind:'income',source:src,date:d,amount:0,tip:delta,deduction:0,hours:0,status:'paid',paidDate:d,note:'Tips ημέρας'};
 const next={...state,entries:[...state.entries,e]};if(!valid(next)){alert('Δεν έγινε καταχώριση tips.');return}
 state.entries.push(e);save();if(!error)toast('Προστέθηκαν '+money(delta)+' στο πορτοφόλι tips');
}
function renderDayReports(m){
 const el=$('dayReports');if(!el)return;
 const pairs=new Map();for(const s of shiftRows())if(s.end!==null&&shiftDate(s).startsWith(m))pairs.set(shiftDate(s)+'|'+s.source,[shiftDate(s),s.source]);
 for(const e of state.entries)if(e.kind==='income'&&e.date.startsWith(m)&&(e.amount>0||e.tip>0))pairs.set(e.date+'|'+e.source,[e.date,e.source]);
 el.innerHTML=[...pairs.values()].sort((a,b)=>b[0].localeCompare(a[0])||a[1].localeCompare(b[1])).map(([d,src])=>{const es=dayTips(src,d),rows=shiftRows().filter(s=>s.source===src&&shiftDate(s)===d&&s.end!==null),ms=rows.length?sum(rows,s=>shiftMs(s)):sum(es,e=>Number(e.hours||0))*3600000,weekday=new Intl.DateTimeFormat('el-GR',{weekday:'long'}).format(new Date(d+'T12:00:00'));return '<div class="row"><div><b>'+weekday+' '+prettyDate(d)+'</b><b>'+esc(src)+'</b></div><small>Ώρες: '+(ms>0?duration(ms):'Δεν καταγράφηκαν')+'</small><small>Μεροκάματο / αμοιβή: '+money(sum(es,wageNet))+' · Tips: '+money(sum(es,tipNet))+'</small><button data-day-tips="'+d+'" data-tip-source="'+esc(src)+'">Καταχώριση tips ημέρας</button></div>'}).join('')||'<p>Δεν υπάρχουν ημερήσιες καταγραφές.</p>';
}
function renderShifts(){if(!$('shiftClock'))return;updateShiftClock();const m=$('shiftMonth').value||today().slice(0,7),rows=shiftRows().filter(s=>shiftDate(s).startsWith(m)).sort((a,b)=>b.start-a.start),done=rows.filter(s=>s.end!==null);$('shiftTotals').textContent=duration(sum(done,s=>shiftMs(s)))+' · '+new Set(done.map(shiftDate)).size+' ημέρες εργασίας';$('shiftHistory').innerHTML=rows.map(s=>'<div class="row"><div><b>'+esc(s.source)+' · '+prettyDate(shiftDate(s))+'</b><b>'+duration(shiftMs(s))+'</b></div><small>'+clock(s.start)+' – '+(s.end===null?'Σε εξέλιξη':(shiftDate(s)!==dateString(new Date(s.end))?prettyDate(dateString(new Date(s.end)))+' ':'')+clock(s.end))+'</small>'+(s.end!==null?'<button data-shift-edit="'+esc(s.id)+'">Διόρθωση ωρών</button><button class="danger" data-shift-delete="'+esc(s.id)+'">Διαγραφή βάρδιας</button>':'')+'</div>').join('')||'<p>Δεν υπάρχουν βάρδιες αυτόν τον μήνα.</p>';renderDayReports(m)}
function finishShift(s,end,start=s.start){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end>Date.now()+1000||end-start>86400000||overlaps(start,end,s.id)){alert('Έλεγξε τις ώρες: η λήξη πρέπει να είναι μετά την έναρξη, έως 24 ώρες, χωρίς επικάλυψη άλλης βάρδιας.');return false}
 const next={...s,start,end},d=shiftDate(next),rows=shiftRows().map(x=>x.id===s.id?next:x);
 if(error||!valid({...state,shifts:rows})){alert('Δεν αποθηκεύτηκε η βάρδια.');return false}
 state.shifts=rows;
 // A completed scheduled Plasio shift confirms work, never cash receipt; no duplicate wage.
 if(s.end===null&&next.source==='Πλαίσιο'&&scheduled(d)&&rate(d)>0&&!workEntry(d))state.entries.push(workRecord(d));
 save();if(!error){toast('Καταχωρίστηκε η βάρδια · '+duration(end-start));if(s.end===null)askDayTips(next.source,d);return true}return false
}
function shiftInit(){
 if(!$('shiftClock'))return;$('shiftSource').innerHTML=sources.map(s=>'<option>'+esc(s)+'</option>').join('');$('shiftMonth').value=today().slice(0,7);$('shiftMonth').onchange=renderShifts;
 $('shiftStart').onclick=()=>{if(activeShift())return;const start=Date.now();if(overlaps(start,Infinity,null)){alert('Υπάρχει άλλη βάρδια.');return}if(storeShift([...shiftRows(),{id:uid(),source:$('shiftSource').value,start,end:null}]))toast('Η έναρξη καταγράφηκε')};
 $('shiftEnd').onclick=()=>{const s=activeShift();if(!s)return;const end=Date.now();if(end-s.start>86400000){openShiftEditor(s);alert('Η βάρδια ξεπερνά τις 24 ώρες. Δήλωσε την πραγματική ώρα λήξης.');return}finishShift(s,end)};
 function openShiftEditor(s){$('shiftEditId').value=s.id;$('shiftEditStart').value=localInput(s.start);$('shiftEditEnd').value=localInput(s.end??Date.now());$('shiftEditor').hidden=false;$('shiftEditor').scrollIntoView({block:'nearest'})}
 $('shiftFix').onclick=()=>{const s=activeShift();if(s)openShiftEditor(s)};
 $('shiftCancel').onclick=()=>$('shiftEditor').hidden=true;
 $('shiftEditForm').onsubmit=e=>{e.preventDefault();const s=shiftRows().find(x=>x.id===$('shiftEditId').value);if(!s)return;if(finishShift(s,new Date($('shiftEditEnd').value).getTime(),new Date($('shiftEditStart').value).getTime()))$('shiftEditor').hidden=true};
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.dayTips&&sources.includes(b.dataset.tipSource)&&validDate(b.dataset.dayTips)&&b.dataset.dayTips<=today()){askDayTips(b.dataset.tipSource,b.dataset.dayTips);return}const id=b.dataset.shiftEdit||b.dataset.shiftDelete;if(!id)return;const s=shiftRows().find(x=>x.id===id);if(!s||s.end===null)return;if(b.dataset.shiftEdit)openShiftEditor(s);else if(confirm('Διαγραφή της καταγραφής ωρών; Το μεροκάματο και οι εισπράξεις δεν αλλάζουν.'))storeShift(shiftRows().filter(x=>x.id!==id))});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();renderShifts()}});
 setInterval(updateShiftClock,1000);render();renderShifts();
}
window.renderShifts=renderShifts;
shiftInit();
