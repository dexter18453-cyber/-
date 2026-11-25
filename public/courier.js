'use strict';
// A separate courier statement: no synthetic cash receipts, no duplicate daily income.
function validCourier(x){return x===undefined||x===null||!!(x&&validDate(x.from)&&validDate(x.asOf)&&x.from<=x.asOf&&x.asOf<=today()&&validMoney(x.wallet)&&validMoney(x.gross)&&validMoney(x.tips)&&Number.isSafeInteger(x.rateBps)&&x.rateBps>=0&&x.rateBps<=10000&&Number.isSafeInteger(x.minutes)&&x.minutes>=0&&x.minutes<=1000000&&Number.isSafeInteger(x.deliveries)&&x.deliveries>=0&&x.deliveries<=1000000&&Array.isArray(x.events)&&x.events.length<=10000&&x.events.every(e=>e&&validDate(e.date)&&e.date<=today()&&['snapshot','payment'].includes(e.type)&&validMoney(e.amount)));}
function courierMath(x){const fee=Math.round(x.gross*x.rateBps/10000),net=x.gross-fee;return {fee,net,combined:x.gross+x.tips,conditional:Math.max(0,x.wallet-net),separate:x.wallet+fee}}
function renderCourier(){
 const d=today(),ins=state.entries.filter(e=>e.kind==='income'),monthTips=sum(ins,e=>tipReceived(e,d)-tipReceived(e,plus(d.slice(0,7)+'-01',-1)));
 $('tipsBalance').textContent=money(monthTips);$('tipsMonth').textContent=money(monthTips);
 const x=state.food,el=$('foodSummary');if(!el)return;
 if(!x||!validCourier(x)){el.innerHTML='<p>Δεν έχει καταχωριστεί ακόμη αναφορά efood.</p>';return}
 const q=courierMath(x);
 el.innerHTML='<p class="fine">Περίοδος '+prettyDate(x.from)+' – '+prettyDate(x.asOf)+'</p><div class="eyebrow">ΟΦΕΙΛΗ WALLET</div><h2 style="font-size:36px;margin:10px 0">'+money(x.wallet)+'</h2><div class="grid">'+[
 ['Μικτές αμοιβές',money(x.gross)],['Προμήθεια στόλου '+(x.rateBps/100)+'%',money(q.fee)],['Καθαρές αμοιβές χωρίς tips',money(q.net)],['Tips efood (αναφορά)',money(x.tips)],['Ώρες αναφοράς',Math.floor(x.minutes/60)+' ώ '+String(x.minutes%60).padStart(2,'0')+' λ'],['Παραδόσεις',x.deliveries],['Υπόλοιπο αν συμψηφιστούν οι καθαρές αμοιβές',money(q.conditional)],['Wallet + προμήθεια αν οφείλονται χωριστά',money(q.separate)]
 ].map(([k,val])=>'<div><small>'+esc(k)+'</small><b>'+esc(val)+'</b></div>').join('')+'</div><p class="fine">Οι δύο εκτιμήσεις είναι εναλλακτικά σενάρια, όχι επιβεβαιωμένες οφειλές. Τα δεδουλευμένα δεν εξοφλούν αυτόματα το Wallet. Τα tips της αναφοράς δεν προστίθενται αυτόματα στον μετρητή, ώστε να μην καταχωριστούν διπλά.</p>';
 $('foodEvents').innerHTML=x.events.slice().reverse().map(e=>'<div class="row"><div><b>'+prettyDate(e.date)+' · '+(e.type==='payment'?'Αποπληρωμή':'Ενημέρωση Wallet')+'</b><b>'+money(e.amount)+'</b></div></div>').join('');
 $('foodPay').disabled=x.wallet===0;
}
function fillCourier(x){const d=today();for(const [id,val] of Object.entries({foodFrom:x?.from||d.slice(0,7)+'-01',foodAsOf:x?.asOf||d,foodWallet:x?euro(x.wallet):'',foodGross:x?euro(x.gross):'',foodTips:x?euro(x.tips):'0',foodRate:x?x.rateBps/100:state.settings.fleetRate,foodHours:x?Math.floor(x.minutes/60):0,foodMinutes:x?x.minutes%60:0,foodDeliveries:x?.deliveries||0}))$(id).value=val}
function courierLink(){
 const m=location.hash.match(/^#food=(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2}),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)$/);if(!m)return;
 const x={from:m[1],asOf:m[2],wallet:Number(m[3]),gross:Number(m[4]),tips:Number(m[5]),rateBps:Number(m[6]),minutes:Number(m[7]),deliveries:Number(m[8]),events:[]};if(!validCourier(x))return;
 fillCourier(x);$('foodEditor').open=true;$('foodImportNote').textContent='Προσωπική αναφορά προς επιβεβαίωση. Έλεγξε ότι είσαι στο σωστό Ταμείο και πάτησε Αποθήκευση. Δεν προστίθενται διπλές κινήσεις.';$('foodCard').scrollIntoView?.({block:'start'});history.replaceState(null,'',location.pathname+location.search);
}
function initCourier(){
 if(!$('foodCard'))return;
 const prevValid=valid;valid=function(x){return prevValid(x)&&validCourier(x?.food)};
 const prevMerge=mergedBackup;mergedBackup=function(local,other,useOtherSettings){const r=prevMerge(local,other,useOtherSettings);if(local.food&&other.food&&JSON.stringify(local.food)!==JSON.stringify(other.food))r.conflicts++;r.next.food=local.food||other.food;return r};
 const prevRender=render;render=function(){prevRender();renderCourier()};
 $('foodEdit').onclick=()=>{fillCourier(state.food);$('foodEditor').open=true};
 $('foodForm').onsubmit=e=>{e.preventDefault();if(error)return;const x={from:$('foodFrom').value,asOf:$('foodAsOf').value,wallet:cents($('foodWallet').value),gross:cents($('foodGross').value),tips:cents($('foodTips').value),rateBps:Math.round(Number($('foodRate').value)*100),minutes:Number($('foodHours').value)*60+Number($('foodMinutes').value),deliveries:Number($('foodDeliveries').value),events:[...(state.food?.events||[])]};
 if(!validCourier(x)){alert('Έλεγξε τα ποσά και την περίοδο.');return}
 if(state.food&&x.asOf<state.food.asOf){alert('Η αναφορά είναι παλαιότερη από την αποθηκευμένη.');return}
 if(state.food&&JSON.stringify({...state.food,events:[]})===JSON.stringify({...x,events:[]})){toast('Η αναφορά υπάρχει ήδη');$('foodEditor').open=false;return}
 if(state.food&&!confirm('Ενημέρωση των συνολικών ποσών της αναφοράς efood; Δεν προστίθενται ως νέες εισπράξεις.'))return;
 x.events.push({type:'snapshot',date:x.asOf,amount:x.wallet});state.food=x;save();$('foodEditor').open=false;$('foodImportNote').textContent='';toast('Η αναφορά efood αποθηκεύτηκε')};
 $('foodPay').onclick=()=>{const x=state.food;if(!x||error)return;const raw=prompt('Ποσό που πλήρωσες πραγματικά στο Wallet (ευρώ).',euro(x.wallet));if(raw===null)return;if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))return alert('Μη έγκυρο ποσό');const amount=cents(raw);if(!validMoney(amount)||amount<=0||amount>x.wallet)return alert('Το ποσό πρέπει να είναι έως την οφειλή.');if(!confirm('Επιβεβαιώνεις ότι το Wallet μειώθηκε κατά '+money(amount)+'; Δεν θα δημιουργηθεί αυτόματα έξοδο από άλλο πορτοφόλι.'))return;state.food={...x,wallet:x.wallet-amount,events:[...x.events,{type:'payment',date:today(),amount}]};save();toast('Καταχωρίστηκε η αποπληρωμή')};
 fillCourier(state.food);renderCourier();courierLink();
}
initCourier();
