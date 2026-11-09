// RSA efímera solo en pruebas unitarias; nunca configura el servidor real.
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {createAuth}=require('../auth.cjs');
const tenant='11111111-1111-1111-1111-111111111111';
const audience='33333333-3333-3333-3333-333333333333';
const issuer=`https://login.microsoftonline.com/${tenant}/v2.0`;
let jose,privateKey,publicKey,auth;
before(async()=>{
  jose=await import('jose');
  ({privateKey,publicKey}=await jose.generateKeyPair('RS256'));
  auth=createAuth({tenant,audience,scope:'orders.read',keySet:publicKey});
});
async function sign(overrides={},key=privateKey,alg='RS256'){
  return new jose.SignJWT({
    sub:'usuario-prueba',oid:'oid-prueba',tid:tenant,ver:'2.0',
    scp:'orders.read',roles:['Cliente'],iss:issuer,aud:audience,
    iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,...overrides,
  }).setProtectedHeader({alg}).sign(key);
}
test('RSA válida y normalización de los tres roles',async()=>{
  for(const [raw,normal] of [['Client','cliente'],['Operator','operador'],['Admin','admin']])
    assert.deepEqual((await auth.verify(await sign({roles:[raw]}))).roles,[normal]);
});
test('v1 conserva issuer y audience propios, sin aceptar un token v2',async()=>{
  const v1=createAuth({tenant,audience,scope:'orders.read',tokenVersion:'1',keySet:publicKey});
  const token=await sign({ver:'1.0',iss:`https://sts.windows.net/${tenant}/`,aud:`api://${audience}`});
  assert.deepEqual((await v1.verify(token)).roles,['cliente']);
  await assert.rejects(v1.verify(await sign()));
});
test('Cambiar rol invalida la firma',async()=>{
  const parts=(await sign()).split('.');
  const p=JSON.parse(Buffer.from(parts[1],'base64url'));p.roles=['Admin'];
  parts[1]=Buffer.from(JSON.stringify(p)).toString('base64url');
  await assert.rejects(auth.verify(parts.join('.')));
});
test('Rechaza otra firma RSA, HS256 y JWT corrupto',async()=>{
  const other=await jose.generateKeyPair('RS256');
  await assert.rejects(auth.verify(await sign({},other.privateKey)));
  await assert.rejects(auth.verify(await sign({},new Uint8Array(32),'HS256')));
  await assert.rejects(auth.verify('malformado'));
});
test('Rechaza expiración, audiencia, emisor, tenant y versión incorrectos',async()=>{
  for(const fields of [{exp:1},{aud:'otra-api'},{iss:'https://otro.invalid'},
    {tid:'otro-tenant'},{ver:'1.0'}])
    await assert.rejects(auth.verify(await sign(fields)));
});
test('Rechaza falta de scope, roles vacíos y rol inventado con 403',async()=>{
  for(const fields of [{scp:'User.Read'},{roles:[]},{roles:['root']}])
    await assert.rejects(auth.verify(await sign(fields)),{status:403});
});
test('Guard distingue 401/403 y solo entrega claims validados',async()=>{
  const call=async(token,roles)=>{
    let status=200,next=false;
    const req={headers:{authorization:token?`Bearer ${token}`:undefined}};
    const res={status(code){status=code;return this;},json(){return this;}};
    await auth.guard(roles)(req,res,()=>{next=true;});
    return {status,next,claims:req.claims};
  };
  assert.equal((await call()).status,401);
  assert.equal((await call(await sign(),['admin'])).status,403);
  const success=await call(await sign({roles:['Admin']}),['admin']);
  assert.equal(success.next,true);assert.deepEqual(success.claims.roles,['admin']);
});
test('La lista de cuatro scopes acepta tokens delegados de lectura o escritura',async()=>{
  const multi=createAuth({tenant,audience,keySet:publicKey,
    scope:'orders.read orders.write catalog.read catalog.write'});
  for(const scp of ['orders.read','orders.write','catalog.read','catalog.write',
    'orders.read orders.write catalog.read catalog.write'])
    assert.deepEqual((await multi.verify(await sign({scp}))).roles,['cliente']);
  await assert.rejects(multi.verify(await sign({scp:'User.Read'})),{status:403});
});
test('Un scope de lectura no autoriza escritura aunque el rol sea Admin',async()=>{
  const multi=createAuth({tenant,audience,keySet:publicKey,
    scope:'orders.read orders.write catalog.read catalog.write'});
  async function call(scp,required){
    let status=200,next=false;
    const req={headers:{authorization:`Bearer ${await sign({scp,roles:['Admin']})}`}};
    const res={status(code){status=code;return this;},json(){return this;}};
    await multi.guard(['admin'],[required])(req,res,()=>{next=true;});
    return {status,next};
  }
  assert.deepEqual(await call('orders.read','orders.write'),{status:403,next:false});
  assert.deepEqual(await call('catalog.read','orders.read'),{status:403,next:false});
  assert.deepEqual(await call('catalog.write','catalog.write'),{status:200,next:true});
  assert.deepEqual(await call('orders.read orders.write catalog.read catalog.write','orders.write'),
    {status:200,next:true});
});
