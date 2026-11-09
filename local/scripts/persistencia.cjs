const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const report=process.env.REPORT_URL||'http://127.0.0.1:3001';
const audit=process.env.AUDIT_URL||'http://127.0.0.1:3002';
const dir=path.resolve(__dirname,'../resultados'),file=path.join(dir,'persistencia-antes.json');
async function main(){
  const token=await require('./real-tokens.cjs').token('admin');
  async function get(url){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`);return r.json();
  }
  for(const base of [report,audit]){
    for(let i=0;;i++){
      try{const r=await get(base+'/healthz');if(r.ready) break;}catch(e){if(i>=119) throw e;}
      await new Promise(r=>setTimeout(r,500));
    }
  }
  const lead=await get(report+'/api/report/lead-time');
  const sample=lead.pedidos[0]?.pedidoId;
  const snapshot={
    ventas:await get(report+'/api/report/ventas-por-hora'),
    estados:await get(report+'/api/report/estados'),
    productos:await get(report+'/api/report/top-productos'),lead,
    reportUnicos:(await get(report+'/local/metrics')).totalUnicos,
    auditUnicos:(await get(audit+'/local/metrics')).totalUnicos,
    pedidoMuestra:sample || null,
    timeline:sample?await get(audit+'/api/audit/'+encodeURIComponent(sample)):[],
  };
  await fs.mkdir(dir,{recursive:true});
  if(process.argv[2]==='guardar'){
    await fs.writeFile(file,JSON.stringify(snapshot,null,2));
    console.log('Estado guardado. No crear pedidos ni ejecutar cargas; reiniciar report y audit.');
  }else if(process.argv[2]==='comprobar'){
    const before=JSON.parse(await fs.readFile(file,'utf8'));
    assert.deepEqual(snapshot,before,'Las proyecciones cambiaron tras reiniciar');
    const result={estado:'APROBADA',fecha:new Date().toISOString(),
      reportUnicos:snapshot.reportUnicos,auditUnicos:snapshot.auditUnicos,
      pedidosEntregados:lead.pedidos.length,verificado:'KPIs completos, conteos únicos y timeline iguales antes/después'};
    await fs.writeFile(path.join(dir,'persistencia-resultado.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }else throw new Error('Usa guardar o comprobar');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
