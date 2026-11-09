// Inventario calculado; compara las fuentes adjuntas con la carpeta integrada.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),outer=path.dirname(root);
const originals=path.join(outer,'originales');
const excluded=new Set(['node_modules','.git','.DS_Store','__MACOSX','dist']);
function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(excluded.has(entry.name)||entry.name==='.env'||
      (entry.name.startsWith('.env.')&&entry.name!=='.env.example')) return [];
    const full=path.join(dir,entry.name);
    if(entry.isSymbolicLink()) throw new Error('No se inventarían symlinks: '+full);
    return entry.isDirectory()?files(full):[full];
  });
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rows=[['origen','archivo','estado','sha256_original','sha256_integrado']];
const known=new Set(),counts={conservados:0,modificados:0,faltantes:0,agregados:0};
for(const [name,target] of [['pedidos360-frontend-main-2',''],['kafka','kafka'],['zookeeper','zookeeper']]){
  const base=path.join(originals,name);
  for(const original of files(base)){
    const relative=path.join(target,path.relative(base,original)).split(path.sep).join('/');
    const final=path.join(root,relative),before=hash(original);
    const after=fs.existsSync(final)?hash(final):'';
    const status=!after?'FALTANTE':before===after?'CONSERVADO':'MODIFICADO';
    counts[status==='FALTANTE'?'faltantes':status==='CONSERVADO'?'conservados':'modificados']++;
    known.add(relative);rows.push([name,relative,status,before,after]);
  }
}
for(const file of files(root)){
  const relative=path.relative(root,file).split(path.sep).join('/');
  if(known.has(relative)||relative.startsWith('local/resultados/')&&
    !relative.endsWith('.gitkeep')) continue;
  counts.agregados++;rows.push(['integracion',relative,'AGREGADO','',hash(file)]);
}
const csv=rows.map(row=>row.map(x=>`"${x.replaceAll('"','""')}"`).join(',')).join('\n')+'\n';
fs.writeFileSync(path.join(outer,'MANIFIESTO-CAMBIOS.csv'),csv);
fs.writeFileSync(path.join(outer,'RESUMEN-INVENTARIO.json'),JSON.stringify(counts,null,2)+'\n');
console.log(JSON.stringify(counts));
if(counts.faltantes) process.exitCode=1;
