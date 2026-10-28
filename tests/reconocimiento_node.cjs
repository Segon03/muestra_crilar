// Corre el reconocimiento real (OpenCV.js + banco exportado) en Node sobre los cuadros anotados de video_muestra2.mp4.
// Hay que volcar antes los cuadros RGBA a <carpeta>/gt/rgba_NN.bin (ver tools/). Uso: node tests/reconocimiento_node.cjs <carpeta>
global.self=global;
const fs=require('fs');
const cv=require('/home/user/muestra_crilar/vendor/opencv/opencv.js');
const S=process.argv[2];
(async()=>{
 const {Reconocedor,MIN_INLIERS}=await import('/home/user/muestra_crilar/src/vision.js');
 const {cajaACuadrilatero,proyectarCuadrilatero,cuadrilateroValido,planoDe}=await import('/home/user/muestra_crilar/src/geometria.js');
 await new Promise(r=>{ if(cv.Mat) r(); else cv.onRuntimeInitialized=r;});
 const meta=JSON.parse(fs.readFileSync('/home/user/muestra_crilar/datos/banco_akaze.json'));
 const b=fs.readFileSync('/home/user/muestra_crilar/datos/banco_akaze.bin');
 const buf=b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 const planos=meta.planos.map(p=>({ref:p.ref,plano:p.plano,n:p.n,H:p.H,pts:new Float32Array(buf,p.offset,p.n*2),desc:new Uint32Array(buf,p.offset+p.n*8,p.n*16)}));
 const rec=new Reconocedor(cv,{planos});
 const areas=JSON.parse(fs.readFileSync('/home/user/muestra_crilar/referencias/areas.json')).areas;
 const gt=JSON.parse(fs.readFileSync('/home/user/muestra_crilar/tests/gt_video_muestra2.json'));
 const iou=(a,b)=>{const ix=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),iy=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));const i=ix*iy;const u=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i;return u>0?i/u:0;};
 const W=480,Hh=854;
 for(const c of gt.cuadros){
  const raw=fs.readFileSync(`${S}/gt/rgba_${String(c.t).padStart(2,'0')}.bin`);
  const img={data:new Uint8ClampedArray(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length)),width:W,height:Hh};
  rec.ultimo={A:null,B:null};
  const t0=Date.now(); const r=rec.detectar(img); const ms=Date.now()-t0;
  const ious=[];
  for(const a of areas){const R=r[planoDe(a.id)]; const id=a.id.slice(0,2); const g=c.cajas[a.id]; if(!g) continue;
    let v=0; if(R&&R.inliers>=MIN_INLIERS){const q=proyectarCuadrilatero(R.H,cajaACuadrilatero(a.bbox_px)); if(cuadrilateroValido(q,W,Hh)){const xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);const bb=[Math.max(0,Math.min(...xs)),Math.max(0,Math.min(...ys)),Math.min(W,Math.max(...xs)),Math.min(Hh,Math.max(...ys))];v=iou(bb,g);}}
    ious.push(v);}
  console.log(`t=${c.t} pts=${r.n} A=${r.A?r.A.inliers:0} B=${r.B?r.B.inliers:0} iouMedio=${(ious.reduce((a,b)=>a+b,0)/ious.length).toFixed(2)} ${ms}ms`);
 }
 process.exit(0);
})().catch(e=>{console.log('ERR',String(e&&e.stack||e).slice(0,500));process.exit(1)});
setTimeout(()=>{console.log('timeout');process.exit(1)},170000);
