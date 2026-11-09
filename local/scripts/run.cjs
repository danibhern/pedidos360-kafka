// Docker exec ejecuta este cliente; no maneja tokens de usuarios.
const base='http://127.0.0.1:3100';
const headers={'Content-Type':'application/json','x-lab-control':process.env.LAB_CONTROL_SECRET||''};
async function get(route,options={}) {
  const r=await fetch(base+route,{headers,...options,signal:AbortSignal.timeout(10000)});
  const out=await r.json();
  if(!r.ok) throw new Error(out.message||`HTTP ${r.status}`);
  return out;
}
async function main(){
  const [action,...args]=process.argv.slice(2);
  if(action==='sesiones'){console.log(JSON.stringify(await get('/local/lab/status'),null,2));return;}
  if(action==='olvidar-sesiones'){
    console.log(await get('/local/lab/forget',{method:'POST',body:'{}'}));return;
  }
  let id;
  if(action==='flujo'){
    const jobs=await get('/local/lab/jobs');
    id=args[0]||jobs.find(j=>j.estado==='EN_CURSO')?.id||jobs.at(-1)?.id;
    if(!id) throw new Error('Todavía no hay pruebas. Inicia lab.cjs carga en otra terminal.');
  }else{
    ({id}=await get('/local/lab/run',{method:'POST',body:JSON.stringify({action,args})}));
  }
  console.log(`Prueba ${id}; observar desde otra terminal: node local/scripts/lab.cjs flujo ${id}`);
  let printed=0;
  for(;;){
    const job=await get('/local/lab/jobs/'+id);
    const start=job.logStart||0;
    if(printed<start) console.log('[Monitor: el inicio del log ya rotó; consulta también el archivo de flujo JSONL.]');
    const extra=job.log.slice(Math.max(0,printed-start));if(extra) process.stdout.write(extra);
    printed=start+job.log.length;
    if(job.estado!=='EN_CURSO'){process.exitCode=job.code;return;}
    await new Promise(r=>setTimeout(r,1000));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
