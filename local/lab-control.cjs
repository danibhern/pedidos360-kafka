// Auxiliar operativo SOLO local. Nunca devuelve tokens ni reemplaza Entra ID.
const {spawn}=require('node:child_process');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const path=require('node:path');
const vault=new Map(), jobs=new Map();
function remember(token,claims) {
  if(process.env.ENABLE_LOCAL_LAB!=='true') return;
  for(const role of claims.roles) vault.set(role,{token,claims});
}
function mount(app) {
  if(process.env.ENABLE_LOCAL_LAB!=='true') return;
  const secret=process.env.LAB_CONTROL_SECRET;
  if(!secret || secret.length<32) throw new Error('Falta clave de control local');
  app.use('/local/lab',(req,res,next)=>{
    const actual=Buffer.from(String(req.headers['x-lab-control']||''));
    const expected=Buffer.from(secret);
    if(req.headers.origin || actual.length!==expected.length ||
      !timingSafeEqual(actual,expected)) return res.status(403).json({message:'Control local denegado'});
    next();
  });
  app.get('/local/lab/status',(req,res)=>res.json({
    modo:'Entra ID real; sesiones solo en memoria',
    sesiones:[...vault].map(([role,x])=>({
      role,usuario:x.claims.preferred_username||x.claims.oid,
      vence:new Date(x.claims.exp*1000).toISOString(),
      vigente:x.claims.exp*1000>Date.now()+60000,
    })),
  }));
  app.post('/local/lab/forget',(req,res)=>{
    vault.clear();res.json({message:'Sesiones auxiliares olvidadas; vuelve a iniciar sesión para otras pruebas'});
  });
  app.get('/local/lab/jobs',(req,res)=>res.json([...jobs.values()].map(j=>({
    id:j.id,action:j.action,estado:j.estado,inicio:j.inicio,
  }))));
  app.post('/local/lab/run',(req,res)=>{
    const {action,args=[]}=req.body||{};
    const allowed={carga:'carga.cjs',e2e:'e2e.cjs',persistencia:'persistencia.cjs'};
    if(!allowed[action] || !Array.isArray(args) ||
      args.some(x=>typeof x!=='string') ||
      (action==='e2e' && args.length) ||
      (action==='persistencia' && !(args.length===1 && ['guardar','comprobar'].includes(args[0]))) ||
      (action==='carga' && (args.length%2 ||
        args.some((x,i)=>i%2 ?
          (args[i-1]==='--ruta'?!['sns','kafka'].includes(x):!/^\d+$/.test(x)) :
          !['--mensajes','--lote','--timeout','--duplicados','--ruta'].includes(x)))))
      return res.status(400).json({message:'Acción/argumentos no permitidos'});
    if([...jobs.values()].some(j=>j.estado==='EN_CURSO'))
      return res.status(409).json({message:'Ya hay una prueba en curso'});
    const required=action==='e2e'?['cliente','operador','admin']:['admin'];
    const tokens={};
    for(const role of required) {
      const x=vault.get(role);
      if(!x || x.claims.exp*1000<Date.now()+60000) return res.status(409).json({
        message:`Inicia sesión real como ${role} y abre Dashboard. Se necesita token vigente.`});
      tokens[role]=x.token;
    }
    const id=randomUUID(), job={id,action,estado:'EN_CURSO',log:'',logStart:0,
      inicio:new Date().toISOString(),code:null};
    jobs.set(id,job);
    if(jobs.size>20) jobs.delete(jobs.keys().next().value);
    const child=spawn(process.execPath,[path.join(__dirname,'scripts',allowed[action]),...args],{
      cwd:path.resolve(__dirname,'..'),stdio:['pipe','pipe','pipe'],env:process.env,
    });
    const add=chunk=>{
      const all=job.log+chunk.toString(),drop=Math.max(0,all.length-48000);
      job.logStart+=drop;job.log=all.slice(drop);
    };
    child.stdout.on('data',add);child.stderr.on('data',add);
    const requested=Number(args[args.indexOf('--timeout')+1]);
    const timer=setTimeout(()=>child.kill('SIGTERM'),
      Math.min(3600000,(Number.isFinite(requested)&&requested>0?requested:1200)*1000+600000));
    timer.unref();
    child.once('error',e=>{add(e.message);job.estado='FALLIDA';job.code=1;clearTimeout(timer);});
    child.once('close',code=>{
      clearTimeout(timer);job.code=code??1;job.estado=code===0?'APROBADA':'FALLIDA';
    });
    // Tokens reales por pipe privado, no argumentos, logs, archivos ni variables de entorno.
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(tokens));
    res.status(202).json({id});
  });
  app.get('/local/lab/jobs/:id',(req,res)=>{
    const job=jobs.get(req.params.id);
    if(!job) return res.status(404).json({message:'Prueba inexistente'});
    res.json(job);
  });
}
module.exports={remember,mount};
