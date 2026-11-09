// Asistente Mac/Windows. Lee solo identificadores públicos del .env existente.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {createInterface}=require('node:readline/promises');
const {parseApiScopes}=require('../scopes.cjs');
const root=path.resolve(__dirname,'../..'), target=path.join(root,'local/.env');
function readEnv(file){
  if(!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>
    /^[A-Z_]+=/.test(x)).map(x=>{
      const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim().replace(/^["']|["']$/g,'')];
    }));
}
async function main(){
  const original=readEnv(path.join(root,'.env')), current=readEnv(target);
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  async function ask(label,fallback,valid){
    for(;;){
      const answer=(await terminal.question(`${label}${fallback?' ['+fallback+']':''}: `)).trim() || fallback;
      if(valid(answer||'')) return answer;
      console.log('Valor inválido. Copia el identificador/permiso del registro existente, sin comillas.');
    }
  }
  try {
    const tenant=await ask('ID de directorio (tenant)',current.ENTRA_TENANT_ID||original.VITE_AZURE_TENANT_ID,guid.test.bind(guid));
    const client=await ask('ID de aplicación FRONTEND',current.ENTRA_CLIENT_ID||original.VITE_AZURE_CLIENT_ID,guid.test.bind(guid));
    const api=await ask('ID de aplicación API',current.ENTRA_API_CLIENT_ID||
      original.VITE_API_SCOPE?.match(/api:\/\/([^/]+)/)?.[1],guid.test.bind(guid));
    const required=['orders.read','orders.write','catalog.read','catalog.write'];
    const validScopes=x=>{
      try {return required.every(name=>parseApiScopes(x,api).names.includes(name));}
      catch {return false;}
    };
    const proposed=current.ENTRA_SCOPE||original.VITE_API_SCOPE;
    const fallback=validScopes(proposed)?proposed:
      required.map(name=>`api://${api}/${name}`).join(' ');
    const rawScopes=await ask('Scopes completos de API (los cuatro; separados por espacios)',
      fallback,validScopes);
    const scope=parseApiScopes(rawScopes,api).values.join(' ');
    const version=await ask('Version del access token API (manifest: null/1 => 1, 2 => 2)',
      current.ENTRA_TOKEN_VERSION||'2',x=>['1','2'].includes(x));
    const lines=[
      '# Solo laboratorio local. No subir este archivo a GitHub.',
      `ENTRA_TENANT_ID=${tenant.toLowerCase()}`,`ENTRA_CLIENT_ID=${client.toLowerCase()}`,
      `ENTRA_API_CLIENT_ID=${api.toLowerCase()}`,`ENTRA_SCOPE=${scope}`,
      `ENTRA_TOKEN_VERSION=${version}`,
      `LAB_CONTROL_SECRET=${current.LAB_CONTROL_SECRET||randomBytes(32).toString('hex')}`,
    ];
    fs.writeFileSync(target,lines.join('\n')+'\n',{mode:0o600});
    console.log('Listo: local/.env. No se modificó el .env original ni los registros de Entra ID.');
    console.log('Abre http://localhost:5173 (no 127.0.0.1) después de levantar Docker.');
  } finally {terminal.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
