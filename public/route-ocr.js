'use strict';
// OCR runs in a sandboxed frame. Only the selected photo is passed to it.
(()=>{
const send=(type,data={})=>parent.postMessage({routeOCR:true,type,...data},'*');
let running=false;
addEventListener('message',async e=>{
 if(e.source!==parent||!e.data?.routeOCR||e.data.type!=='read'||running)return;
 if(!(e.data.file instanceof Blob)||e.data.file.size>18000000)return send('error',{message:'Μη έγκυρη φωτογραφία.'});
 running=true;let worker;
 try{
  if(!window.Tesseract)throw Error('Η βιβλιοθήκη OCR δεν φορτώθηκε.');
  worker=await Tesseract.createWorker('ell+eng',1,{
   workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
   corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
   langPath:'https://tessdata.projectnaptha.com/4.0.0',
   cacheMethod:'none',
   logger:m=>send('progress',{message:m.status,progress:m.progress})
  });
  const result=await worker.recognize(e.data.file);send('result',{text:result.data.text});
 }catch(e){send('error',{message:'Η αυτόματη ανάγνωση δεν ολοκληρώθηκε. Χρησιμοποίησε Αντιγραφή κειμένου από Φωτογραφίες ή χειροκίνητη εισαγωγή.'})}
 finally{if(worker)await worker.terminate().catch(()=>{});running=false}
});
send('ready');
})();
