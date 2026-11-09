const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base='http://127.0.0.1:3100';
const reportBase=process.env.REPORT_URL||'http://127.0.0.1:3001';
const auditBase=process.env.AUDIT_URL||'http://127.0.0.1:3002';
async function token(role){
  return require('./real-tokens.cjs').token(role);
}
async function request(url,auth,method='GET',body){
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})});
  const text=await r.text();
  let data;try{data=JSON.parse(text);}catch{data=text;}
  assert.ok(r.ok,`${method} ${url}: ${r.status} ${text}`);return data;
}
async function main(){
  const cliente=await token('cliente'),operador=await token('operador'),admin=await token('admin');
  const list=await request(base+'/catalog',cliente);
  const product=list.items.find(p=>p.productId==='ELEC-USB');assert.ok(product);
  const created=await request(base+'/orders',cliente,'POST',{
    items:[{productId:product.productId,quantity:1}]});
  const order=created.item || created.order || created;
  assert.ok(order.orderId,`Respuesta sin orderId: ${JSON.stringify(created)}`);
  const id=order.orderId;
  for(const status of ['ACEPTADO','EN_PREPARACION','DESPACHADO','ENTREGADO'])
    await request(`${base}/orders/${id}/status`,operador,'PUT',{status});
  const own=await request(base+'/orders',cliente);
  assert.equal(own.items.find(p=>p.orderId===id)?.status,'ENTREGADO');
  const after=await request(base+'/catalog',admin);
  assert.equal(after.items.find(p=>p.productId===product.productId).stock,product.stock-1);
  const denied=await fetch(`${reportBase}/api/report/estados`,{headers:{Authorization:`Bearer ${cliente}`}});
  assert.equal(denied.status,403);
  let timeline;
  for(let i=0;i<100;i++){
    timeline=await request(`${auditBase}/api/audit/${encodeURIComponent(id)}`,admin);
    if(timeline.length===5) break;
    await new Promise(r=>setTimeout(r,200));
  }
  assert.equal(timeline.length,5,'Se esperan los cinco eventos en auditoría');
  const report=await request(`${reportBase}/api/report/lead-time`,admin);
  assert.ok(report.pedidos.some(p=>p.pedidoId===id),'Pedido no alcanzó reportes');
  for(const target of ['correo','bodega','boleta']){
    let found=false;
    for(let i=0;i<100 && !found;i++){
      const inbox=await request(`${base}/local/mailbox/${target}`,admin);
      found=inbox.some(x=>JSON.stringify(x.mensaje).includes(id));
      if(!found) await new Promise(r=>setTimeout(r,200));
    }
    assert.ok(found,`Falta trabajo SQS procesado: ${target}`);
  }
  const cancel=await request(base+'/orders',cliente,'POST',{
    items:[{productId:product.productId,quantity:1}]});
  const cancelId=(cancel.item||cancel.order||cancel).orderId;
  await request(`${base}/orders/${cancelId}/status`,operador,'PUT',{status:'ACEPTADO'});
  await request(`${base}/orders/${cancelId}/status`,operador,'PUT',{status:'CANCELADO'});
  const restored=await request(base+'/catalog',admin);
  assert.equal(restored.items.find(p=>p.productId===product.productId).stock,product.stock-1,
    'Cancelar debe devolver la reserva sin alterar el pedido ya entregado');
  const terminal=await fetch(`${base}/orders/${cancelId}/status`,{method:'PUT',
    headers:{Authorization:`Bearer ${operador}`,'Content-Type':'application/json'},body:JSON.stringify({status:'ACEPTADO'})});
  assert.ok([400,409].includes(terminal.status),'No reactivar un pedido cancelado');
  const forbidden=await fetch(`${base}/orders/${id}/status`,{method:'PUT',
    headers:{Authorization:`Bearer ${cliente}`,'Content-Type':'application/json'},body:JSON.stringify({status:'CANCELADO'})});
  assert.equal(forbidden.status,403,'Cliente no gestiona estados');
  const result={estado:'APROBADA',pedidoId:id,fecha:new Date().toISOString(),
    verificado:['API real del proyecto','access tokens Entra ID reales','roles','cinco estados','stock','reportes','auditoría',
      'tres colas SNS/SQS locales procesadas','cancelación y devolución de stock','estado terminal protegido']};
  const dir=path.resolve(__dirname,'../resultados');await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,`e2e-${Date.now()}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
