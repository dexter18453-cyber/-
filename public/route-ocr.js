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
  // Normalize the image, then run layout-aware OCR and a second pass without long grid strokes.
  const expected=Math.max(1,Math.min(500,Number(e.data.expected)||100));
  let input=e.data.file,canvas=null,sharp=null;
  try{
   const img=await createImageBitmap(input),original=document.createElement('canvas'),shrink=Math.min(1,2400/Math.max(img.width,img.height));original.width=Math.round(img.width*shrink);original.height=Math.round(img.height*shrink);original.getContext('2d').drawImage(img,0,0,original.width,original.height);img.close();
   const crop=routeCropPaper(original),scale=Math.min(3,Math.max(1,2800/crop.width),3400/Math.max(crop.width,crop.height)),c=document.createElement('canvas');c.width=Math.round(crop.width*scale);c.height=Math.round(crop.height*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(crop,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){const g=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2],v=Math.max(0,Math.min(255,(g-155)*1.55+150));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}ctx.putImageData(pixels,0,0);canvas=c;sharp=routeSharpen(c);input=c;
  }catch{}
  const passes=[];
  const modes=[[input,'6'],[sharp?routeRemoveGrid(sharp):input,'11'],[sharp||input,'3']];
  for(let i=0;i<modes.length;i++){
   const [image,mode]=modes[i];send('stage',{stage:i+1,total:modes.length});
   try{await worker.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:'1'});const result=await worker.recognize(image);const words=result.data.words||[];passes.push({text:result.data.text,rows:routeTableWords(words,expected),confidence:Number(result.data.confidence)||0,wordCount:words.length});}catch(err){if(!passes.length&&i===modes.length-1)throw err}
  }
  send('result',{passes});

 }catch(e){send('error',{message:'Η αυτόματη ανάγνωση δεν ολοκληρώθηκε. Χρησιμοποίησε Αντιγραφή κειμένου από Φωτογραφίες ή χειροκίνητη εισαγωγή.'})}
 finally{if(worker)await worker.terminate().catch(()=>{});running=false}
});
send('ready');
})();
