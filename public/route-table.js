'use strict';
// Local table OCR: keep only delivery fields. All coordinates are in image pixels.
function routeTableWords(words,expected){
 const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[|¦]/g,'').trim();
 const box=(words||[]).filter(w=>w&&w.bbox&&Number.isFinite(w.bbox.x0)&&Number.isFinite(w.bbox.y0)&&w.text?.trim()).map(w=>({t:w.text.trim(),n:norm(w.text),x:(w.bbox.x0+w.bbox.x1)/2,y:(w.bbox.y0+w.bbox.y1)/2,x0:w.bbox.x0,x1:w.bbox.x1,h:w.bbox.y1-w.bbox.y0})).filter(w=>w.n&&w.h>0);
 const median=a=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||1};
 const H=median(box.map(w=>w.h)),rows=[];
 const timeValue=s=>{const m=s.match(/^([01]?\d|2[0-3])[:.][0-5]\d$/);return m?s.replace('.',':').padStart(5,'0'):''};
 const addr=box.filter(w=>/ΔΙΕΥΘ|ΔΙΕΥ0|ΔΙΕΥ8/.test(w.n));
 const areas=box.filter(w=>/ΠΕΡΙΟΧ|ΠΕΡΙ0Χ/.test(w.n));
 const pairs=[];
 for(const a of addr)for(const b of areas)if(b.x>a.x&&Math.abs(a.y-b.y)<H*4)pairs.push([a,b]);
 if(!pairs.length)return [];
 const [a,b]=pairs.sort((p,q)=>Math.abs(p[0].y-p[1].y)-Math.abs(q[0].y-q[1].y))[0],headerY=(a.y+b.y)/2;
 const timeHead=box.filter(w=>w.x>b.x&&Math.abs(w.y-headerY)<H*5&&/ΩΡΑ|ΠΑΡΑΔΟΣ/.test(w.n)).sort((a,b)=>a.x-b.x)[0];
 const parcelHead=box.filter(w=>w.x>b.x&&Math.abs(w.y-headerY)<H*5&&/ΔΕΜΑΤ|ΑΡΙΘΜ/.test(w.n)).sort((a,b)=>b.x-a.x)[0];
 if(!timeHead)return [];
 const xmin=a.x-(b.x-a.x)*.7,xmax=(b.x+timeHead.x)/2,right=timeHead.x+(timeHead.x-b.x)*.5;
 const slope=Math.max(-.22,Math.min(.22,(b.y-a.y)/(b.x-a.x))),Y=w=>w.y-slope*(w.x-timeHead.x);
 const tol=H*.95;
 const times=box.filter(w=>w.y>headerY+H&&w.x>xmax&&w.x<right&&timeValue(w.n)).sort((a,b)=>Y(a)-Y(b));
 const anchors=times.filter((w,i)=>i===0||Math.abs(Y(w)-Y(times[i-1]))>tol);
 const noWords=box.filter(w=>w.x<xmin&&/^\d{1,3}$/.test(w.n)&&Number(w.n)>=1&&Number(w.n)<=expected&&w.y>headerY);
 const numberX=noWords.length?Math.min(...noWords.map(w=>w.x)):0;
 for(const t of anchors){
  const y=Y(t),near=box.filter(w=>Math.abs(Y(w)-y)<=tol).sort((a,b)=>a.x-b.x);
  const n=noWords.filter(w=>Math.abs(Y(w)-y)<=tol&&Math.abs(w.x-numberX)<H*3).sort((a,b)=>a.x-b.x)[0];if(!n)continue;
  // Prefer the printed postal-code cell for the left edge of the address.
  const postal=near.filter(w=>w.x<a.x&&w.x>xmin-H*7&&/^\d{5}$/.test(w.n)).sort((p,q)=>q.x-p.x)[0];
  const left=postal?postal.x1:xmin;
  const cells=near.filter(w=>w.x>left&&w.x<xmax&&w.x>n.x);
  // Split at the last house number before the municipality. Preserve numbered street names.
  const split=cells.map((w,i)=>({w,i})).filter(({w,i})=>i>0&&i<cells.length-1&&/\d{1,4}[Α-ΩA-Zα-ωa-z]?$/.test(w.n)&&w.x<(a.x+b.x)/2+H*3&&cells.slice(i+1).every(z=>/^[\p{L}.'-]+$/u.test(z.n))).pop();
  if(!split)continue;
  const address=cells.slice(0,split.i+1).map(w=>w.t).join(' ').trim(),area=cells.slice(split.i+1).map(w=>w.t).join(' ').trim();
  const parcel=near.filter(w=>w.x>right&&(!parcelHead||w.x>parcelHead.x-H*3)&&/^\d{1,3}$/.test(w.n)).sort((a,b)=>b.x-a.x)[0];
  if(!address||!area||!parcel)continue;
  rows.push([Number(n.n),address,area,timeValue(t.n),Number(parcel.n)]);
 }
 return rows;
}
// Make grid strokes less likely to be interpreted as letters. Operates only on a canvas copy.
function routeRemoveGrid(canvas){
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,im=ctx.getImageData(0,0,w,h),p=im.data;
 const out=document.createElement('canvas');out.width=w;out.height=h;const oc=out.getContext('2d');oc.putImageData(im,0,0);
 const dark=(x,y)=>p[(y*w+x)*4]<100;
 const stroke=(horizontal)=>{
  const major=horizontal?w:h,minor=horizontal?h:w,min=Math.round(major*(horizontal?.21:.25));
  oc.fillStyle='#ffffff';
  for(let j=0;j<minor;j++){let begin=-1,last=-1;for(let i=0;i<=major;i++){const on=i<major&&(horizontal?dark(i,j):dark(j,i));if(on){if(begin<0)begin=i;last=i;}if(begin>=0&&(!on&&i-last>2||i===major)){if(last-begin+1>=min){if(horizontal)oc.fillRect(begin,j,last-begin+1,1);else oc.fillRect(j,begin,1,last-begin+1);}begin=-1;last=-1;}}}
 };
 stroke(true);stroke(false);return out;
}
