const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

test('El asistente conserva el .env, completa cuatro scopes y respeta versión 1', {timeout:15000}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'p360-config-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'local/scripts'),{recursive:true});
  await fs.copyFile(path.join(__dirname,'../scripts/configurar.cjs'),
    path.join(root,'local/scripts/configurar.cjs'));
  await fs.copyFile(path.join(__dirname,'../scopes.cjs'),path.join(root,'local/scopes.cjs'));
  const tenant='11111111-1111-4111-8111-111111111111';
  const client='22222222-2222-4222-8222-222222222222';
  const api='33333333-3333-4333-8333-333333333333';
  const original=`VITE_AZURE_TENANT_ID=${tenant}\nVITE_AZURE_CLIENT_ID=${client}\n`+
    `VITE_API_SCOPE=api://${api}/orders.read\n`;
  await fs.writeFile(path.join(root,'.env'),original);
  const child=spawn(process.execPath,[path.join(root,'local/scripts/configurar.cjs')],
    {cwd:root,stdio:['pipe','pipe','pipe']});
  t.after(()=>child.kill());
  const labels=['ID de directorio (tenant)','ID de aplicación FRONTEND',
    'ID de aplicación API','Scopes completos de API','Version del access token API'];
  const answers=['\n','\n','\n','\n','1\n'];
  let output='',error='',stage=0;
  child.stdout.on('data',chunk=>{
    output+=chunk;
    if(stage<labels.length&&output.includes(labels[stage])&&output.endsWith(': ')){
      child.stdin.write(answers[stage++]);
    }
  });
  child.stderr.on('data',chunk=>{error+=chunk;});
  const code=await new Promise((resolve,reject)=>{
    child.on('error',reject);child.on('close',resolve);
  });
  assert.equal(code,0,error||output);
  assert.equal(stage,5);
  const generated=await fs.readFile(path.join(root,'local/.env'),'utf8');
  assert.match(generated,/ENTRA_TOKEN_VERSION=1/);
  for(const name of ['orders.read','orders.write','catalog.read','catalog.write'])
    assert.ok(generated.includes(`api://${api}/${name}`));
  assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),original);
});
